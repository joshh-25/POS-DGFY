# DGLaundry provider foundation

This module is the DGFY-owned side of the DGLaundry integration. It follows
the API module boundary of routes/controllers -> use cases -> repositories.

- `repositories/` persists landlord-side intent, mapping, and audit metadata.
- `usecases/` enforces accepted membership, laundry runtime ownership, explicit
  company selection, and fixed staff launch behavior.
- `services/` contains the OIDC provider protocol and Redis-backed short-lived
  transaction state.
- `middleware/` authenticates server-to-server DGLaundry partner requests.

The module stores identifiers and sanitized projections only. It never imports
DGLaundry runtime source, connects to a DGLaundry database, or collects a DGFY
password. Production OIDC keys and partner credentials must be mounted through
secret-manager file references; local memory fallback is not production proof.
