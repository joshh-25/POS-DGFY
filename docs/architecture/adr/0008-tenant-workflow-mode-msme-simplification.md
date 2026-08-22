---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-04-10
last_reviewed: 2026-08-22
review_by: 2027-02-22
applies_to: architecture_decision
topic: tenant_workflow_mode_msme_simplification
---

# ADR 0008: Tenant Workflow Mode (Manufacturing vs MSME)

## Status
Accepted (2026-04-10)

## Context
SKUpervisor already supports a tenant compliance lifecycle (`non_compliant_active`, `compliant_pending`, `compliant_active`) for fiscal/regulatory behavior.

Operational complexity requirements are separate:
1. Manufacturing tenants need the full IMS/POS workflow.
2. MSME tenants need simplified IMS/POS/navigation for faster daily operations.

Before this ADR, there was no explicit tenant-wide workflow contract that could simplify UI/flows without mixing concerns with compliance mode.

## Decision
Adopt a tenant-wide workflow mode independent from compliance mode.

1. Introduce `ops_workflow_mode` with enum values:
   - `manufacturing`
   - `msme`
2. Keep workflow mode and compliance lifecycle fully independent.
3. Scope workflow mode at tenant level; only tenant master admin can change it.
4. Existing tenants default to `manufacturing`.
5. New tenant registration/provisioning requires explicit `workflowMode`.
6. MSME mode simplifies IMS + POS + shell navigation by hiding advanced surfaces, while preserving underlying data and routes for restore when switching back.
7. Hidden module access in MSME is enforced at route level, not only navigation rendering.
8. Mode switch is reversible and must not delete or rewrite hidden-domain data.

## Product/Architecture Consequences
1. Settings becomes the source-of-truth surface for runtime workflow mode.
2. IMS/POS UX can branch by workflow mode without altering backend compliance contracts.
3. MSME simplification can be rolled out in phases without schema-destructive migrations.
4. Route and permission checks remain defense-in-depth when mode-gating module access.

## Guardrails
1. Workflow mode changes must not mutate compliance mode state.
2. Compliance gates for POS and receipt contracts remain unchanged.
3. Mode-aware forms should avoid destructive overwrites of hidden advanced fields.
4. Toggle behavior must be stable across open screens (explicit refresh prompt on active surfaces).

## Rollback Notes
1. Runtime rollback can disable MSME-specific UI gating and route blocks without data migration.
2. Tenant data remains intact because mode changes are non-destructive.

## MSME v1.1 Addendum (2026-04-13)
1. MSME item taxonomy is simplified to user-facing `Products` + `Supplies` while preserving legacy manufacturing category rows (`raw_material`, `packaging`) without destructive recategorization.
2. MSME `Sell in POS` preset maps to `category=product` and forces `product_type=finished_goods`; MSME `Inventory only` maps to `category=supplies`.
3. MSME non-draft item saves require both `cost_per_unit` and `default_sale_price`; margin entry is assistive only and manual sale-price override remains allowed.
4. MSME item forms support multi-supplier assignment inline, including quick supplier creation in-form, with deterministic replace-sync semantics at item level.
5. MSME purchasable eligibility includes `product` rows (plus legacy categories) for supplier coverage and PO selection because JO surfaces are hidden in MSME; manufacturing purchasable logic remains unchanged.

## Unified POS Setup UX Remediation Addendum (2026-04-13)
1. Single-item POS setup must be wizard-first (`Create/Edit Item`, `Create/Edit Product`, MSME `Add/Edit Item`) and not card-embedded, to reduce card density and prevent duplicated setup surfaces.
2. `pos_visible=true` transitions are readiness-gated at backend use-case level; unresolved readiness returns deterministic denial metadata (`reason_code`, `missing_requirements`) while `pos_visible=false` remains always allowed.
3. Frontend POS override interactions must consume deterministic denial metadata and present actionable remediation, not generic failure text.
4. Readiness UX should prefer backend-provided readiness contracts as source of truth; client-side fallback checks are display-only contingency.

## Tenant Documentary Self-Serve Addendum (2026-04-13)
1. Final Review documentary readiness is tenant-operational via tenant records and frontend submissions, not dependent on editing repository files.
2. Required documentary controls are represented as tenant-scoped records with source type (`upload` or `external_url`), quality/freshness metadata, and review state.
3. Checklist documentary resolver supports controlled source migration via `COMPLIANCE_DOCUMENTARY_SOURCE` (`hybrid`, `tenant_only`, `repo_only`), with `hybrid` used for rollout compatibility.
4. Final Review blockers must deep-link to specific missing documentary controls (`#final-review-doc-<code-slug>`) for deterministic remediation.
5. Authority boundary: tenant master admin can submit/update documentary records, while platform admin is the only actor allowed to revoke/restore documentary validity.
6. Compliance lifecycle semantics from ADR 0007 remain unchanged; this addendum changes documentary evidence sourcing only.

## Amendments (2026-08-22): MSME POS Online Order Queue

The MSME simplified POS retains the shared online-order fulfillment queue when
the tenant's effective `pos` and `storefront` capabilities are enabled:

1. MSME POS must render the `Orders` navigation action and the Incoming Online
   Queue view, including for tenants whose existing derived Store Profile was
   materialized before this amendment.
2. `show_online_queue` is a POS presentation default, not an authorization
   bypass. The existing authenticated POS permission, active-shift, location
   scope, tenant capability, and online connectivity checks remain mandatory
   before orders are read or mutated.
3. Services remains excluded from the shared online-order queue because its
   POS workflow is appointment-oriented; this amendment does not change the
   Services booking boundary.
4. The frontend must compare a persisted derived Store Profile with a current
   rebuild before using it. A stale profile must fall back to the current
   registry-derived profile so a historical `show_online_queue: false` value
   cannot hide an authorized MSME queue indefinitely.

This amendment changes an untagged/default workflow presentation rule only. It
does not change Storefront/POS ownership, order persistence, API shape, payment,
inventory, or shift lifecycle contracts.
