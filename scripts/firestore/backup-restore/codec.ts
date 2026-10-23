import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { open, link, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  Timestamp,
  GeoPoint,
  DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import { z } from "zod";

export const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
export const MAX_DOCUMENTS = 100_000;
export const NAMESPACE = "apps/chotcong";
const MAGIC = Buffer.from("CHOTCONG-BACKUP-1\n");
export function validPath(path: string) {
  const parts = path.split("/");
  return (
    (path === NAMESPACE || path.startsWith(`${NAMESPACE}/`)) &&
    parts.length % 2 === 0 &&
    parts.length <= 100 &&
    parts.every(
      (p) => p.length > 0 && p !== "." && p !== ".." && !/^__.*__$/.test(p),
    ) &&
    !["operations", "shareRateLimits"].includes(parts[2]) &&
    Buffer.byteLength(path) <= 6000
  );
}
// Every value is tagged: user fields named "type", "__proto__", etc. cannot
// collide with serialization metadata. Unsupported values fail before saving.
export type Value =
  | ["null"]
  | ["negative-zero"]
  | ["boolean", boolean]
  | ["string", string]
  | ["number", number]
  | ["timestamp", number, number]
  | ["bytes", string]
  | ["geo", number, number]
  | ["array", Value[]]
  | ["map", [string, Value][]];
export function encodeValue(value: unknown, depth = 0): Value {
  if (depth > 30) throw new Error("Backup nesting limit exceeded");
  if (value === null) return ["null"];
  if (typeof value === "boolean") return ["boolean", value];
  if (typeof value === "string") return ["string", value];
  if (typeof value === "number") {
    if (Object.is(value, -0)) return ["negative-zero"];
    if (
      !Number.isFinite(value) ||
      (Number.isInteger(value) && !Number.isSafeInteger(value))
    )
      throw new Error("Unsafe backup number");
    return ["number", value];
  }
  if (value instanceof Timestamp)
    return ["timestamp", value.seconds, value.nanoseconds];
  if (value instanceof GeoPoint)
    return ["geo", value.latitude, value.longitude];
  if (value instanceof Uint8Array)
    return ["bytes", Buffer.from(value).toString("base64")];
  // The SDK decodes references to relative paths, dropping the original
  // project/database. Refuse them rather than silently rebinding a reference.
  // Current business schemas store string IDs only.
  if (value instanceof DocumentReference)
    throw new Error("Qualified references need a migration before backup");
  if (Array.isArray(value))
    return ["array", value.map((v) => encodeValue(v, depth + 1))];
  if (
    value &&
    typeof value === "object" &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    return [
      "map",
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, encodeValue(v, depth + 1)]),
    ];
  throw new Error("Unsupported Firestore backup value");
}
export function decodeValue(raw: unknown, db: Firestore, depth = 0): unknown {
  if (depth > 30 || !Array.isArray(raw))
    throw new Error("Invalid backup value");
  const [tag, a, b] = raw;
  if (tag === "null" && raw.length === 1) return null;
  if (tag === "negative-zero" && raw.length === 1) return -0;
  if (raw.length === 2) {
    if (tag === "boolean" && typeof a === "boolean") return a;
    if (tag === "string" && typeof a === "string") return a;
    if (
      tag === "number" &&
      typeof a === "number" &&
      Number.isFinite(a) &&
      (!Number.isInteger(a) || Number.isSafeInteger(a))
    )
      return a;
    if (
      tag === "bytes" &&
      typeof a === "string" &&
      Buffer.from(a, "base64").toString("base64") === a
    )
      return Buffer.from(a, "base64");
    if (tag === "array" && Array.isArray(a))
      return a.map((v) => decodeValue(v, db, depth + 1));
    if (tag === "map" && Array.isArray(a)) {
      const keys = new Set<string>();
      const entries = a.map((pair) => {
        if (
          !Array.isArray(pair) ||
          pair.length !== 2 ||
          typeof pair[0] !== "string" ||
          keys.has(pair[0])
        )
          throw new Error("Invalid backup field");
        keys.add(pair[0]);
        return [pair[0], decodeValue(pair[1], db, depth + 1)];
      });
      return Object.fromEntries(entries);
    }
  }
  if (raw.length === 3 && typeof a === "number" && typeof b === "number") {
    if (tag === "timestamp" && Number.isInteger(a) && Number.isInteger(b))
      return new Timestamp(a, b);
    if (tag === "geo") return new GeoPoint(a, b);
  }
  throw new Error("Invalid backup value");
}
export const archiveSchema = z
  .object({
    format: z.literal("chotcong-firestore"),
    version: z.literal(1),
    kind: z.enum(["snapshot", "deletion-ledger"]),
    id: z.uuid(),
    sourceProjectId: z.string().regex(/^[a-z][a-z0-9-]{4,62}$/),
    databaseId: z.literal("(default)"),
    namespace: z.literal(NAMESPACE),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime(),
    documents: z
      .array(
        z
          .object({ path: z.string().refine(validPath), fields: z.unknown() })
          .strict(),
      )
      .max(MAX_DOCUMENTS),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (
      a.completedAt < a.startedAt ||
      new Set(a.documents.map((d) => d.path)).size !== a.documents.length
    )
      ctx.addIssue({ code: "custom", message: "Invalid backup manifest" });
    if (
      a.kind === "deletion-ledger" &&
      a.documents.some(
        (d) => !/^apps\/chotcong\/accountDeletions\/[a-f0-9]{64}$/.test(d.path),
      )
    )
      ctx.addIssue({ code: "custom", message: "Invalid deletion ledger" });
  });
