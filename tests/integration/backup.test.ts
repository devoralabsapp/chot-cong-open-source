import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Firestore, GeoPoint, Timestamp } from "firebase-admin/firestore";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { admin } from "@/lib/firebase/admin";
import { vietnamToday } from "@/domain";
import { advanceDeletion, startDeletion } from "@/lib/server/account-deletion";
import { accountControlRef } from "@/lib/server/account-access";
import { maintenanceRef } from "@/lib/server/maintenance";
import { ensureProfile } from "@/lib/server/repository";
import {
  capture,
  pause,
  release,
} from "../../scripts/firestore/backup-restore/snapshot";
import { restoreRehearsal } from "../../scripts/firestore/backup-restore/restore";
import {
  decodeValue,
  encodeValue,
  seal,
  unseal,
  writePrivateFile,
  type Archive,
} from "../../scripts/firestore/backup-restore/codec";
import { client, googleToken, origin } from "./helpers";
const exec = promisify(execFile);
describe("Diễn tập backup/restore trên hai project Emulator tách biệt", () => {
  const db = admin().db;
  const target = new Firestore({
    projectId: "demo-chotcong-restore",
    host: process.env.FIRESTORE_EMULATOR_HOST!,
    ssl: false,
  });
  let a: Awaited<ReturnType<typeof client>>,
    ta: Awaited<ReturnType<typeof googleToken>>,
    tb: Awaited<ReturnType<typeof googleToken>>;
  let studentId: string,
    statementId: string,
    token: string,
    snapshot: Archive,
    ledger: Archive;
  const root = () => `apps/chotcong/users/${ta.uid}`;
  const captureWithPause = async (kind: Archive["kind"]) => {
    const id = await pause(db, "backup");
    try {
      return await capture(db, id, kind);
    } finally {
      await release(db, id);
    }
  };
  const finish = async (proof: string) => {
    for (let i = 0; i < 15; i++)
      if ((await advanceDeletion(proof)).phase === "done") return;
    throw new Error("Deletion did not finish");
  };
  beforeAll(async () => {
    await db.recursiveDelete(db.doc("apps/chotcong"));
    await target.recursiveDelete(target.doc("apps/chotcong"));
    ta = await googleToken();
    tb = await googleToken();
    a = await client();
    const b = await client();
    await a.login(ta.idToken);
    await b.login(tb.idToken);
    studentId = (
      await (
        await a.call("/api/students", "POST", {
          displayName: "Lan diễn tập",
          defaultRateVnd: 200000,
        })
      ).json()
    ).id;
    const ids: string[] = [];
    for (let day = 1; day <= 8; day++)
      ids.push(
        (
          await (
            await a.call("/api/sessions", "POST", {
              studentId,
              sessionDate: `2026-10-0${day}`,
              status: "completed",
              billable: true,
            })
          ).json()
        ).id,
      );
    statementId = (
      await (
        await a.call("/api/statements", "POST", {
          studentId,
          periodStart: "2026-10-01",
          periodEnd: "2026-10-31",
          dueDate: vietnamToday(),
          sessionIds: ids,
        })
      ).json()
    ).id;
    expect(
      (
        await a.call(`/api/statements/${statementId}/issue`, "POST", {
          version: 1,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await a.call(`/api/statements/${statementId}/payments`, "POST", {
          amountVnd: 1000000,
          receivedDate: vietnamToday(),
          method: "transfer",
        })
      ).status,
    ).toBe(200);
    const preview = await (
      await a.call(`/api/statements/${statementId}/public-preview`)
    ).json();
    const link = await (
      await a.call(`/api/statements/${statementId}/share`, "POST", {
        version: preview.version,
        previewHash: preview.previewHash,
      })
    ).json();
    expect(link.token).toBeTypeOf("string");
    token = link.token;
    const student = (
        await db.doc(`${root()}/students/${studentId}`).get()
      ).data()!,
      batch = db.batch();
    for (let i = 0; i < 111; i++)
      batch.create(db.doc(`${root()}/students/page-${i}`), {
        ...student,
        displayName: `Học viên giả ${i}`,
      });
    await batch.commit();
    await db.doc(`${root()}/future/missing/deep/example`).set({
      schemaVersion: 1,
      createdAt: new Timestamp(1700000000, 123456000),
      bytes: Buffer.from([0, 255]),
      geo: new GeoPoint(10, 106),
      refPath: `${root()}/students/${studentId}`,
    });
  }, 60000);
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await maintenanceRef(db).delete();
    await target.terminate();
  });
  it("chặn HTTP/transaction/đăng nhập/xóa và public link khi đóng ghi; snapshot bao gồm trang sau và orphan", async () => {
    const id = await pause(db, "backup");
    try {
      await maintenanceRef(db).update({ createdAt: Timestamp.fromMillis(1) }); // no automatic timeout reopening writes
      expect((await a.call("/api/summary")).status).toBe(503);
      expect(
        (
          await a.call("/api/students", "POST", {
            displayName: "Không được ghi",
            defaultRateVnd: 1,
          })
        ).status,
      ).toBe(503);
      expect(
        (await a.call("/api/auth/session", "POST", { idToken: ta.idToken }))
          .status,
      ).toBe(503);
      await expect(ensureProfile(ta.uid, "Đổi tên", null)).rejects.toThrow(
        "bảo trì",
      );
      await expect(startDeletion(tb.uid, randomUUID())).rejects.toThrow(
        "bảo trì",
      );
      const response = await fetch(origin + "/api/share/resolve", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      expect(response.status).toBe(404);
      await expect(release(db, randomUUID())).rejects.toThrow();
      snapshot = await capture(db, id);
      expect(snapshot.documents.length).toBeGreaterThan(130);
      expect(
        snapshot.documents.some((d) =>
          d.path.endsWith("/future/missing/deep/example"),
        ),
      ).toBe(true);
      expect(
        snapshot.documents.some((d) => d.path.endsWith("/students/page-110")),
      ).toBe(true);
      expect(
        snapshot.documents.some((d) => d.path.includes("/shareRateLimits/")),
      ).toBe(false);
    } finally {
      await release(db, id);
    }
    expect((await a.call("/api/summary")).status).toBe(200);
  });
  it("không đóng ghi khi còn worker xóa, kể cả lease cũ; ledger mới giữ dấu xóa sau snapshot", async () => {
    const proof = await startDeletion(tb.uid, randomUUID()),
      ref = accountControlRef(tb.uid);
    await ref.update({
      leaseId: randomUUID(),
      leaseUntil: Timestamp.fromMillis(Date.now() - 10000),
    });
    await expect(pause(db, "backup")).rejects.toThrow("deletion worker");
    expect((await maintenanceRef(db).get()).exists).toBe(false);
    await ref.update({ leaseId: null, leaseUntil: null });
    await finish(proof);
    ledger = await captureWithPause("deletion-ledger");
    expect(ledger.documents.length).toBe(1);
    await expect(admin().auth.getUser(tb.uid)).rejects.toMatchObject({
      code: "auth/user-not-found",
    });
    await db
      .doc(`${root()}/students/${studentId}`)
      .update({ defaultRateVnd: 250000 });
  });
  it("CLI phục hồi bản mã hóa: 8 × 200.000đ, đã thu 1.000.000đ; giữ kiểu/ID và không hồi sinh link/tài khoản", async () => {
    const directory = await mkdtemp(join(tmpdir(), "chotcong-restore-")),
      key = randomBytes(32);
    try {
      const files = [
        join(directory, "key.cckey"),
        join(directory, "snapshot.ccbackup"),
        join(directory, "ledger.ccbackup"),
      ];
      await writePrivateFile(files[0], key);
      await writePrivateFile(files[1], seal(snapshot, key));
      await writePrivateFile(files[2], seal(ledger, key));
      const result = await exec(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "scripts/firestore/backup-restore/cli.ts",
          "restore",
          "--key",
          files[0],
          "--input",
          files[1],
          "--ledger",
          files[2],
        ],
        { env: process.env, timeout: 60000 },
      );
      expect(
        JSON.parse(result.stdout.trim().split("\n").at(-1)!),
      ).toMatchObject({
        event: "backup.restore.rehearsed",
        issued: 1,
        totalVnd: 1600000,
        paidVnd: 1000000,
        outstandingVnd: 600000,
        deletedAccounts: 1,
      });
      expect(
        (await target.doc(`${root()}/students/${studentId}`).get()).get(
          "defaultRateVnd",
        ),
      ).toBe(200000);
      expect(
        (await target.doc(`${root()}/statements/${statementId}`).get()).get(
          "activeShareTokenHash",
        ),
      ).toBeNull();
      expect(
        (await target.collection("apps/chotcong/shareTokens").get()).empty,
      ).toBe(true);
      expect(
        (await target.doc(`apps/chotcong/users/${tb.uid}`).get()).exists,
      ).toBe(false);
      const extra = (
        await target.doc(`${root()}/future/missing/deep/example`).get()
      ).data()!;
      expect(extra.createdAt.nanoseconds).toBe(123456000);
      expect(extra.bytes).toEqual(Buffer.from([0, 255]));
      expect(extra.geo.isEqual(new GeoPoint(10, 106))).toBe(true);
      expect(extra.refPath).toBe(`${root()}/students/${studentId}`);
      expect((await maintenanceRef(target).get()).exists).toBe(false);
      await expect(admin().auth.getUser(tb.uid)).rejects.toMatchObject({
        code: "auth/user-not-found",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 60000);
  it("từ chối target có dữ liệu, ledger cũ và sổ tiền lệch trước khi ghi", async () => {
    await expect(restoreRehearsal(snapshot, ledger)).rejects.toThrow("empty");
    await target.recursiveDelete(target.doc("apps/chotcong"));
    await expect(
      restoreRehearsal(snapshot, { ...ledger, startedAt: snapshot.startedAt }),
    ).rejects.toThrow("post-snapshot");
    const key = randomBytes(32),
      bad = unseal(seal(snapshot, key), key);
    const statement = bad.documents.find((d) =>
      d.path.endsWith(`/statements/${statementId}`),
    )!;
    statement.fields = encodeValue({
      ...(decodeValue(statement.fields, target) as object),
      paidVnd: 900000,
    });
    await expect(restoreRehearsal(bad, ledger)).rejects.toThrow(
      "reconciliation",
    );
    expect((await maintenanceRef(target).get()).exists).toBe(false);
    expect((await target.collection("apps/chotcong/users").get()).empty).toBe(
      true,
    );
  });
  it("giữ khóa khi lỗi giữa các batch; retry ghép dấu xóa mới và dọn dữ liệu đã phục hồi dở", async () => {
    await expect(
      restoreRehearsal(snapshot, ledger, () => {
        throw new Error("Simulated interruption after a committed batch");
      }),
    ).rejects.toThrow("Simulated interruption");
    expect((await maintenanceRef(target).get()).get("kind")).toBe("restore");
    expect((await target.collection(`${root()}/students`).get()).empty).toBe(
      false,
    );
    vi.restoreAllMocks();
    await finish(await startDeletion(ta.uid, randomUUID()));
    const freshLedger = await captureWithPause("deletion-ledger");
    expect(await restoreRehearsal(snapshot, freshLedger)).toMatchObject({
      issued: 0,
      outstandingVnd: 0,
      deletedAccounts: 2,
    });
    expect((await target.doc(root()).get()).exists).toBe(false);
    expect((await target.collection(`${root()}/students`).get()).empty).toBe(
      true,
    );
    expect(
      (await target.collection("apps/chotcong/accountDeletions").get()).size,
    ).toBe(2);
    expect((await maintenanceRef(target).get()).exists).toBe(false);
  });
});
