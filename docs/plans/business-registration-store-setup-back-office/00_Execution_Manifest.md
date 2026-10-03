# Business Registration and Store Setup — Execution Manifest

Captured: 2026-10-01 (Asia/Shanghai)
Repository: `C:\xampp\htdocs\POS-DGFY`
Worktree: `C:\xampp\htdocs\POS-DGFY\.worktrees\StagingPOS`
Branch: `StagingPOS`
Baseline commit: `9065425cc` (`docs(compliance): cover inventory report surfaces`)

## Scope and ownership

This manifest records execution of the approved BRS-01 through BRS-08 plan. The original planning DOCX files in this directory are preserved unchanged. The implementation follows the repository ownership boundary: landlord storage owns pre-approval applications and uploads, SKUpervisor Platform Admin at `/admin/tenants` owns platform-admin review and private downloads, OPIS/POS owns approved tenant administration, and Storefront owns public registration presentation. The Admin route remains implemented in the existing `apps/dgfy-ims` package; it is the retained platform-admin surface, not the retired IMS merchant shell.

No PR, merge, deployment, or phase-ledger completion claim is made by this execution record.

## Execution status

| Step | Scope | Status at capture | Evidence |
|---|---|---|---|
| EXEC-001 | Baseline and plan reconciliation | Complete | `00_Execution_Summary.docx`, this manifest, repository/docs inspection |
| EXEC-002 | Landlord contracts and private upload storage | Implemented and unit-verified | `EXEC-002_Landlord_Registration_Contracts_and_Storage.docx`, focused backend tests, migration evidence |
| EXEC-003 | Registration, status, upload, and resubmission API | Implemented and regression-verified | `EXEC-003_Registration_and_Status_API.docx`, focused backend tests |
| EXEC-004 | Approval materialization and retry boundary | Implemented and unit-verified | `EXEC-004_Approval_Materialization.docx`, materialization and provisioning tests |
| EXEC-005 | SKUpervisor Platform Admin review and private downloads | Implemented and build-verified | `EXEC-005_SKUpervisor_Platform_Admin_Tenant_Review.docx`, Admin-route build, source-level authorization review |
| EXEC-006 | Exactly-three-step registration UI | Implemented and focused-test/build-verified | `EXEC-006_Storefront_Registration_Stepper.docx`, Storefront test/build |
| EXEC-007 | OPIS Company workspace and aliases | Implemented and focused-test/build-verified | `EXEC-007_OPIS_Company_Workspace.docx`, OPIS route test/build |
| EXEC-008 | Verification, simulation, and final audit | Partial; authenticated browser simulation and DOCX visual rendering remain environment-limited | `EXEC-008_Verification_Simulation_and_Final_Audit_Input.docx`, `Final_Audit.docx` |

## Requirement traceability

### Functional requirements

| Requirement | Execution/evidence |
|---|---|
| FR-BRS-001 — one OPIS Company sidebar entry | EXEC-007; `apps/dgfy-opis/src/features/businessAdmin/businessAdminManifest.js`; OPIS route test confirms exactly one `company` item with label `Company`. |
| FR-BRS-002 — tenant-scoped Company workspace and canonical settings navigation | EXEC-007; `businessAdminCompanyUseCase.js` and `CompanyWorkspace` use tenant/branch-scoped data and canonical editor links. |
| FR-BRS-003 — exactly three public registration steps | EXEC-006; `RegisterCompany.jsx` and `StorefrontBusinessGrowPage.jsx` expose Business Information, Storefront Content Setup, and Location, Business Hours and Menu. |
| FR-BRS-004 — reuse existing Storefront/profile/gallery/delivery controls | EXEC-006; existing shared registration/settings services and components remain the owner; no OPIS persistence duplicate was added. |
| FR-BRS-005 — location and hours ownership | EXEC-004/007; approved data uses canonical `SystemSetting` and `TenantLocation` services with branch scope preserved. |
| FR-BRS-006 — staged original menu uploads and separate review/publication | EXEC-002/003/004/005; private landlord upload model/storage and `menu_catalog_published: false` materialization result. |
| FR-BRS-007 — independent versioned legal acknowledgements | EXEC-002/003/006; `accepted_company_terms` and `accepted_marketplace_terms` are independently required and server-versioned. |
| FR-BRS-008 — existing SKUpervisor Platform Admin review/download owner | EXEC-005; `/admin/tenants` and authenticated admin routes are extended; OPIS has no cross-tenant platform-admin review screen. |
| FR-BRS-009 — idempotent approval materialization after approval | EXEC-004; canonical setting/location upserts and materialization marker are transaction-scoped and covered by tests. |
| FR-BRS-010 — private, auditable originals | EXEC-002/005; storage keys are private, downloads are streamed through admin authorization, and revoke/purge events preserve metadata/audit evidence. |

