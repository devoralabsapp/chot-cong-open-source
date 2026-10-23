# Contributing

**English** | [Tiếng Việt](CONTRIBUTING.vi.md)

Fork the repository, create a branch, and run locally with emulators as described in the [README](README.md). Code contributions are proposed under the project's MIT License; dependencies retain their own licenses.

Read [AGENTS.md](AGENTS.md), [ARCHITECTURE](docs/ARCHITECTURE.md), and the installed Next.js documentation in `node_modules/next/dist/docs/` before editing. Preserve integer VND amounts, Vietnam business dates, server-derived UIDs, session/CSRF checks, price snapshots, transactions, and idempotency. Never remove demo/loopback guards to run tests against cloud projects.

Before opening a pull request, run lint, typecheck, unit tests, build, and `test:emulator`. Describe the behavior before and after the change, how it was checked, and any remaining limitations. Use fake data. Do not include environment files, credentials, user data, real screenshots, or traces/cookies in issues or pull requests. Keep dependency upgrades within the scope of the proposed change.

Follow the [code of conduct](CODE_OF_CONDUCT.md). See [maintainers](MAINTAINERS.md) for review and release responsibilities, and the [roadmap](ROADMAP.md) for useful contribution areas.
