# Admin Auth Module

Admin-auth transport/use-case boundary.

Flow:

`routes -> admin auth handlers -> admin auth use-cases`

## Credential + Lockout Policy

Credentials are env-backed and password verification uses bcrypt hash comparison.

- `ADMIN_USERNAME` (default: `skupervisor`)
- `ADMIN_PASSWORD_HASH` (default hash maps to password `252378`)

Lockout policy (Redis-backed when available, in-memory fallback, per `username|ip` identity):

- `ADMIN_LOGIN_LOCKOUT_MAX_ATTEMPTS` (default: `5`)
- `ADMIN_LOGIN_LOCKOUT_WINDOW_MS` (default: `900000`)
- `ADMIN_LOGIN_LOCKOUT_DURATION_MS` (default: `900000`)
