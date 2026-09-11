# @sieitzz/tenant-bootstrap

The Phase 157 tenant-bootstrap migration manifest (`src/tenantBootstrapManifest.cjs`) and the two
migrations it applies (`migrations/`), consumed as a `file:` dependency by both:

- `apps/dgfy-api` — `src/services/tenantSchemaBootstrap.js` requires this package's manifest
  directly, at runtime, immediately after a freshly-provisioned tenant database is `sync()`'d.
- `apps/dgfy-migration-runner` — `migrations/2026082400000{1,2}-*.cjs` are thin re-export shims
  that `require()` the real files here (see each shim's own header comment).

## Why this package exists

`apps/dgfy-api`'s Docker image never ships any part of `apps/dgfy-migration-runner` (see that
Dockerfile's own header comment — the migration domain is deliberately excluded). Before this
package existed, `tenantSchemaBootstrap.js` reached across into
`../../../dgfy-migration-runner/src/tenantBootstrapManifest.cjs` at runtime — a path that only
resolves in the repo checkout, not inside the built image, which broke tenant approval end to end
in every containerised deployment (#1819). Moving the manifest and its migrations into a package
both apps already know how to consume (`packages/*` via `file:`, exactly like
`packages/shared-constants`) makes the Dockerfiles' existing `COPY packages/<name>` pattern correct
by construction instead of needing a cross-app `COPY` exception.

## Do not rename or move a file under `migrations/`

Each filename here is load-bearing in **two** independent ways:

1. `SequelizeMeta` rows on every existing tenant database are keyed by these exact filenames (via
   the `apps/dgfy-migration-runner/migrations/<same-filename>` shim `sequelize-cli` actually
   discovers) — renaming or moving the underlying file re-runs a migration already applied
   everywhere.
2. `tenantBootstrapManifest.cjs`'s `TENANT_BOOTSTRAP_MIGRATIONS` array resolves these paths eagerly
   at module load time and throws immediately if an entry goes stale (by design — see that file's
   own header comment).

Adding a **new** tenant-bootstrap migration: add the file here under `migrations/`, add a matching
thin shim under `apps/dgfy-migration-runner/migrations/` (same filename, `module.exports =
require('@sieitzz/tenant-bootstrap/migrations/<filename>.cjs');`), and append it to
`TENANT_BOOTSTRAP_MIGRATIONS` in `src/tenantBootstrapManifest.cjs`, in order.

No test runner of its own — exercised from `apps/dgfy-api/tests/` (which has a real `file:`-linked
`node_modules/@sieitzz/tenant-bootstrap` to run against), matching how `packages/shared-constants`
and `packages/web-core` are tested from their consuming apps rather than in isolation.
