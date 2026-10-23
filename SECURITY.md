# Security reporting

**English** | [Tiếng Việt](SECURITY.vi.md)

Do not post secrets, tokens, cookies, student data, or exploit details for a live deployment in public issues. If GitHub Private Vulnerability Reporting is enabled, use **Security → Report a vulnerability**. If a private channel is unavailable, open an issue asking how to contact the maintainers without including sensitive details.

The source is provided under the MIT License, without an SLA or a guaranteed support schedule. Self-hosting operators are responsible for Firebase/IAM/Rules/indexes, OAuth, HTTPS, access control, backups, and dependency updates. Emulator and guarded test scripts are intended only for fake data in local development and CI.

This public edition starts with fresh Git history, demo configuration, and cloud placeholders. Do not commit `.env.local`, credential stores, emulator data, operational screenshots, or browser traces. If a secret is accidentally published, revoke or rotate it immediately. Deleting a file in a later commit does not remove it from Git history.
