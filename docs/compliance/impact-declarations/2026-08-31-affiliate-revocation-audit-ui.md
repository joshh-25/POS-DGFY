---
status: reference
owner: engineering
last_reviewed: 2026-08-31
declaration_id: 2026-08-31-affiliate-revocation-audit-ui
classification: major
surfaces: pos,terminal
reason_codes_impacted: none
policy_version: 2026.08.30
verification_evidence: packages/web-core/src/features/pos/__tests__/AffiliatesWorkspacePanel.behavior.test.jsx (6 passed),npm run build:skupervisor,npm run build:pos,npm run check:architecture,npm run check:compliance,npm run lint:docs
rollback_note: Revert the shared AffiliatesWorkspacePanel audit display, its focused component test, this declaration, and the Phase 215 ledger entry together. The change only renders existing GET /affiliates fields; it adds no API call, status-event dependency, database lookup, persisted state, or financial/POS operation behavior.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-02T03:56:16.394Z
preflight_request_ref: PREFLIGHT-33588602895-2026-08-31-AFFILIATE-REVOCATION-AUDIT-UI
---

# Affiliate Revocation Audit UI

## Compliance Impact Classification

`packages/web-core/src/features/pos/components/AffiliatesWorkspacePanel.jsx` is within the
`^packages/web-core/src/features/pos/` rule in `scripts/check-compliance-impact.js`; that rule
sets the `pos,terminal` surface floor to `major`. The classifier applies by path even though this
is a read-only owner/admin presentation change, so this declaration is required rather than
optional.

## Affected Surfaces

1. **POS / terminal back-office panel** — the existing Affiliates workspace renders the three
   fields already returned by `GET /affiliates/affiliates`: `revoked_at`, `revoked_by`, and
   `revocation_reason`.
2. **No API or identity-resolution surface** — `revoked_by` remains an opaque tenant-user ID. The
   enrollment is in the landlord database and the referenced users are tenant-database records, so
   this change deliberately adds no cross-database foreign key, lookup, extra endpoint, or actor
   name/email display.

## Compliance Preconditions

1. No checkout totals, discounts, tax/VAT, payment, cashout, commission, receipt, refund, void,
   shift, terminal-operation, or persisted transaction behavior changes.
2. The displayed block is an audit of the latest pre-existing suspension/revocation stamp, not a
   status-events timeline. It neither reads nor depends on Phase 214/#1202's proposed status-events
   endpoint/table.
3. The current enrollment status remains visible separately, so a preserved audit stamp on an
   active/reactivated enrollment is not represented as its current state.
4. Missing actor/reason values use explicit text fallbacks, and reasons are rendered as text rather
   than injected markup.

## Verification Evidence

1. `packages/web-core/src/features/pos/__tests__/AffiliatesWorkspacePanel.behavior.test.jsx` —
   6/6 passing: existing-field rendering, preserved audit after reactivation, null fallbacks,
   absent stamp, invalid timestamp, and existing empty state.
2. `npm run build:skupervisor` and `npm run build:pos` validate both applications that consume this
   shared panel.
3. `npm run check:architecture`, `npm run check:compliance`, and `npm run lint:docs` are run in the
   implementation validation set.
4. `preflight_request_ref` is `NOT-EXECUTED-PHASE-215` because this is a `develop`-targeted PR.
   Per `docs/compliance/request-time-preflight-protocol.md`, this is the accepted placeholder until
   the promotion-time STAGING preflight sweep evaluates the declaration; no live preflight is
   claimed by this PR.
