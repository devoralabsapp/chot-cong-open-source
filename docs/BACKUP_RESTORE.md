# Local backup and restore rehearsal

**English** | [Tiếng Việt](BACKUP_RESTORE.vi.md)

## Status and scope

The tool is **Emulator-only**, with no cloud mode or public backup endpoint. Its source is fixed to `demo-chotcong` and its target to `demo-chotcong-restore` on the same loopback Firestore Emulator. Independent guards reject real projects and remote hosts before SDK I/O. The backend includes maintenance locking; the local rehearsal does not activate production maintenance.

**There is no production backup, daily schedule, long-term storage, retention policy, or cloud restore rehearsal.** `/tmp` is for fake data only. GitHub artifacts, user CSV/ZIP exports, and Emulator exports do not replace production backups. Each self-hosting operator needs a backup/retention strategy before storing real data.

## Format and data

- Version 1 `.ccbackup` files contain a manifest with source project/database/namespace, snapshot/ledger type, start/end timestamps, UUID, and documents. Files are uncompressed and limited to 64 MiB/100,000 document locations; exceeding a limit fails rather than producing an incomplete archive.
- AES-256-GCM uses a random 32-byte key, a fresh IV per file, and authenticated header data. Incorrect keys, modified bytes, and truncated files are rejected. A `.cckey` is an application backup encryption key, not a Google service-account key. Store it separately: recovery is impossible without it. Plaintext is not written to disk or logs.
- New files use mode 0600 and are published through an atomic link without overwriting. The CLI requires paths outside the checkout and rejects symlinks or files with broad read permissions. Operators must protect directories/keys; encryption does not replace access control or retention.
- The codec preserves maps, arrays, primitives, Timestamp seconds/nanoseconds, bytes, and GeoPoint. Business schemas use string IDs. DocumentReference is rejected because SDK-relative paths do not safely preserve the original project/database for migration. Unsupported types, non-finite numbers, and unsafe integers are rejected. Firestore stores timestamps at microsecond precision; the codec preserves SDK values.
- Traversal includes missing parent documents and unknown subcollections. SDK name listings are paginated; content reads are limited to 100 documents at a time. This includes students, sessions, statements, payments, audit, counters, operationRequests, shareTokens, accountDeletions, and additional namespace descendants.
- `operations` locks and temporary `shareRateLimits` counters are excluded. Snapshots include dataExports, but restores discard old export jobs because their readTime cannot be reused in the target database.
- **Firebase Auth, passwords, credentials, and IAM/Rules/index configuration are not exported or restored.** Configuration source remains in Git. This is an application Firestore backup, not a complete recovery strategy for losing Firebase/Auth. Establish the incident scope and UID/Auth mapping before designing cloud recovery.

## Consistency and maintenance

`apps/chotcong/operations/maintenance` is a durable lock with no automatic TTL release. Business transactions, profile creation, link issuance, and deletion job start/claim operations read it before writing. Private APIs return 503 while preserving form data; public links return a generic unavailable screen. Rate counters continue and are excluded from snapshots.

Acquiring the lock also reads deletion jobs with leaseUntil greater than the epoch in a transaction. Deletions, including expired leases, must be completed or recovered first, avoiding a snapshot while recursiveDelete/Auth workers run outside transactions. With writers stopped, data remains unchanged during traversal without depending on historical readTime limits.

All backend instances must run code that honors the lock. Other Admin SDK, Console, seed, and migration writers can bypass application guards and must be stopped by the operator. A namespace is not an IAM boundary in a shared project.

Successful backups and ordinary failures release their own lock. A killed process may leave a lock behind: inspect it, confirm no job is running, and locate/remove unpublished temporary files before using the release command below. Never delete `accountDeletions` to reopen writes.

## Running the local rehearsal

Use Node 24, running emulators as described in the README, a demo/loopback `.env.local`, and fake data. In another terminal:

```bash
mkdir -m 700 /tmp/chotcong-backup-rehearsal
npm run backup:local -- keygen --out /tmp/chotcong-backup-rehearsal/recovery.cckey
npm run backup:local -- create --key /tmp/chotcong-backup-rehearsal/recovery.cckey --out /tmp/chotcong-backup-rehearsal/snapshot.ccbackup
npm run backup:local -- verify --key /tmp/chotcong-backup-rehearsal/recovery.cckey --input /tmp/chotcong-backup-rehearsal/snapshot.ccbackup
npm run backup:local -- ledger --key /tmp/chotcong-backup-rehearsal/recovery.cckey --out /tmp/chotcong-backup-rehearsal/deletions.ccbackup
npm run backup:local -- restore --key /tmp/chotcong-backup-rehearsal/recovery.cckey --input /tmp/chotcong-backup-rehearsal/snapshot.ccbackup --ledger /tmp/chotcong-backup-rehearsal/deletions.ccbackup
```

`verify` checks encryption and the manifest; **restore performs full codec and financial reconciliation**. The target must be empty except for retained deletion markers. The tool does not overwrite a completed restore. Stop and investigate unfamiliar target data instead of deleting it to force a restore.

The ledger must be newer than the snapshot and no more than 24 hours old. Restore also locks the source, reads current deletion markers, and holds the source lock through target verification. The current tool requires a readable source Emulator. Complete source loss needs a separate cloud recovery design with an independently protected deletion ledger, which is not implemented.

Restore merges deletion markers from the snapshot, ledger, target, and current source. It removes affected user trees, including partially restored data, without recreating Auth users. Deletion state is retained, leases are cleared, and proofHash changes invalidate old continuation proofs. Pending jobs require the deployment's authentication/operator recovery procedure. All shareTokens are dropped and statement pointers set to null; teachers must create new links.

Before and after restoring, reconcile statement totals, payments/paidVnd/activePaymentCount, students, rates/dates/lesson locks, counters/unique statement numbers, receivables, and unbilled tuition. After writing, compare **every field** through the codec, not just financial totals. Unlock the target only after all checks pass.

A failure between batches leaves the target restore lock in place. Retry with the same snapshot UUID and a fresh ledger; the tool does not silently unlock a partial target. The source backup lock may be released after a failure because source business data was not changed. If a terminated process left a source backup lock, inspect the jobs and use the exact logged UUID:

```bash
npm run backup:local -- release --lock BACKUP_LOCK_UUID
```

This does not release a restore lock. Keep the target closed if archive, codec, or ledger checks fail. Do not change UUIDs or delete locks to bypass validation, and do not edit encrypted snapshots directly.
