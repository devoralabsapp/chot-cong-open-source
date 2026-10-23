import { randomUUID } from "node:crypto";
import {
  Timestamp,
  type Firestore,
  type DocumentReference,
} from "firebase-admin/firestore";
import { assertEmulators } from "../../emulator-guard";
import { maintenanceRef } from "@/lib/server/maintenance";
import {
  archiveSchema,
  encodeValue,
  MAX_ARCHIVE_BYTES,
  MAX_DOCUMENTS,
  NAMESPACE,
  validPath,
  type Archive,
} from "./codec";

// No timeout automatically reopens writes. A killed operator must inspect and
// explicitly release the same lock. An active deletion (even an expired lease)
// prevents pausing: recursiveDelete/Auth work happens outside its claim tx.
export async function pause(
  db: Firestore,
  kind: "backup" | "restore",
  archiveId?: string,
) {
  const id = randomUUID(),
    ref = maintenanceRef(db);
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) {
      if (
        kind === "restore" &&
        existing.get("kind") === kind &&
        existing.get("archiveId") === archiveId
      )
        return existing.get("id") as string;
      throw new Error("Maintenance is already active; inspect before resuming");
    }
    const running = await tx.get(
      db
        .collection(`${NAMESPACE}/accountDeletions`)
        .where("leaseUntil", ">", Timestamp.fromMillis(0))
        .limit(1),
    );
    if (!running.empty)
      throw new Error(
        "Finish/recover the active deletion worker before backup",
      );
    tx.create(ref, {
      id,
      kind,
      archiveId: archiveId ?? null,
      createdAt: Timestamp.now(),
      schemaVersion: 1,
    });
    return id;
  });
}
export async function release(db: Firestore, id: string, allowRestore = false) {
  await db.runTransaction(async (tx) => {
    const ref = maintenanceRef(db),
      doc = await tx.get(ref);
    if (
      !doc.exists ||
      doc.get("id") !== id ||
      (!allowRestore && doc.get("kind") !== "backup")
    )
      throw new Error(
        "Maintenance ownership mismatch; restore requires successful verification",
      );
    tx.delete(ref);
  });
}
export async function assertPaused(db: Firestore, lockId: string) {
  if ((await maintenanceRef(db).get()).get("id") !== lockId)
    throw new Error("Maintenance lock lost; discard incomplete backup");
}
// listDocuments uses the SDK's paginated name listing and includes missing
// parent documents; payloads are fetched in bounded pages of 100. Walking only
// ordinary queries would silently miss orphan descendants.
export async function walkNamespace(
  db: Firestore,
  visit: (path: string, data: FirebaseFirestore.DocumentData) => Promise<void>,
) {
  let visited = 0;
  async function walk(
    ref: DocumentReference,
    supplied?: FirebaseFirestore.DocumentSnapshot,
  ) {
    if (++visited > MAX_DOCUMENTS)
      throw new Error("Namespace traversal limit exceeded");
    const doc = supplied ?? (await ref.get());
    if (doc.exists) await visit(ref.path, doc.data()!);
    for (const collection of await ref.listCollections()) {
      if (
        ref.path === NAMESPACE &&
        ["operations", "shareRateLimits"].includes(collection.id)
      )
        continue;
      const refs = await collection.listDocuments();
      if (refs.length + visited > MAX_DOCUMENTS)
        throw new Error("Namespace traversal limit exceeded");
      for (let offset = 0; offset < refs.length; offset += 100) {
        const page = await db.getAll(...refs.slice(offset, offset + 100));
        for (const child of page) await walk(child.ref, child);
      }
    }
  }
  await walk(db.doc(NAMESPACE));
}
export async function capture(
  db: Firestore,
  lockId: string,
  kind: Archive["kind"] = "snapshot",
): Promise<Archive> {
  assertEmulators();
  await assertPaused(db, lockId);
  const startedAt = new Date().toISOString(),
    documents: Archive["documents"] = [];
  let bytes = 0;
  await walkNamespace(db, async (path, data) => {
    if (!validPath(path)) throw new Error("Unexpected backup path");
    if (
      kind === "deletion-ledger" &&
      !/^apps\/chotcong\/accountDeletions\/[a-f0-9]{64}$/.test(path)
    )
      return;
    const record = { path, fields: encodeValue(data) };
    bytes += Buffer.byteLength(JSON.stringify(record));
    if (bytes > MAX_ARCHIVE_BYTES - 4096)
      throw new Error("Backup exceeds 64 MiB");
    documents.push(record);
  });
  await assertPaused(db, lockId);
  return archiveSchema.parse({
    format: "chotcong-firestore",
    version: 1,
    kind,
    id: randomUUID(),
    sourceProjectId: "demo-chotcong",
    databaseId: db.databaseId,
    namespace: NAMESPACE,
    startedAt,
    completedAt: new Date().toISOString(),
    documents: documents.sort((a, b) => a.path.localeCompare(b.path)),
  });
}
