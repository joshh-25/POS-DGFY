---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-07-10
last_reviewed: 2026-09-01
review_by: 2027-01-10
applies_to: architecture_decision
topic: manual_delivery_job_foundation
---

# ADR 0034: Manual Delivery Job Foundation

## Decision

Keep `pos_transactions` as the canonical online-order and sales record. Add a tenant-local `delivery_jobs` record only for `order_method=delivery`, created in the same transaction as the online order.

The initial provider is `manual` and the initial state is `pending_dispatch`. This adds no courier API, rider data, live tracking, or Storefront endpoint/UI change. Provider dispatch, signed courier webhooks, event inbox/outbox processing, and inventory reservation are separate follow-up phases.

## Consequences

- Existing Storefront checkout, quote, tracking, and POS status routes remain unchanged.
- A failed delivery-job write rolls back the associated online order creation.
- Future provider integrations must update this ADR and use the modular delivery boundary rather than adding provider calls to Storefront or POS components.

## Validation

- `npm run check:architecture` (root; chains `check:architecture-guardrails` and
  `check:controller-boundaries` in `apps/dgfy-api`)
- Apply the landlord migration and run `npm --prefix apps/dgfy-api run repair:tenant-schema` before enabling delivery checkout in an environment.
- Confirm `npm --prefix apps/dgfy-api run doctor:runtime` is healthy and `npm --prefix apps/dgfy-api run check:tenant-schema` completes without failed tenants.

## Amendments

### 2026-08-07 — POS manual delivery lifecycle control

POS may advance a tenant-local `manual` delivery job through the guarded
transitions `pending_dispatch -> assigned -> picked_up -> delivered` while the
associated online order is `out_for_delivery`. Each mutation requires the
authenticated cashier's open shift at the order location, uses idempotent replay
protection, and records an audit event. POS cannot mutate provider-owned jobs or
write `failed`/`cancelled` states; courier integrations and provider lifecycle
events remain separate follow-up work.

### 2026-08-08 — Manual delivery assignment contract

The manual lifecycle requires a first-class tenant-scoped delivery-person
assignment before `picked_up`, `delivered`, or order completion. Assignment
must record the selected person, assigning actor, location, shift, and
timestamp. The assignment must not be represented only through
`provider_payload`; that field remains an integration seam rather than the
source of truth for POS assignment or accountability.

Cashiers with `pos:transact` may select an active delivery person and advance a
manual job only from an open shift at the order location. Administrator/settings
authority owns the delivery-person registry. Provider-owned jobs remain
read-only in POS. The detailed lifecycle, completion, payment, failure, and
acceptance contract is maintained in
`docs/features/POS_MANUAL_DELIVERY_WORKFLOW.md`.

### 2026-08-12 — Third-party courier name assignment

Manual POS delivery assignment may use either an active registered
`delivery_personnel_id` or a trimmed first-class `delivery_personnel_name` for
third-party couriers that are not registered in the tenant POS. The assignment
still requires the authenticated cashier, open shift, location scope, audit
record, idempotency key, and the guarded delivery lifecycle. The typed name is
stored on `delivery_jobs` and is not placed only in `provider_payload`.

### 2026-08-31 — Delivery Runs: grouped delivery jobs with accountable and crew personnel

A **Delivery Run** (`delivery_runs`) groups many `delivery_jobs` rows via a nullable
`delivery_jobs.delivery_run_id`. `delivery_jobs.pos_transaction_id` remains UNIQUE — the run is a
new grouping entity above the job, and the 1:1 order↔job relationship of the original Decision is
unchanged.

A run carries N delivery personnel in `delivery_run_personnel`, exactly one of which is marked
accountable. At most one accountable row per run is enforced in the schema by a stored generated
column plus a unique index; at least one is enforced by the run use case before a member job is
added or the run is dispatched.

The accountable person satisfies the existing per-job contract, it does not bypass it. The run
writes the accountable person through into each member job's assignment fields, so the 2026-08-08
amendment's requirement — "Assignment must record the selected person, assigning actor, location,
shift, and timestamp" — continues to hold for every job. The write-through reuses the existing
assignment use case; no second assignment path is authored.

Non-accountable personnel are recorded on the run for operational context only and carry no
per-job accountability. A member of `delivery_run_personnel` may be either a registered
`delivery_personnel_id` or a trimmed free-text name, on the same terms the 2026-08-12 amendment
already grants `delivery_jobs`.

