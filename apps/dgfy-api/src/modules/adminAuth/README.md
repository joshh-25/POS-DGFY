# Admin Auth Module

Admin-auth transport/use-case boundary.

Flow:

`routes -> admin auth handlers -> admin auth use-cases`

## Credential + Lockout Policy

Credentials are env-backed and password verification uses bcrypt hash comparison.

- `ADMIN_USERNAME` (local-development fallback: `skupervisor`)
- `ADMIN_PASSWORD_HASH` (local-development fallback only; never use the documented bootstrap hash in production)
- `ADMIN_FINANCIAL_ROLE` (legacy single-account role, default: `platform_admin`)
- `ADMIN_ACCOUNTS_JSON` (preferred production roster; replaces the single account when set)

Production startup fails closed unless explicit `ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH`
or `ADMIN_ACCOUNTS_JSON` is configured, and the documented local bootstrap hash is rejected.

`ADMIN_ACCOUNTS_JSON` contains bcrypt hashes only—never plaintext passwords:

```json
[
  {
    "username": "finance.preparer",
    "password_hash": "$2b$12$...",
    "financial_role": "finance_preparer"
  },
  {
    "username": "finance.approver",
    "password_hash": "$2b$12$...",
    "financial_role": "finance_approver"
  }
]
```

Allowed financial roles are `platform_admin`, `finance_viewer`,
`finance_preparer`, and `finance_approver`. Tenant-revenue endpoints enforce
these roles server-side. Maker-checker rules still require the preparing and
approving usernames to be different.

Lockout policy (Redis-backed when available, in-memory fallback, per `username|ip` identity):

- `ADMIN_LOGIN_LOCKOUT_MAX_ATTEMPTS` (default: `5`)
- `ADMIN_LOGIN_LOCKOUT_WINDOW_MS` (default: `900000`)
- `ADMIN_LOGIN_LOCKOUT_DURATION_MS` (default: `900000`)
