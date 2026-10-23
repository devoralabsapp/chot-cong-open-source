import { randomBytes } from "node:crypto";
import { resolve, relative, isAbsolute } from "node:path";
import { realpath } from "node:fs/promises";
import { type Firestore } from "firebase-admin/firestore";
import { assertEmulators } from "../../emulator-guard";
import { admin } from "@/lib/firebase/admin";
import {
  MAX_ARCHIVE_BYTES,
  readPrivateFile,
  seal,
  unseal,
  writePrivateFile,
} from "./codec";
import { capture, pause, release } from "./snapshot";
import { restoreRehearsal } from "./restore";

let ownedDb: Firestore | undefined;
async function main() {
  // Independent of the npm wrapper; rejects cloud IDs/hosts before any SDK I/O.
  assertEmulators();
  const [command, ...args] = process.argv.slice(2);
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    if (!/^--[a-z-]+$/.test(args[i]) || !args[i + 1] || options.has(args[i]))
      throw new Error("Invalid options");
    options.set(args[i], args[i + 1]);
  }
  const option = (name: string) => {
    const value = options.get(`--${name}`);
    if (!value) throw new Error(`Missing ${name}`);
    return value;
  };
  const known: Record<string, string[]> = {
    keygen: ["--out"],
    create: ["--key", "--out"],
    ledger: ["--key", "--out"],
    verify: ["--key", "--input"],
    restore: ["--key", "--input", "--ledger"],
    release: ["--lock"],
  };
  if (
    !known[command] ||
    [...options.keys()].some((k) => !known[command].includes(k))
  )
    throw new Error("Unknown command/option");
  // Refuse files inside the checkout, even if ignored. Check real parent paths
  // to prevent a symlinked directory from bypassing this boundary.
  async function external(path: string) {
    const absolute = resolve(path),
      parent = await realpath(resolve(absolute, ".."));
    const project = await realpath(resolve(import.meta.dirname, "../../.."));
    const rel = relative(project, parent);
    if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel)))
      throw new Error("Use a private directory outside the repository");
    return absolute;
  }
  if (command === "keygen") {
    await writePrivateFile(await external(option("out")), randomBytes(32));
    console.info(JSON.stringify({ event: "backup.key.created", bytes: 32 }));
    return;
  }
  const db = (ownedDb = admin().db);
  if (command === "release") {
    const id = option("lock");
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid lock");
    await release(db, id);
    console.info(JSON.stringify({ event: "backup.maintenance.released" }));
    return;
  }
  const key = await readPrivateFile(await external(option("key")), 32);
  if (key.length !== 32) throw new Error("Invalid backup key");
  if (command === "verify" || command === "restore") {
    const snapshot = unseal(
      await readPrivateFile(
        await external(option("input")),
        MAX_ARCHIVE_BYTES + 128,
      ),
      key,
    );
    if (command === "verify") {
      console.info(
        JSON.stringify({
          event: "backup.verified",
          kind: snapshot.kind,
          documents: snapshot.documents.length,
        }),
      );
      return;
    }
    const ledger = unseal(
      await readPrivateFile(await external(option("ledger"))),
      key,
    );
    console.info(
      JSON.stringify({
        event: "backup.restore.rehearsed",
        ...(await restoreRehearsal(snapshot, ledger, (completed, total) => {
          console.info(
            JSON.stringify({
              event: "backup.restore.progress",
              completed,
              total,
            }),
          );
        })),
      }),
    );
    return;
  }
  const output = await external(option("out"));
  const lockId = await pause(db, "backup");
  console.info(JSON.stringify({ event: "backup.started", lockId }));
  try {
    const archive = await capture(
      db,
      lockId,
      command === "ledger" ? "deletion-ledger" : "snapshot",
    );
    await writePrivateFile(output, seal(archive, key));
    console.info(
      JSON.stringify({
        event: "backup.saved",
        kind: archive.kind,
        documents: archive.documents.length,
      }),
    );
  } finally {
    await release(db, lockId);
  }
}
main()
  .catch(() => {
    console.error(
      "Backup command failed. No secrets were logged. Inspect maintenance and follow docs/BACKUP_RESTORE.md before retrying.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await ownedDb?.terminate().catch(() => {});
  });