Membership is keyed on `delivery_jobs`, never on `packed`. `delivery_jobs` rows are created
identically for every workflow mode; the retail `packed` fulfillment status is a retail-UI-only
concept. Keying run membership on the job keeps the mechanism workflow-mode-agnostic and does not
lock F&B out.

Everything the 2026-08-08 amendment requires stays unchanged: authenticated cashier, open shift at
the order location, location scope, audit record, idempotency key, the guarded
`pending_dispatch -> assigned -> picked_up -> delivered` lifecycle, and administrator/settings
authority over the delivery-person registry. Provider-owned jobs remain read-only in POS.

Still out of scope, unchanged from the original Decision: courier API integration, live tracking,
rider-facing logins, provider dispatch, route optimization, fleet tracking. A run is a manual
operational grouping, not a logistics engine.

### 2026-09-01 — Delivery Runs: best-effort dispatch and the `dispatched` lifecycle

Dispatching a run (`POST /pos/delivery-runs/:deliveryRunId/dispatch`) is **best-effort, per-order**,
not all-or-nothing: every eligible member's order is advanced `-> out_for_delivery` and its
`delivery_jobs.status` from `pending_dispatch -> assigned` independently, and the call returns three
buckets — orders actually dispatched, orders already dispatched (idempotent no-op), and orders that
failed with a reason code — rather than succeeding or failing as a unit. A single stuck or
mis-configured order in a run of forty must never block the other thirty-nine from going out.

`delivery_runs.status` gains a real `dispatched` state (the enum value already existed since the
2026-08-31 amendment's own migration; this amendment is what starts writing it). The run flips to
`dispatched` when **at least one** member ends the call `out_for_delivery` — not all — matching the
best-effort contract above: if the fan-out produced zero successes, run status is left untouched and
the call still returns 200 with an empty `dispatched` list and a full `failed` report; the endpoint
never 409s at the run level for a fan-out that produced no successes, since the per-order report IS
the result. A run never advances to `completed` from this endpoint — that is out of scope here.

`dispatched` is deliberately **not** added to the locked-status set this endpoint itself checks
(`RUN_DISPATCH_BLOCKED_STATUSES`, `completed`/`cancelled` only): re-dispatching an already-dispatched
run is the retry path for stragglers left behind by an earlier partial dispatch, an idempotency-key
retry, or a personnel change. Every other run mutation (personnel replace, membership add) still
treats `dispatched` as locked, unchanged from the 2026-08-31 amendment's own guards on those
endpoints — this amendment narrows the lock for the dispatch action alone, not run mutation
generally.

A member already `out_for_delivery` when dispatch runs — whether from a prior dispatch call or
because the endpoint was called twice with different idempotency keys — is detected before the
order-transition guard and reported as `skipped`/`ALREADY_DISPATCHED`, a genuine idempotent no-op,
distinct from the durable operation-replay idempotency key the endpoint also honors. Its job is
still advanced to `assigned` if it was left behind at `pending_dispatch` with an otherwise-complete
assignment, so a straggler job can never get permanently stuck one status behind its own order.

**The #1272 packing precondition, and why it does not reopen the additive-by-design promise.** A
retail-only (`normalizeWorkflowMode(mode) === 'retail'`), run-level, pre-fan-out precondition: if any
member's order `fulfillment_status` has not yet reached `packed` (i.e. is `placed`, `confirmed`, or
`preparing`), the whole dispatch call 409s (`DELIVERY_RUN_UNPACKED_MEMBERS`, naming every offending
order) and writes nothing — dispatch does not start at all. This is a precondition **on the dispatch
action**, evaluated before any per-order write; it does not touch, and is fully compatible with, the
2026-08-31 amendment's own statement that *membership* — joining `delivery_jobs` to a run — is never
keyed on `packed`. `ONLINE_FULFILLMENT_TRANSITIONS` (the shared per-order state-machine map) is not
modified by this gate at all: F&B (workflow mode not `retail`) skips the packing check entirely and
dispatches exactly as it would have before this amendment, matching the 2026-08-31 amendment's own
"does not lock F&B out" principle. A run member that is `cancelled`/`rejected` is not part of this
gate either — it is reported as an ordinary per-order fan-out failure, not a reason to block the rest
of the run.

Everything the 2026-08-08 and 2026-08-31 amendments require continues to hold for the dispatch write:
authenticated cashier, one open shift check for the whole run, location scope, an audit record (one
run-scoped row plus one per successfully-dispatched member), the durable idempotency-key replay
mechanism, and administrator/settings authority over the delivery-person registry. Provider-owned
jobs remain out of scope; this endpoint only ever advances `manual` jobs.
