# Configurable Item Processing Fee — Local Execution Manifest

## Scope

- Worktree: `UpdatePOS` (`codex/updates-pos`)
- Environment: local only
- Owner surface: `apps/dgfy-opis`
- Financial domain: `apps/dgfy-api` tenant-revenue module (provider fees remain separate)
- Explicit exclusion: `apps/dgfy-ims` and IMS tests/builds
- No deployment, staging verification, production access, or data mutation outside local test fixtures

## Execution records

- `EXEC-001`: governance, authority, and baseline checks
- `EXEC-002`: tenant-scoped Owner policy API and authorization
- `EXEC-003`: fallback calculation, reconciliation, and source-aware reporting
- `EXEC-004`: OPIS Owner configuration and item-processing/order reporting UX
- `EXEC-005`: local tests, architecture checks, and OPIS build
- `EXEC-006`: final acceptance matrix and residual-risk audit

## Required gates

1. Owner can configure the item-processing fee as a fixed amount or percentage of discounted items;
   provider fallback fields and platform settlement fields remain separate and unchanged.
2. Requests cannot select a tenant from the body or URL; the authenticated tenant context is authoritative.
3. Policy updates use version locking and preserve historical versions.
4. Estimated fallback fees are visibly labeled and remain unreconciled/on hold.
5. Actual provider or statement/API data supersedes fallback values through an immutable adjustment path.
6. OPIS renders provider configuration, item-processing configuration, and order reporting; IMS
   remains untouched.
7. Local tests, architecture checks, docs/compliance checks, and the OPIS build pass, or exact blockers are recorded.
