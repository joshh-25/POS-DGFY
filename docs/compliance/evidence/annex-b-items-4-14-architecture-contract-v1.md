---
status: draft_pr
authority_level: reference
owner: DGFY Platform
last_reviewed: 2026-10-03
plan_section: "03"
phase: 353
execution_mode: LOCAL_ONLY
external_approval_claim: NOT_CLAIMED
---

# Annex B Items 4-14: Current and Target Architecture Contract

This document executes the approved `03_Current_and_Target_Architecture.docx`
scope. It locks the current architecture and the target evidence-generation
boundary before later runtime phases implement receipt, adjustment, reading,
report, e-Journal, documentary, audit, and disaster-recovery behavior.

It is an internal readiness artifact. It does not claim BIR, provider,
tax-practitioner, TWG, eAccReg, PTU, ATG, or eSales acceptance.

## Current architecture

The existing server flow remains:

```text
routes -> controllers -> usecases -> repositories -> models
```

- API routes apply authentication and permission middleware.
- Controllers validate transport input and delegate; they do not access models
  directly.
- Use cases apply business policy and transaction orchestration.
- Repositories perform tenant-scoped persistence and read-model access.
- Models define tenant or landlord persistence schema.
- POS remains the interim owner for new back-office-level work. New evidence
  actions must not be placed in `apps/dgfy-ims` by default.
- Fiscal document status is explicit server-owned metadata. It is never inferred
  from an invoice-number prefix.
- `@sieitzz/pos-receipt` remains a frontend/mobile projection dependency. The
  backend must not import it.

## Target evidence flow

1. An operator or reviewer requests a readiness, sample, report, journal,
   audit, screenshot, or disaster-recovery artifact.
2. The controller validates tenant, branch, terminal, date range, artifact
   type, and policy-version inputs.
3. The use case checks permission, compliance mode, location access, source
   freshness, and final/provisional state.
4. Repositories read the authoritative fiscal snapshots, adjustments, fiscal
   events, X/Z snapshots, reports, audit records, and approved version data.
5. A later deterministic serializer validates completeness, applies stable
   ordering, computes SHA-256, and emits a manifest.
6. Final-review evidence stores artifact metadata, source revision, generator
   version, checksum, review state, and external-review status. It does not
   become fiscal transaction truth.
7. The API returns only the authorized artifact or manifest for local capture or
   hard-copy projection.

## Ownership and module placement

| Surface | Owner | Authoritative source | Permission boundary | Rollback boundary |
| --- | --- | --- | --- | --- |
| POS fiscal runtime | POS | `posRepository.js`, transaction, adjustment, and fiscal-event models | Existing POS route and action permissions | Revert runtime code while preserving fiscal records and audit evidence |
| Compliance readiness | Compliance | `complianceUseCases.js`, `complianceRepository.js`, final-review document/signoff models | `VIEW_SETTINGS`, `EDIT_SETTINGS`, and `VIEW_AUDIT` on existing compliance routes | Revert additive metadata only; preserve final-review rows/signoffs |
| Reports | POS for terminal; Business Admin for back-office read models | Report registry plus POS-owned snapshots and fiscal repository | Report view/export permissions plus tenant/location scope | Revert projections/exports without rewriting source snapshots |
| POS UI | POS UI | Authorized POS/compliance API responses | Server capabilities; no frontend fiscal rules | Revert UI independently; no record deletion or mutation |
| Migrations | Migration runner | Existing migration contract and reviewed additive schema | Tenant scope and rollback evidence required before runtime phase | Tested down path or explicit preservation plan |
| Evidence documents | Compliance documentation | Requirements registry and final-review records | Tenant-scoped, checksum-bound, explicit internal/external-review state | Remove generated local artifacts and links only |

## Fiscal source-of-truth contract

The evidence layer is a read-only projection of existing source records:

| Entity | Source | Derived evidence | Immutable for evidence | Tenant/location scope |
| --- | --- | --- | --- | --- |
| Issued fiscal document | `PosTransaction`, `PosFiscalEvent`, POS repository | Receipt, adjustment link, e-Journal record, sample pack | Yes | Tenant and location |
| Adjustment | `PosTransactionAdjustment`, POS repository | Return/void evidence, original-document link, audit, e-Journal | Yes | Tenant and location |
| X/Z reading | `PosZReadingSnapshot`, POS repository | Print projection, reconciliation, e-Journal appendix | Yes | Tenant and location |
| Report | Report registry, POS repository, Business Admin fiscal repository | Sample, CSV/TXT/PDF, reconciliation | Yes | Tenant and location |
| Audit | `AuditLog`, tenant compliance audit log, compliance repository | Filtered export, manifest, review evidence | Yes | Tenant and location where applicable |
| Version/connectivity | POS shell and server route/runtime state | Version screenshot, connectivity evidence, build reference | Yes | Tenant and terminal context |
| Evidence review | Final-review document/signoff models and compliance repository | Readiness link, packet, review state | Review metadata is mutable by authorized reviewer | Tenant |

No second fiscal ledger or duplicate readiness store is introduced. Existing
final-review persistence is the reviewed integration point; any schema
extension is a later, separately approved runtime phase.

## Guardrails

- Backend forbidden imports: `@sieitzz/pos-receipt`, `packages/pos-receipt`,
  and `packages/web-core`.
- Evidence generation must not mutate fiscal source records, create a duplicate
  fiscal ledger, cross tenant or location scope, or infer fiscal status from an
  invoice prefix.
- Every planned route, model, migration, and UI surface must declare an owner,
  permission, source of truth, and rollback boundary.
- Determinism requires the explicit inputs `source_snapshot`, `policy_version`,
  and `serializer_version`; the outputs are artifact bytes, stable record order,
  and SHA-256. Database incidental order is not sufficient.
- A fiscal lifecycle, e-Journal grammar, append-only contract, immutable source
  field, activation-gate, or receipt-renderer ownership change triggers the
  ADR 0039 path before implementation. Section 03 itself requires no ADR
  amendment because it records boundaries only.

## Requirements and acceptance

| ID | Control | Section 03 result | Runtime result |
| --- | --- | --- | --- |
| BR-401 | One authoritative source for fiscal transactions, adjustments, readings, reports, and audit evidence | Implemented in contract | Deferred by plan |
| BR-402 | Evidence generation is read-only against fiscal sources | Implemented in guardrails and source map | Deferred by plan |
| DATA-401 | Historical snapshots preserve issued document and source version | Implemented in source map and determinism contract | Deferred by plan |
| SEC-401 | Reads/exports are tenant-, location-, and permission-scoped | Implemented in surface contracts | Deferred by plan |
| NFR-401 | Same source/policy/serializer versions produce the same bytes, order, and checksum | Implemented in determinism contract | Deferred by plan |
| ADR-401 | Fiscal contract changes follow ADR 0039/0042 review | Implemented in impact gate | Deferred by plan |

The Section 03 validator independently checks:

- `AC-430`: route/controller/usecase/repository/model order is preserved;
- `AC-431`: evidence cannot rewrite or become fiscal source truth;
- `AC-432`: planned surfaces carry owner, permission, source, rollback, scope,
  and deterministic metadata; and
- `AC-433`: ADR impact is identified before a fiscal contract change.

## Risk controls

- `R-030` second ledger: prevented by the no-duplicate-store guardrail.
- `R-031` endpoint bypass: controlled by route permission declarations and the
  existing compliance route middleware.
- `R-032` report read-model drift: controlled by explicit POS-owned snapshot
  sources and report ownership in the contract.
- `R-033` missed ADR impact: controlled by the explicit trigger list and
  validator requirement.

## Verification status

The machine-readable contract is
`docs/compliance/evidence/annex-b-items-4-14-architecture-contract-v1.json`.
The independent validator is
`scripts/validate-annex-b-items-4-14-architecture.cjs`, with negative-path
tests in `scripts/validate-annex-b-items-4-14-architecture.test.cjs`.

Section 03 is **implemented and locally verified** as an architecture/control
contract. No database, runtime, route, migration, UI, staging, production, or
external-review state was changed. Runtime behavior remains assigned to later
phases, beginning with Phase 354.
