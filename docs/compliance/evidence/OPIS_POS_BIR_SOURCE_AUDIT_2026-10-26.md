---
status: reference
authority_level: reference
owner: architecture
last_reviewed: 2026-10-26
applies_to: opis_pos_bir_step_01_source_reaudit
topic: opis_pos_bir_source_audit
related_adr: 0007-dual-mode-pos-compliance-program.md,0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md,0033-commercial-promo-and-statutory-pos-discount-boundaries.md,0042-bir-rmo-24-2023-fiscal-document-and-accreditation-closure.md,0045-shared-pos-receipt-renderer.md,0087-dedicated-back-office-fourth-frontend-app-opis.md
---

# OPIS & POS BIR Source Audit — Independent Step 01 Re-Audit

## Authority and limitation

The original `OPIS_POS_BIR_SOURCE_AUDIT_2026-10-26.md` referenced by the
implementation plan was not present in the supplied Downloads/workspace paths.
This document is an independent audit of the current checkout, created to
replace that missing evidence input without pretending to reproduce its A01–A15
findings. It is an internal source/readiness record, not tax advice, BIR
certification, provider approval, or deployment evidence.

## Revision and source boundary

- Repository: `POS-DGFY`
- Revision inspected: `d56cee18700989e75fac3ba8c1fce334c6224145`
- Branch: `codex/updates-pos`
- Working tree: dirty; pre-existing user changes remain outside this audit's
  implementation scope.
- Inspection boundary: API, migration runner, POS, OPIS, shared web core,
  receipt package, shared constants, compliance evidence, and focused tests.
- No production or staging records were read or changed.

## Source inventory

| Source unit | Present | Notes |
|---|---:|---|
| `apps/dgfy-api` | Yes | Routes, controllers, use cases, repositories, models, policy, and focused tests are present. |
| `apps/dgfy-migration-runner` | Yes | Tenant/landlord migration sources are present; local status was fully `up`. |
| `apps/dgfy-pos` | Yes | POS terminal application and tests are present. |
| `apps/dgfy-opis` | Yes | OPIS back-office application and tests are present. |
| `apps/dgfy-storefront` | Yes | Storefront application and build surface are present. |
| `apps/dgfy-ims` | Yes | Existing IMS application and shared-core test runner are present. |
| `packages/pos-receipt` | Yes | Shared browser/native receipt projection package is present. |
| `packages/web-core` | Yes | Shared POS/compliance/settings source and contract tests are present. |
| `packages/shared-constants` | Yes | Shared runtime constants are present. |
| `docs/ai/PR.md` | Yes | Repository PR and review rules are present. |

## Independent findings

The statuses below describe source evidence only. `PARTIAL` and `HOLD` do not
mean that the feature is absent; they mean that the plan's required proof or
approved policy is not complete.

| Finding | Current source evidence | Status | Remaining proof or decision |
|---|---|---|---|
| R01 — complete source baseline | All source units in the inventory above are present at one checkout revision. | PASS | Repeat on the final release revision. |
| R02 — explicit compliance modes | `complianceConstants.js` and `compliancePolicyEngine.js` define explicit modes and server-owned fiscal/non-fiscal document context. | PASS | External policy review remains separate. |
| R03 — server-owned document identity | `PosTransaction`, `PosFiscalEvent`, `fiscalEvidenceContract.js`, and POS use cases persist/propagate `document_type`, `document_context`, snapshots, and hashes. | PASS | Freeze the approved field and numbering specification before new schema work. |
| R04 — shared receipt projection | `packages/pos-receipt` renders from the transaction and receipt contract for browser/native outputs. | PARTIAL | Approve and capture the required VAT/non-VAT, discount, adjustment, and paper-width examples. |
| R05 — taxpayer/business setup | Existing settings and compliance models expose business and fiscal metadata paths. | HOLD | Taxpayer classification, legal identity, identifiers, labels, and authority must be approved. |
| R06 — discounts | Server-side discount policy/calculation/beneficiary paths and focused tests are present. | PARTIAL | Approve the applicable statutory/commercial matrix, eligibility evidence, rates, stacking, and tax effects. |
| R07 — void/return/refund adjustments | Adjustment models, fiscal evidence builders, and void/refund/return use cases are present. | PARTIAL | Generate and review printable adjustment examples with original-document linkage. |
| R08 — X/Z readings | POS routes/use cases, `PosZReadingSnapshot`, and reading tests are present. | PARTIAL | Freeze day boundary, timezone, inclusion rules, and controlled reconciliation samples. |
| R09 — e-Journal/eSales | e-Journal readiness grammar, report/eSales domain paths, and contract tests are present. | PARTIAL | Approve the final grammar, ordering, manifest/status rules, and generated runtime samples. |
| R10 — offline/replay | `PosOperationReplay`, checkout idempotency, terminal/location binding, and replay-focused tests are present. | PARTIAL | Approve the intended offline artifact policy and prove conflict/replay evidence on the final release. |
| R11 — RBAC and tenant/location scope | Auth middleware, permission configuration, POS route guards, tenant handling, and RBAC contract tests are present. | PASS | Complete dynamic two-tenant/two-branch evidence for the release gate. |
| R12 — OPIS evidence surface | `apps/dgfy-opis` and Business Admin fiscal/compliance repositories/use cases are present. | PARTIAL | Complete the plan's audit export, registration-upload, and evidence-navigation scenarios. |
| R13 — hardware and printer boundary | Device bridge, device adapters, shared receipt package, and POS print tests are present. | PARTIAL | Freeze supported terminal/printer/OS/browser matrix and perform hardware QA. |
| R14 — local runtime readiness | MySQL, migrations, API, POS, OPIS, Storefront, IMS, Admin, device bridge, and Redis were health-checked; the local profile reports `10 tenants x 4 + 20 landlord = 60` within MySQL `151`. | PASS (local profile) | Repeat the same disposition in the final release environment. |
| R15 — release evidence | Build/test logs and baseline evidence exist. | HOLD | Add the impact declaration, resolve environment findings, review the fiscal spec, and rerun G0 on the exact release revision. |

## Evidence executed for this re-audit

- Architecture guardrails and controller-boundary checks passed.
- Documentation and ADR lint passed.
- POS, OPIS, Storefront, and IMS builds passed.
- POS suite passed: 15 files / 60 tests.
- OPIS suite passed: 41 files / 178 tests.
- Focused backend BIR/compliance/fiscal/offline run passed: 29 suites / 234 tests.
- Shared POS service contract tests passed: 2 files / 4 tests.
- All discovered migrations reported `up` against the local MySQL instance.
- Local service health checks returned HTTP 200 for ports `5000`, `5101`, and
  `5173` through `5177`.

## Re-audit decision

The missing original audit is now replaced by a traceable current-checkout
source re-audit. The local Redis and connection-budget findings were also
dispositioned for the test profile. The authenticated local preflight was
subsequently run against the worktree API and returned `no_breach`/`ALLOWED` for
all three current sensitive declarations. No staging or deployed environment
was used; the remaining Gate G1 review is external approval work.
