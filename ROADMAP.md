# Roadmap

This is a working list of priorities, not a delivery promise. The public edition is early-stage; proposed work does not imply completed deployment checks, external adoption, or production readiness.

## Current baseline

- MIT-licensed lesson and tuition ledger with individual/group/class lessons, per-student statements, partial payments, expiring/revocable sharing, and export/deletion workflows.
- Local development without cloud credentials using Firebase Auth/Firestore Emulator.
- English documentation with Vietnamese translations; the application UI remains Vietnamese.
- A verified baseline of 125 tests: 60 unit, 53 backend/Rules, and 12 browser E2E. See [verification](docs/VERIFICATION.md).

## Near-term contribution areas

| Area | Useful next contribution | Evidence expected |
|---|---|---|
| First-run experience | Clarify setup issues found by a fresh contributor on macOS, Linux, or Windows/WSL | Exact tool versions, safe reproduction steps, and a verified documentation change |
| Accessibility | Review keyboard focus, screen-reader labels, and narrow-screen forms | A reproducible finding, before/after behavior, and focused checks |
| Localization | Propose a maintainable English UI/localization approach while preserving Vietnamese and ledger semantics | A small design proposal, an inventory of user-facing text, and translation tests before broad implementation |
| Correctness | Extend meaningful coverage of concurrent edits, payment limits, statement snapshots, and request retries | A failing regression scenario that passes with the change |
| Contributor tooling | Keep CI and setup instructions maintainable without exposing credentials | Explicit permissions, compatible tool versions, and CI evidence |

## Separate validation for self-hosting

Each deployment must independently verify real Google OAuth, HTTPS sessions, Firestore indexes/IAM, two-account isolation/revocation, and export/deletion recovery. Real-device installation and sharing through messaging apps also need separate evidence. Emulator results do not establish these properties.

The repository does not automatically provision cloud staging, enable billing, or implement production backup schedules. Operators need their own deployment and backup/retention decisions before storing real data.

## Before proposing a feature

Open a feature request explaining the teacher's workflow, existing workaround, data/privacy implications, and how success could be checked. Recurring schedules, bank integrations, prepaid balances, and multi-staff roles need explicit design review rather than being assumed part of the current release.
