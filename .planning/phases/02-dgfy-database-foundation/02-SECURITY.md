---
phase: 02
slug: dgfy-database-foundation
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-11
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| CLI/operator input → migration runner | Runtime mode, target DB, command, and destructive flag determine what can mutate schemas. | Command args, env config |
| Runner → `dgfy_migration_meta` | Metadata integrity proves what ran and whether it succeeded. | Migration/execution audit records |
| Runner → target database | Incorrect target or destructive classification can alter protected schemas. | Schema DDL |
| Runner → `dgfy_core` | Migration can create/alter landlord identity and tenancy tables. | Landlord schema DDL |
| `dgfy_core` → `dgfy_business_*` | Registry rows point future access and verification to tenant databases. | Registry pointer data |
| Public discovery → core projection | Projection data may be exposed to public Storefront discovery later. | `storefront_discovery_index` rows |
| Env/registry target list → runner | Business DB names determine which tenant databases are mutated. | Target DB name list |
| `dgfy_core.business_database_registry` → `dgfy_business_*` | Registry integrity controls coverage and access routing later. | Registry pointer data |
| Tenant schema → future backend tenant sessions | Role, staff, assignment, and terminal tables become authorization inputs. | Staff/role/assignment records |
| Database metadata → verification report | `information_schema` and metadata rows become operator evidence. | Schema/metadata inspection results |
| `dgfy_core` registry → business DB coverage | Registry rows determine which tenant schemas are expected. | Registry pointer data |
| Legacy schema fingerprints → non-mutation proof | Legacy compatibility safety depends on trustworthy before/after comparison. | `information_schema` fingerprints |
| `verify.js` report → operator/CI | Operators and deploy tooling trust `verify`'s JSON/summary report as evidence migrations landed correctly across every targeted database (D-21/D-22, DBF-04/DBF-05). | Verification report JSON |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-02-01-01 | Tampering | `schema.js` destructive gate | high | mitigate | D-17 pending-only destructive detection; `schemaCommand.test.js` covers historical and pending destructive migrations. | closed |
| T-02-01-02 | Repudiation | `command_executions` failure status | high | mitigate | D-18 failure paths call `recordCommandComplete(..., 'failed', ...)` after command start; `reportCommands.test.js` regression coverage. | closed |
| T-02-01-03 | Information Disclosure | summary/report paths | medium | mitigate | D-20 `/reports` container-safe default; reports never include DB credentials. | closed |
| T-02-01-04 | Spoofing | target DB naming | high | mitigate | `assertTargetDbNameAllowed` rejects any non-`dgfy_`-prefixed target before connection (Phase 1, re-confirmed in 02-VERIFICATION.md). | closed |
| T-02-01-05 | Tampering | legacy `sku_*` schemas | high | mitigate | Target guard plus Plan 02-04's legacy fingerprint baseline/comparison prove no legacy mutation. | closed |
| T-02-02-01 | Spoofing | `accounts` identity fields | high | mitigate | `dgfyCoreContract.js` defines `unique_accounts_email`/`unique_accounts_phone` unique constraints. | closed |
| T-02-02-02 | Tampering | `business_database_registry` | high | mitigate | `unique_business_database_registry_suffix`/`unique_business_database_registry_database_name` constraints plus status/verification timestamps. | closed |
| T-02-02-03 | Information Disclosure | `storefront_discovery_index` | medium | mitigate | Contract is projection-only (D-10 through D-13): public routing/search metadata, no credentials or tenant secrets. | closed |
| T-02-02-04 | Elevation of Privilege | `business_memberships` | high | mitigate | `unique_business_memberships_business_account` constraint with role/status columns. | closed |
| T-02-02-05 | Tampering | legacy schemas | high | mitigate | Target DB guard plus Plan 02-04 fingerprint proof. | closed |
| T-02-03-01 | Spoofing | business database target parser | high | mitigate | `DGFY_BUSINESS_DB_NAMES` parser rejects legacy/display-derived/non-pattern names before connection; `env.test.js` covers all reject cases. | closed |
| T-02-03-02 | Repudiation | target-scoped migration metadata | high | mitigate | Target-scoped `schema_migrations` (composite key with `target_database`); hardened further by Plan 02-05's per-target try/catch fix. | closed |
| T-02-03-03 | Elevation of Privilege | `account_staff_assignments`, `roles`, `role_permissions` | high | mitigate | `unique_account_staff_assignments_dgfy_account`/`unique_role_permissions_role_permission` constraints with status columns. | closed |
| T-02-03-04 | Tampering | `terminal_identities` | medium | mitigate | Scoped to identity/location/status/policy lookup only — no checkout/payment fields present in contract. | closed |
| T-02-03-05 | Information Disclosure | schema reports | medium | mitigate | Reports list database names/findings only, consistent with T-02-01-03's pattern. | closed |
| T-02-03-06 | Tampering | legacy `sku_*` schemas | high | mitigate | Target parser rejection plus Plan 02-04 fingerprint proof. | closed |
| T-02-04-01 | Repudiation | migration metadata verification | high | mitigate | `verify.js` checks target-scoped `schema_migrations` records; hardened by Plan 02-05. | closed |
| T-02-04-02 | Tampering | legacy non-mutation fingerprints | high | mitigate | `ensureLegacyFingerprintBaseline`/`computeLegacySchemaFingerprint`/`checkLegacyNonMutation` capture-then-compare flow; fails closed if baseline missing. | closed |
| T-02-04-03 | Spoofing | tenant coverage | high | mitigate | `tenant_coverage` cross-checks explicit targets against `business_database_registry`, flags gaps. | closed |
| T-02-04-04 | Denial of Service | verification command | medium | mitigate | Reports failed checks without crashing; the one crash-adjacent gap (mid-loop abort on business-target failure) was found and fixed by Plan 02-05. | closed |
| T-02-04-05 | Information Disclosure | verification reports | medium | mitigate | No DB passwords, tokens, or connection strings in reports. | closed |
| T-02-05-01 | Repudiation | `verify.js` `migration_metadata` multi-target loop | high | mitigate | Try/catch scoped per target (primary + each business target independently); regression test proves all 4 targets' findings survive a mid-loop throw intact. | closed |
| T-02-05-02 | Tampering | `verify.js` `migration_metadata` error mislabeling | high | mitigate | Each caught error now attributed to the exact target whose `checkMigrationMetadata` call threw, not the primary target. | closed |
| T-02-05-03 | Information Disclosure | `verify.js` `migration_metadata` caught-error entries | low | accept | `error.message` included verbatim in report; existing behavior shared with `business_schemas`, originates from internal DB/storage exceptions, not user input. See Accepted Risks Log. | closed |

*Status: open · closed · open — below {block_on} threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-02-01 | T-02-05-03 | `error.message` from internal DB/storage exceptions (not user input) is included verbatim in verification reports, matching existing `business_schemas`/`failedSchemaResult` behavior. Low severity, informational-only exposure to operators who already have report access. | Plan 02-05 (planner-authored disposition) | 2026-07-11 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-11 | 24 | 24 | 0 | /gsd-secure-phase orchestrator (L1 grep-depth, short-circuit per ASVS L1 + plan-time register) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-11
