import { assertEmulators } from "../../emulator-guard";
import { randomBytes } from "node:crypto";
import { Firestore } from "firebase-admin/firestore";
import { deletionJobSchema } from "@/lib/server/account-deletion";
import {
  archiveSchema,
  decodeValue,
  encodeValue,
  NAMESPACE,
  type Archive,
} from "./codec";
import { admin } from "@/lib/firebase/admin";
import { maintenanceRef } from "@/lib/server/maintenance";
import {
  assertPaused,
  capture,
  pause,
  release,
  walkNamespace,
} from "./snapshot";
import { reconcile, uidHash, type RecordData } from "./reconcile";

function decode(archive: Archive, db: Firestore): RecordData[] {
  archiveSchema.parse(archive);
  return archive.documents.map((d) => {
    const data = decodeValue(d.fields, db);
    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      !Array.isArray(d.fields) ||
      d.fields[0] !== "map"
    )
      throw new Error("Backup document must be a map");
    return { path: d.path, data: data as FirebaseFirestore.DocumentData };
  });
}
function controls(records: RecordData[]) {
  const map = new Map<string, RecordData>();
  for (const record of records) {
    if (record.path.split("/")[2] !== "accountDeletions") continue;
    if (!/^apps\/chotcong\/accountDeletions\/[a-f0-9]{64}$/.test(record.path))
      throw new Error("Unexpected deletion control path");
    const job = deletionJobSchema.parse(record.data),
      id = record.path.split("/")[3];
    if (job.ownerUid && uidHash(job.ownerUid) !== id)
      throw new Error("Deletion control ownership mismatch");
    if (job.phase === "done" && job.ownerUid !== null)
      throw new Error("Invalid completed deletion");
    const previous = map.get(id);
    // Completion is permanent, even if an older snapshot has a later clock.
    if (
      !previous ||
      (previous.data.phase !== "done" &&
        (job.phase === "done" ||
          job.updatedAt.toMillis() >= previous.data.updatedAt.toMillis()))
    )
      map.set(id, record);
  }
  return map;
}
// Intentionally has no cloud restore mode: only the isolated rehearsal project.
// Never rebuild Firebase Auth users or import production identities/passwords.
export async function restoreRehearsal(
  snapshot: Archive,
  ledger: Archive,
  onProgress: (completed: number, total: number) => void = () => {},
) {
  assertEmulators();
  const db = new Firestore({
    projectId: "demo-chotcong-restore",
    host: process.env.FIRESTORE_EMULATOR_HOST!,
    ssl: false,
  });
  const source = admin().db;
  let sourceLock: string | undefined;
  try {
    sourceLock = await pause(source, "backup");
    // Close the gap between saving the ledger file and starting the restore.
    // Keep source writes/deletion blocked until target verification finishes.
    const liveLedger = await capture(source, sourceLock, "deletion-ledger");
    return await restoreIntoEmptyTarget(
      db,
      snapshot,
      ledger,
      liveLedger,
      onProgress,
    );
  } finally {
    try {
      if (sourceLock) await release(source, sourceLock);
    } finally {
      await db.terminate();
    }
  }
}
async function restoreIntoEmptyTarget(
  db: Firestore,
  snapshot: Archive,
  ledger: Archive,
  liveLedger: Archive,
  onProgress: (completed: number, total: number) => void,
) {
  if (
    snapshot.kind !== "snapshot" ||
    ledger.kind !== "deletion-ledger" ||
    snapshot.sourceProjectId !== "demo-chotcong" ||
    ledger.sourceProjectId !== snapshot.sourceProjectId ||
    ledger.startedAt < snapshot.completedAt ||
    Date.now() - Date.parse(ledger.completedAt) > 86400000 ||
    Date.parse(ledger.completedAt) > Date.now() + 300000
  )
    throw new Error(
      "A fresh post-snapshot deletion ledger from the source is required",
    );
  const source = decode(snapshot, db),
    latest = decode(ledger, db);
  const current: RecordData[] = [];
  await walkNamespace(db, async (path, data) => {
    current.push({ path, data });
  });
  const lock = await maintenanceRef(db).get();
  const retry =
    lock.exists &&
    lock.get("kind") === "restore" &&
    lock.get("archiveId") === snapshot.id;
  if (
    !retry &&
    current.some((d) => d.path.split("/")[2] !== "accountDeletions")
  )
    throw new Error(
      "Restore target must be empty; never overwrite an existing application",
    );
  const deleted = controls([
    ...source,
    ...latest,
    ...current,
    ...decode(liveLedger, db),
  ]);
  const records = source
    .filter(({ path }) => {
      const p = path.split("/");
      return (
        !["shareTokens", "accountDeletions"].includes(p[2]) &&
        !(
          p[2] === "users" &&
          (deleted.has(uidHash(p[3])) || p[4] === "dataExports")
        )
      );
    })
    .map((record) => {
      const p = record.path.split("/");
      if (p[2] === "users" && p[4] === "statements" && p.length === 6)
        return {
          ...record,
          data: { ...record.data, activeShareTokenHash: null },
        };
      return record;
    });
  const expected = reconcile(records); // Fail before any write for bad source financial data.
  const lockId = await pause(db, "restore", snapshot.id);
  // Any failure below keeps maintenance active. Rerunning the SAME archive is
  // safe; a new, fresher deletion ledger can remove users from a partial restore.
  for (const { path } of current) {
    const p = path.split("/");
    if (p[2] === "users" && deleted.has(uidHash(p[3])))
      await db.recursiveDelete(db.doc(p.slice(0, 4).join("/")));
    if (p[2] === "shareTokens") await db.doc(path).delete();
  }
  for (const record of deleted.values()) {
    const data = {
      ...record.data,
      leaseId: null,
      leaseUntil: null,
      proofHash: randomBytes(32).toString("hex"),
    };
    records.push({ path: record.path, data });
  }
  for (let offset = 0; offset < records.length; offset += 100) {
    await assertPaused(db, lockId);
    const batch = db.batch();
    for (const record of records.slice(offset, offset + 100))
      batch.set(db.doc(record.path), record.data);
    await batch.commit();
    onProgress(Math.min(offset + 100, records.length), records.length);
  }
  const restored: RecordData[] = [];
  await walkNamespace(db, async (path, data) => {
    restored.push({ path, data });
  });
  const actual = reconcile(restored);
  const expectedFields = new Map(
    records.map((r) => [r.path, JSON.stringify(encodeValue(r.data))]),
  );
  if (
    restored.some(
      (r) => expectedFields.get(r.path) !== JSON.stringify(encodeValue(r.data)),
    )
  )
    throw new Error(
      "Restored fields differ from archive; maintenance remains active",
    );
  if (
    JSON.stringify(actual) !== JSON.stringify(expected) ||
    restored.length !== records.length ||
    restored.some(
      (r) =>
        r.path.startsWith(`${NAMESPACE}/shareTokens/`) ||
        (r.path.startsWith(`${NAMESPACE}/users/`) &&
          deleted.has(uidHash(r.path.split("/")[3]))),
    )
  )
    throw new Error("Restore verification failed; maintenance remains active");
  await assertPaused(db, lockId);
  await release(db, lockId, true);
  return {
    documents: restored.length,
    deletedAccounts: deleted.size,
    ...actual,
  };
}
