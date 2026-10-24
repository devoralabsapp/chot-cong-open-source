<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## LessonBrook — community edition

Read README.md and docs/ARCHITECTURE.md before changing behavior. Read the relevant installed Next.js guide in node_modules/next/dist/docs/ before editing code. Keep the pinned dependencies and Webpack unless an upgrade is explicitly in scope.

All business reads/writes go through Node server APIs. Derive UID from a revocation-checked Firebase session; never accept an owner or document path from the client. Admin bypasses Rules. Keep Rules tests separate from backend isolation tests. Never remove demo/loopback guards from seed, backup or test scripts. Keep login unavailable while server configuration is missing.

Use integer VND, Vietnam business dates, server Timestamps, schemaVersion and transaction idempotency. Read relevant documents before writes; create result IDs outside transaction callbacks. Preserve price snapshots and billedStatementId locks.

Required checks: npm run lint, npm run typecheck, npm test, npm run build, npm run test:emulator. Stop only owned local servers before the last command. Cloud OAuth, HTTPS cookies, indexes, IAM and device installation need separate checks; Emulator does not prove them. Do not upload local data, credentials, logs, environment files or browser traces. See docs/DEPLOYMENT.md for self-hosting.