### Business rules

| Rule | Execution/evidence |
|---|---|
| BR-BRS-001 — no pre-approval tenant database writes | EXEC-003/004; registration persists landlord application/attempt snapshots; tenant settings/location materialization is called only from approval. |
| BR-BRS-002 — OPIS/Storefront/SKUpervisor Platform Admin ownership boundary | EXEC-001/005/007; documented in the implementation and compliance declaration. |
| BR-BRS-003 — registration, extraction, review, confirmation, and publication remain separate | EXEC-002/004/005; upload statuses and explicit no-auto-publish marker. |
| BR-BRS-004 — server validation is authoritative | EXEC-002/003/005/007; legal, file signature/size, object ownership, admin authorization, and branch scope checks are server-side. |
| BR-BRS-005 — approval retries do not duplicate records | EXEC-004; materialization test and existing provisioning retry/idempotency suites pass. |
| BR-BRS-006 — canonical components/API owners are reused | EXEC-004/006/007; canonical settings/location routes are linked rather than duplicated. |
| BR-BRS-007 — existing APIs/components are reused and no duplicate owner is introduced | EXEC-004/005/006/007; SKUpervisor Platform Admin remains review owner and Storefront/shared settings remain presentation owners. |
| BR-BRS-008 — visible label is `Company` | EXEC-007; manifest, route aliases, and tests use `Company`, resolving the source typo `Copany`. |

### Acceptance criteria from the approved execution plan

| Acceptance criterion | Evidence/status |
|---|---|
| AC-01 Exactly one Company item for authorized non-cashier Back Office users | Implemented; OPIS manifest test and live authenticated OPIS route check pass. No registration was submitted. |
| AC-02 Cashiers cannot see or call Company | Implemented through existing `resolveBusinessAdminAccess`; backend contract suite passes. |
| AC-03 All three aliases resolve to the same workspace | Implemented/tested for `/company`, `/backoffice/company`, `/business-admin/company`. |
| AC-04 Registration has exactly three steps | Implemented; Storefront focused test and build pass. |
| AC-05 Both legal acknowledgements are independently required and server validated | Implemented; legal focused suite passes. |
| AC-06 No tenant data before approval | Implemented by approval-only materializer boundary; unit/regression evidence passes. |
| AC-07 Approved materialization is retry-safe and duplicate-free | Implemented; materialization and provisioning retry suites pass. |
| AC-08 Original uploads remain private and auditable | Implemented; signature, path, ownership, download, revoke, and cleanup code paths are covered at unit/source level. |
| AC-09 Abandoned/rejected originals clean up after 30 days | Implemented; expiry metadata and cleanup service are wired; scheduled production cleanup observation is pending. |
| AC-10 SKUpervisor Platform Admin remains platform-admin review/download owner | Implemented at `/admin/tenants`; Admin-route tests/build pass and a live authenticated route audit loaded the Tenant Management page and read-only Registration review panel. No approval/rejection was performed; private download/revoke still lacks a disposable upload fixture. |
| AC-11 Menu extraction never publishes catalog rows without explicit confirmation | Implemented by staged status and materializer no-publication boundary. |
| AC-12 Required tests, migration rehearsal, security checks, regression checks, simulations, and final audit pass | Unit, build, architecture, compliance, migration upgrade/fresh-schema checks pass; live OPIS/Storefront checks and a non-mutating Admin route audit pass, while full applicant/admin-download/cashier E2E and visual DOCX rendering remain limited. |