export type Archive = z.infer<typeof archiveSchema>;
export function seal(archive: Archive, key: Buffer) {
  if (key.length !== 32)
    throw new Error("Backup key must contain exactly 32 bytes");
  archiveSchema.parse(archive);
  const raw = Buffer.from(JSON.stringify(archive));
  if (raw.length > MAX_ARCHIVE_BYTES)
    throw new Error("Backup exceeds 64 MiB; do not save a partial backup");
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(MAGIC);
  return Buffer.concat([
    MAGIC,
    iv,
    cipher.update(raw),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
}
export function unseal(bytes: Buffer, key: Buffer): Archive {
  if (
    key.length !== 32 ||
    bytes.length > MAX_ARCHIVE_BYTES + 128 ||
    bytes.length < MAGIC.length + 28 ||
    !bytes.subarray(0, MAGIC.length).equals(MAGIC)
  )
    throw new Error("Invalid encrypted backup");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    bytes.subarray(MAGIC.length, MAGIC.length + 12),
  );
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(bytes.subarray(-16));
  const raw = Buffer.concat([
    decipher.update(bytes.subarray(MAGIC.length + 12, -16)),
    decipher.final(),
  ]);
  return archiveSchema.parse(JSON.parse(raw.toString("utf8")));
}
// Create privately and publish atomically without replacing an existing archive.
// The caller must keep this directory outside the repository and separately
// protect/copy the key. Neither raw JSON nor a plaintext archive is written.
export async function writePrivateFile(path: string, data: Buffer) {
  const finalPath = resolve(path),
    temporary = resolve(
      dirname(finalPath),
      `.chotcong-${randomBytes(16).toString("hex")}.tmp`,
    );
  const handle = await open(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    0o600,
  );
  try {
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    await link(temporary, finalPath);
  } finally {
    await handle.close();
    await unlink(temporary);
  }
}
export async function readPrivateFile(
  path: string,
  maxBytes = MAX_ARCHIVE_BYTES + 128,
) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile() || (info.mode & 0o077) !== 0 || info.size > maxBytes)
      throw new Error("File must be private (0600) and within size limit");
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}
