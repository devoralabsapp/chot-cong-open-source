# Maintainers and project status

The primary maintenance account is [@devoralabsapp](https://github.com/devoralabsapp), which owns this repository. Use public issues for reproducible bugs and proposals, and [private vulnerability reporting](https://github.com/devoralabsapp/lessonbrook/security/advisories/new) for security concerns. Do not include personal information, credentials, or student records.

This is an early-stage, independently maintained project. Broad external adoption and download counts have not been established. The public edition was published on 24 October 2026 with fresh history to exclude private operational records and personal information. Its short commit history should not be represented as a long-running public maintenance record.

## Maintenance process

- The primary maintainer reviews scope, business invariants, privacy, test evidence, and changes to dependencies before merging contributions.
- Contributors can open bug reports, propose changes, or submit focused pull requests. Use the issue/PR templates and [contribution guide](CONTRIBUTING.md).
- Changes to prices, balances, account isolation, sharing, or deletion require relevant backend and regression coverage. CI runs lint, typecheck, unit tests, a Webpack build, Rules/backend tests, and browser tests without cloud credentials.
- Versioned releases identify source checkpoints and summarize changes and limitations. They are source releases, not managed hosting or a promise of production certification.
- There is no fixed release schedule or guaranteed support response time. Please keep contributions scoped and document how reviewers can reproduce them.

## Codex-assisted maintenance

Codex has assisted with preparing the public edition, documentation, privacy review, and running checks. Maintainers remain responsible for reviewing changes and verifying results. `AGENTS.md` records the project's data boundaries and required checks.

Potential future uses include reproducing sanitized bug reports, proposing focused patches with regression tests, reviewing UID isolation and money calculations, and drafting documentation or release notes. These are proposed workflows: the repository does not currently run an OpenAI API-backed bot or an automated Codex review integration. Do not add API keys or account authentication files to issues, PRs, workflow artifacts, or the repository.

## Planning

See the [roadmap](ROADMAP.md), [changelog](CHANGELOG.md), and [verification report](docs/VERIFICATION.md). Security fixes and reproducible correctness issues take priority over expanding the product's scope.
