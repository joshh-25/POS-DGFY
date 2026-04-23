---
status: reference
owner: engineering
last_reviewed: 2026-04-23
related_adr: 0007-dual-mode-pos-compliance-program.md,0011-compliance-downgrade-escape-hatches.md
declaration_id: 2026-04-23-admin-force-non-compliant-and-pos-catalog-hardening
classification: regulatory
surfaces: compliance,pos,terminal,settings,frontend,testing,docs
reason_codes_impacted: AUTHORIZATION_FAILED,MODE_TRANSITION_NOT_ALLOWED,ALLOWED,VALIDATION_FAILED
policy_version: 2026.04.23
verification_evidence: npm run lint:docs,npm run check:architecture,npm run check:compliance,npm run gate:release:local
rollback_note: Revert tenant compliance-usecase/controller updates and POS catalog repository changes together, then re-run docs, architecture, and compliance gates before redeploy.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-04-23T16:40:00+08:00
preflight_request_ref: RELEASE-CLEANUP-DOCS-SYNC-2026-04-23
snapshot_commit: cb543bf5f63b76d07f0870c44363b024b6739b2c
---

# 2026-04-23 Admin Force-Non-Compliant and POS Catalog Hardening

## Compliance Impact Classification
Regulatory

## Affected Surfaces
- Compliance lifecycle controls in tenant admin/compliance modules.
- Admin force-non-compliant flow behavior and related authorization/error handling.
- POS catalog repository behavior tied to compliance-sensitive guardrails.
- Tenant management frontend behavior for compliance state transitions.
- API and docs updates aligned with compliance-sensitive flow changes.

## Compliance Preconditions
1. Governed downgrade rules from ADR 0011 remain fail-closed and auditable.
2. Admin-only force-non-compliant paths remain authorization-gated.
3. Compliance-sensitive request handling continues to emit deterministic reason-coded failures.
4. Release keeps architecture and compliance gates mandatory before production deploy.

## Verification Evidence
- `npm run lint:docs`
- `npm run check:architecture`
- `npm run check:compliance`
- `npm run gate:release:local`
