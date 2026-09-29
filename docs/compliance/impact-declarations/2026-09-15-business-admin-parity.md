---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-15
declaration_id: 2026-09-15-business-admin-parity
classification: regulatory
surfaces: pos,terminal,settings,payments,inventory,compliance
reason_codes_impacted: BUSINESS_ADMIN_READ_MODEL,ALLOWED
policy_version: 2026.09.15
verification_evidence: Business Admin contract tests; authenticated API smoke; desktop/mobile Playwright render; API/POS lint and build; architecture and documentation checks; migration status; git diff check
rollback_note: Revert the Business Admin module, additive migrations, POS workspace, payment query adapters, routes, permissions, tests, documentation, and declaration together; no historical transaction, payment, inventory, or fiscal record is rewritten.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-29T11:32:45.991Z
preflight_request_ref: PREFLIGHT-36561910280-2026-09-15-BUSINESS-ADMIN-PARITY
---

# Business Admin / Back Office parity

## Compliance Impact Classification

Major because the change adds a tenant-scoped administrative read and control
plane over POS operations, payment evidence, inventory valuation, terminal
state, and account configuration. The implementation preserves canonical
command ownership and does not recalculate money, copy stock, or alter fiscal
classification.

## Affected Surfaces

- POS and terminal transaction, shift, refund/void, register, order, and
  approval visibility.
- Payment-session, refund, and reconciliation evidence projections.
- Inventory stock, FIFO valuation, low-stock, recipe, and branch-scope reads.
- Tenant-scoped settings, membership/access, notification lifecycle, and audit
  projections.

## Compliance Preconditions

- All queries remain tenant- and branch-scoped through the existing auth and
  membership contracts; unauthorized Business Admin access fails closed.
- POS, payment, inventory, catalog, fiscal, identity, Storefront, and F&B
  mutations remain owned by their existing command surfaces. The approval
  endpoint returns a conflict when the canonical POS decision command is not
  available rather than creating a duplicate money-changing path.
- The additive migrations create only saved-view, alert, notification-state,
  report-index, and approval-request structures. They do not rewrite historical
  transactions, payments, inventory, customer identities, or fiscal evidence.
- Expense accounting, biometric attendance, BIR/CAS accreditation, provider
  payout settlement, and optional terminal heartbeat remain explicit policy or
  external gates documented in `docs/features/backoffice.md`.

## Verification Evidence

- Business Admin contract tests cover access denial, payment reconciliation
  projection, and approval fail-closed behavior.
- Authenticated local API smoke reaches all Business Admin read surfaces and
  unauthenticated access returns 401; migrations report no pending work.
- Desktop and 390px mobile Playwright renders show the full navigation, no
  horizontal page overflow, no console errors, and successful Orders
  navigation without Business Admin request failures.
- The scoped POS settings-sync bridge remains metadata-only: an accepted
  tenant/branch Business Admin event refreshes the open POS terminal metadata
  and the clean SettingsWorkspace draft, while dirty local settings remain
  untouched. The authenticated
  `apps/dgfy-pos/tests/e2e/business-admin-pos-settings-sync.spec.js` test
  passed for Masu Cafe from Warn → Enforce and restored the original value.
- API/POS lint and POS production build pass; architecture guardrails,
  controller-boundary checks, documentation lint, and `git diff --check` pass.

**Live request-time compliance preflight was not executed.** This declaration
uses the documented `NOT-EXECUTED-*` placeholder for local work; it must be
reconciled by the governed preflight process before promotion. No production
deployment, merge, push, or production data mutation was performed.
