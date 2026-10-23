# Public release verification

**English** | [Tiếng Việt](VERIFICATION.vi.md)

Verified on **24 October 2026** using macOS x64, Node 24.22.1, npm 11.19.1, Java 21.0.11, and Playwright Chromium 1.64.1. Dependency versions were preserved in the lockfile.

| Check | Result |
|---|---|
| npm ci | Passed on the independent source export |
| npm run lint | Passed |
| npm run typecheck | Passed |
| npm test | 60/60 passed |
| npm run build | Passed with Webpack, without cloud credentials/configuration |
| npm run test:emulator | 53 backend/Rules + 12 E2E passed; **125/125** total |
| npm audit --omit=dev | 0 advisories at the time of verification |
| WIF template | Shell syntax and print-config passed; missing target confirmation stops before cloud operations |
| Gitleaks 8.30.1 | No secrets detected in staged content or the new public Git history |

Tests use demo projects and loopback only, without cloud business writes. The runner cleaned up its server/emulators afterward. Some Google SDK workers emitted metadata lookup warnings without failing tests. Emulator results do not prove real Google OAuth, HTTPS cookies, IAM, cloud indexes, or installation on real devices; verify these separately when self-hosting.

The initial public source commit also [passed GitHub CI](https://github.com/devoralabsapp/chot-cong-open-source/actions/runs/40001554602). Subsequent documentation changes do not alter application code and should not be described as new runtime test runs.

## Sanitization scope

The public edition starts with fresh Git history and a neutral author identity, excluding private history. It contains no actual environment files, credential stores, Emulator data, operational screenshots, internal reports, or personal machine paths. Deployment-specific Firebase/Vercel identifiers and domains were replaced with placeholders; smoke checks default to localhost. PNG icons contain no EXIF or text metadata.

Gitleaks and identifier reviews reduce exposure risk but cannot guarantee the absence of every kind of sensitive information. Do not add real data or secrets to issues, pull requests, or commits when developing further.