## Resolved product/legal decisions

| Decision | Resolution used |
|---|---|
| DEC-BRS-01 | V1 accepts PDF plus CSV/JPG/JPEG/PNG; upload validation checks extension/MIME/signature. |
| DEC-BRS-02 | Menu upload is optional at registration; readiness can remain incomplete. |
| DEC-BRS-03 | CSV/menu extraction is staged and never auto-creates live catalog rows. |
| DEC-BRS-04 | SKUpervisor Platform Admin review at `/admin/tenants` exposes all registration uploads; menu filtering remains represented by `asset_kind`. |
| DEC-BRS-05 | The retained SKUpervisor Platform Admin Tenant Manager owns platform-admin review/download; the retired IMS merchant shell is not the owner. |
| DEC-BRS-06 | Three delivery partners are server-limited during registration and captured for canonical settings. |
| DEC-BRS-07 | Profile, cover, gallery, and menu media are optional. |
| DEC-BRS-08 | Abandoned/rejected originals receive a 30-day expiry; approved originals are retained until explicitly revoked/purged by operations. |
| DEC-BRS-09 | Admin action is audited soft-revoke; metadata remains for evidence and cleanup. |
| DEC-BRS-10 | Legal versions come from the DGFY legal-term registry; clients cannot define versions. |
| DEC-BRS-11 | Final visible label is `Company`. |

## Evidence inventory

| Evidence | Result |
|---|---|
| Backend focused regression matrix | 12 suites, 60 tests passed. |
| OPIS route/sidebar test | 14 tests passed. |
| Storefront registration test | 2 tests passed. |
| OPIS full frontend suite | 30 test files / 138 tests passed. |
| Storefront full frontend suite | 228 test files / 1,251 tests passed. |
| IMS BRS registration/auth handoff suite | 17 tests passed; Admin Tenant Manager registration-approval integration adds 4 tests, for 21 Admin/registration tests passed. |
| IMS full frontend suite | 442 test files / 2,960 tests passed, 13 skipped; 12 failures across 6 pre-existing POS/web-core contract files outside this change. |
| API syntax checks | All changed backend JavaScript files passed `node --check`. |
| API lint | Passed with three pre-existing warnings outside this change. |
| OPIS build | Passed. |
| Storefront build | Passed; existing chunk-size warning only. |
| IMS build | Passed. |
| Architecture guardrails/controller boundaries | Passed. |
| Compliance and API contract checks | Passed after adding the BRS impact declaration. |
| Tenant-schema coverage | Passed; no tenant migration changed. |
| Documentation lint/ADR checks | Passed. |
| Workspace hygiene | Passed. |
| Local landlord migration | New migration applied and reported `up`; table/columns/indexes/FKs verified. |
| Local test landlord migration | The existing `20261001000001-create-company-registration-uploads.cjs` migration was applied to `sku_test`; `company_registration_uploads` and its `SequelizeMeta` record are present. |
| Fresh-schema rehearsal | Disposable `sku_brs_rehearsal_20261001` migrated from empty, reran with no pending migrations, then was dropped. |
| Live platform-admin route audit | Local SKUpervisor Admin login loaded `/admin/tenants`; Tenant Management showed 15 active and 0 pending tenants; read-only Registration review opened without approval/rejection. |

## Known verification limits

- A local platform-admin test credential enabled a non-mutating Admin route audit, but no disposable pending BRS application/upload fixture was available for approval, download, revoke, or full applicant-to-tenant simulation. No cashier fixture was available for live denial proof. Clean authenticated OPIS and Storefront browser checks were completed without submitting a registration.
- The DOCX renderer dependency `soffice.exe` was unavailable in the host environment during prior structural-document verification; generated execution DOCX files must be structurally checked, but visual rendering cannot be claimed unless the renderer becomes available.
- No PR, merge, deployment, release authorization, or phase-ledger update was performed.
- The global implementation phase ledger remains governed by its existing state; these execution records do not mark a repository phase complete.
