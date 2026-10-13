---
status: draft_pr
owner: DGFY POS
last_reviewed: 2026-10-10
declaration_id: 2026-10-07-pos-customer-display
classification: major
surfaces: pos,terminal,settings,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.10.07
verification_evidence: customer-display Vitest tests,real-time completion handoff tests,customer-display Playwright E2E,POS settings contract tests,POS lint,POS production build,git diff --check
rollback_note: Revert the customer-display route, synchronization wiring, settings controls, tests, and this declaration; no backend, database, migration, or tenant-data change is included.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-07T15:54:06.387Z
preflight_request_ref: PREFLIGHT-37646533737-2026-10-07-POS-CUSTOMER-DISPLAY
---

# POS customer-facing display synchronization

## Compliance Impact Classification

Major because the changed shared POS feature files are classified under the `pos` and `terminal`
surfaces, and the feature adds a settings activation control. The customer-facing window receives
the cashier's already-computed cart and committed payment summary through a session-scoped,
same-origin transport. The customer route is read-only and does not create, authorize, calculate,
persist, or alter a transaction.

## Affected Surfaces

- `pos` — customer-display route, read-only order table, payment confirmation, and thank-you state.
- `terminal` — cashier cart projection, customer-display session lifecycle, and real-time completion handoff after the server checkout commit.
- `settings` — terminal-scoped customer-display activation and open/end session controls.

## Compliance Preconditions

- The server remains the source of truth for payment totals, tendered amount, and change amount;
  the customer display only formats values returned by the committed transaction.
- The display transport validates protocol version, session ID, terminal ID, message type,
  revision, timestamp, and non-negative display-safe monetary fields before rendering.
- The customer route does not expose cashier authentication state or add a second payment or
  persistence path.
- Existing POS checkout authorization, fiscal document behavior, audit logging, inventory updates,
  and payment processing remain unchanged.
- No backend route, database schema, migration, or tenant-data change is included.
- The `NOT-EXECUTED-*` preflight reference is a validator-required PR-open placeholder; no live
  request-time preflight is claimed by this local commit, and the continuous compliance sweep must
  reconcile it.

## Verification Evidence

- Customer-display behavior and synchronization tests pass, including the committed payment
  summary, cash change, thank-you state, stale revision rejection, and session close behavior.
- The POS checkout shell forwards the committed transaction to the live customer-display
  controller before post-checkout hardware and refresh work, and settings-controller contract
  tests cover the activation/session wiring.
- The same-origin Playwright customer-display E2E passes for active order rendering and the
  completed payment state.
- POS lint and production build pass, and `git diff --check` reports no whitespace errors.
- The repository compliance gate validates this declaration against the changed POS feature files.
- The follow-up synchronization extraction is covered by the shared `posCustomerDisplaySync`
  utility, the `usePosCustomerDisplaySync` hook, and their POS contract tests; it preserves the
  same session-scoped, same-origin transport and does not add a backend or persistence path.
- Follow-up blocker fix: restored the `Eye` icon import used by `POSCheckoutTerminalView.jsx`; this
  is a lint/runtime reference repair and does not change the feature's behavior or compliance
  surfaces.

## Amendment — 2026-10-10 — Terminal display handoff integration

- Change: The checkout terminal publishes the current safe cart projection through the shared
  customer-display hook, and the terminal header can open the scoped customer-display window only
  when tenant, terminal, and location identity are available.
- Security boundary: The display remains read-only and same-origin; the terminal continues to own
  checkout state and no payment or persistence path is added.
- Validation: POS customer-display contract coverage, POS build/lint, and the repository compliance
  gate.
