import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, stat, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { Timestamp, GeoPoint, Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import {
  archiveSchema,
  decodeValue,
  encodeValue,
  readPrivateFile,
  seal,
  unseal,
  validPath,
  writePrivateFile,
  type Archive,
} from "../../scripts/firestore/backup-restore/codec";
const db = new Firestore({ projectId: "demo-chotcong" });
const example = (): Archive => ({
  format: "chotcong-firestore",
  version: 1,
  kind: "snapshot",
  id: randomUUID(),
  sourceProjectId: "demo-chotcong",
  databaseId: "(default)",
  namespace: "apps/chotcong",
  startedAt: "2026-10-16T00:00:00.000Z",
  completedAt: "2026-10-16T00:00:01.000Z",
  documents: [
    {
      path: "apps/chotcong/users/teacher",
      fields: encodeValue({ schemaVersion: 1, name: "Cô Hà" }),
    },
  ],
});
describe("Backup codec, mã hóa và ranh giới tệp", () => {
  it("giữ Timestamp đến nanosecond, bytes, GeoPoint và tên trường không đụng metadata", () => {
    const value = Object.fromEntries([
      ["__proto__", { type: "timestamp" }],
      [
        "data",
        [
          null,
          true,
          "Tiếng Việt",
          1600000,
          -0,
          new Timestamp(1700000000, 123456789),
          Buffer.from([0, 255]),
          new GeoPoint(10, 106),
        ],
      ],
    ]);
    const encoded = encodeValue(value),
      decoded = decodeValue(JSON.parse(JSON.stringify(encoded)), db);
    expect(encodeValue(decoded)).toEqual(encoded);
    expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
    expect({}.hasOwnProperty.call(decoded, "__proto__")).toBe(true);
    for (const bad of [
      undefined,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
      new Date(),
      db.doc("other/app"),
      db.doc("apps/chotcong/users/teacher"),
    ])
      expect(() => encodeValue(bad)).toThrow();
    for (const bad of [
      ["timestamp", 0, -1],
      ["reference", "other/app"],
      ["reference", "apps/chotcong/users/teacher"],
      [
        "map",
        [
          ["a", ["null"]],
          ["a", ["null"]],
        ],
      ],
      ["bytes", "invalid!"],
    ])
      expect(() => decodeValue(bad, db)).toThrow();
  });
  it("AES-256-GCM từ chối sai key/can thiệp/cắt file và manifest sai namespace/trùng đường dẫn", () => {
    const key = randomBytes(32),
      archive = example(),
      bytes = seal(archive, key);
    expect(unseal(bytes, key)).toEqual(archive);
    expect(bytes.includes(Buffer.from("Cô Hà"))).toBe(false);
    const changed = Buffer.from(bytes);
    changed[changed.length - 20] ^= 1;
    for (const bad of [changed, bytes.subarray(0, -1), Buffer.from("raw JSON")])
      expect(() => unseal(bad, key)).toThrow();
    expect(() => unseal(bytes, randomBytes(32))).toThrow();
    expect(() =>
      archiveSchema.parse({
        ...archive,
        documents: [...archive.documents, ...archive.documents],
      }),
    ).toThrow();
    expect(() =>
      archiveSchema.parse({ ...archive, kind: "deletion-ledger" }),
    ).toThrow();
    for (const path of [
      "apps/other/users/a",
      "apps/chotcong/operations/maintenance",
      "apps/chotcong/shareRateLimits/a",
      "apps/chotcong/users/../students/a",
      "apps/chotcong/users/a/students",
    ])
      expect(validPath(path)).toBe(false);
  });
  it("ghi atomically 0600, không ghi đè và từ chối file có quyền đọc rộng", async () => {
    const directory = await mkdtemp(join(tmpdir(), "chotcong-backup-unit-")),
      path = join(directory, "sample.ccbackup");
    try {
      await writePrivateFile(path, Buffer.from("encrypted-only"));
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      await expect(
        writePrivateFile(path, Buffer.from("replacement")),
      ).rejects.toThrow();
      expect((await readPrivateFile(path)).toString()).toBe("encrypted-only");
      await chmod(path, 0o644);
      await expect(readPrivateFile(path)).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it.each(["cloud", "remote-host"])(
    "CLI từ chối %s trước mọi SDK I/O",
    (mode) => {
      const result = spawnSync(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "scripts/firestore/backup-restore/cli.ts",
          "restore",
        ],
        {
          env: {
            ...process.env,
            FIREBASE_PROJECT_ID:
              mode === "cloud" ? "your-firebase-project" : "demo-chotcong",
            NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-chotcong",
            NEXT_PUBLIC_FIREBASE_USE_EMULATORS: "true",
            FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
            FIRESTORE_EMULATOR_HOST:
              mode === "remote-host" ? "example.com:8180" : "127.0.0.1:8180",
          },
          encoding: "utf8",
          timeout: 10000,
        },
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Backup command failed");
      expect(result.stderr).not.toContain("private_key");
    },
  );
});
