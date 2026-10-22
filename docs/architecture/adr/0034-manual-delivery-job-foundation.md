---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-07-10
last_reviewed: 2026-10-22
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

### 2026-10-22 — Direct delivery lifecycle (#2667)

For a manual delivery job outside an active delivery run, the staff-facing POS flow is
Confirmed → Preparing → Waiting for rider (`ready_for_rider`) → Picked Up
(`out_for_delivery`) → Delivered (`completed`). Retail may retain its Packed step.
Assignment is available from Confirmed onward, and a courier company is required
for early direct assignment. A company can be an in-house rider, Maxim,
GrabExpress, Lalamove, or an Other name. An in-house rider can be identified by
an active registry entry or a typed name; a third-party company may be recorded
before a named rider is known. The complete assignment remains attributed to
the staff actor, shift, and timestamp. This amends the 2026-08-07
out-for-delivery-only control and
the 2026-08-08 selected-person requirement for direct orders. Active run members
retain their previous assignment and dispatch rules.

Picked Up changes both job and order status in one locked transaction. Delivered
changes the job to `delivered`, records any remaining payment as a distinct
payment event, verifies zero balance, and completes the order in one idempotent
transaction. This answers #908. ADR 0063 clauses 3 and 11 still require terminal,
cashier, open-shift and atomic zero-balance completion. ADR 0083 clauses 2 and 7
still separate customer payment recognition from courier custody; no custody or
remittance record is written by this action.

Failed requires a reason, marks the job `failed` and order `cancelled`, releases
reservation without restocking issued goods, and invokes the store-origin refund
path after commit. Staff Reject marks a manual delivery job `cancelled`. These
rules amend the 2026-08-07 prohibition on POS writing failed/cancelled states.

The public tracking route now includes only customer-safe courier company,
booking reference, HTTPS link, and explicitly typed rider name, plus a
store-attributed failure reason. This amends the original Consequences statement
that tracking routes remain unchanged; registry names and staff identifiers stay
private. Existing status, payment, and job routes continue accepting legacy
requests while native clients migrate (dgfy-mobile#439). No courier API, GPS
tracking, or delivery-run lifecycle change is authorized here. `[default]`

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

### 2026-09-01 — The per-order Incoming Queue control is withheld for active run members

Purely a presentation-layer fact, recorded here because it is a real behavioral contract, not
because any clause above changes: once an order's `delivery_jobs.delivery_run_id` points at a run
whose `status` is neither `completed` nor `cancelled`, the Active Queue's own per-order
"Out for Delivery" control (`TerminalOperationsPanels.jsx`) is disabled with an explanatory tooltip
rather than hidden — the run's own Dispatch action (the 2026-09-01 best-effort-dispatch amendment
above) becomes the sole path to `out_for_delivery` for that order. This is a UI gate only; the
per-order fulfillment route itself enforces nothing new and `ONLINE_FULFILLMENT_TRANSITIONS` is
untouched, exactly as the packing-precondition amendment above already establishes for a different
gate on the same dispatch action.

The gate mirrors `RUN_DISPATCH_BLOCKED_STATUSES` (`completed`, `cancelled`) rather than inventing a
separate rule, because cancelling a run does not clear its members' `delivery_run_id` — only the
explicit remove-member action does — so `delivery_run_id` truthy alone cannot distinguish "still an
active run member" from "was in a run that got cancelled." Every other member of `nextActions` for
that order, in particular `packed`, is left untouched: gating the whole action list at `preparing`
in retail mode would deadlock the `DELIVERY_RUN_UNPACKED_MEMBERS` precondition above, which requires
every run member to reach `packed` before the run can dispatch at all.

### 2026-09-13 — Delivery-completion evidence and recipient signature (#1462)

Manual delivery jobs may carry an optional, append-only completion-evidence record in two tenant-local
tables: one parent row per `delivery_job` and zero or more staff-captured image rows. The parent may
also carry one recipient-supplied signature image. The schema/API split is intentional: staff images
and recipient signature are distinct facts and must remain distinct in the response contract. This
evidence documents a delivery operation; it does not redefine `delivered`, gate order completion, or
claim provider/payment verification. `[default]`

The attach route accepts evidence for a manual job in any non-`failed`/non-`cancelled` state, so
evidence capture cannot become a hidden precondition of the existing lifecycle. A broad POS operator
may attach through `pos:transact`; otherwise the authenticated staff member must hold
`delivery_runs:act` and be either the job's direct registered assignee or a member of its delivery
run. Read metadata and authenticated image streams use the existing `pos:view` or
`delivery_runs:view_assigned` read permissions. No terminal pairing or active-operator middleware
is required because these are delivery-job/order-status actions rather than terminal-hardware
actions. `[default]`

The upload is bounded to five staff images and one optional signature, with a 15 MB source limit per
file. Every source is magic-byte validated, normalized to a private tenant-scoped WebP object with
orientation/GPS metadata removed, and served only through authenticated `private, no-store` routes.
API responses expose only evidence counts, image IDs, signature presence, actor, and timestamp;
storage paths, hashes, and file metadata remain repository/use-case concerns. `[default]`

The attach operation uses the generic POS operation-replay mechanism. Its request fingerprint
contains the order/job identity and the raw uploaded-file SHA-256 digests, so a same-key identical
retry returns the cached response without another database row or storage write, while a changed
payload conflicts. A genuinely new submission is attach-once and returns `409` after an evidence
record already exists. An all-empty submission is valid and records that the authorized actor
completed the evidence step without captured media. `[default]`

Retention is explicitly set to the life of the tenant/order record for this phase. No automated purge
or erasure endpoint ships here; manual operational purge remains possible out-of-band, and bounded
retention, export, and erasure work is deferred to #243. This is a deliberate privacy decision for
handwritten signatures and address imagery, not an omission. `[default]`

### 2026-09-14 — Delivery-run loading verification (#1461, Phase 333)

Manual delivery runs now carry a per-member loading verification state with four explicit values:
`pending`, `loaded`, `not_loaded`, and `exception`. A member remains `pending` until an operator
records a state; `not_loaded` is an explicit operational result and must not be conflated with an
unmarked member. `exception` requires a non-empty reason, and changing to another state clears the
old reason. The fields are tenant-local on `delivery_jobs`, with the marking actor and timestamp
recorded for auditability. `[default]`

The run-level confirmation records the authenticated actor and timestamp and is idempotent through
the existing POS operation-replay mechanism. Both member marking and run confirmation use
`pos:transact`, matching the existing delivery-run mutation authority; no assigned-run-specific
capability is introduced. `[default]`

### 2026-09-14 — Assigned delivery staff lifecycle actions (#1549, Phase 335)

An authenticated staff member with `delivery_runs:act` may advance a currently assigned manual
delivery job through `assigned -> picked_up -> delivered` without an open POS shift. Assignment is
rechecked inside the locked transaction: the actor must be the job's current direct registered
assignee or a member of its current Delivery Run, and must hold a grant for the order location.
Run-less direct assignments remain valid. The narrow path never claims or changes `order.shift_id`;
its audit event records `shift_id: null` while retaining actor, location, transition, and timestamp.

The existing `pos:transact` path is unchanged and still requires an owned open shift. This exception
is limited to the delivery-job status route and does not extend to checkout, cash-drawer/payment
operations, assignment, the full incoming queue, general order status, or provider-owned jobs.
`GET /users/me/assignments` may expose only the actor's current manual delivery jobs in a validated
location, using the same direct-assignee/run-membership rule and a public-safe order projection.
`[default]`

Dispatch remains warn-only with respect to loading verification. It may dispatch members that are
`pending`, `not_loaded`, or `exception`, and its response identifies the dispatched orders in those
categories. Loading confirmation is an operator attestation and is not a dispatch precondition,
fulfillment transition, payment rule, or provider integration. `[default]`

### 2026-10-22 — Customer cancellation and run/order status audit (#2666)

A customer cancellation through Storefront or the linked DGFY account cancels a tenant-local
manual delivery job while it is `pending_dispatch` or `assigned`. This is a server-owned customer
action, not a POS staff transition. It leaves the job's delivery-run membership and personnel
attribution intact; a cancelled member remains a per-order dispatch failure under the 2026-09-01
best-effort dispatch rule. The job cancellation and order status change each write an audit row in
the order transaction. Run create/edit/cancel/un-cancel and staff online-order fulfillment
transitions likewise write transactional audit rows. `[default]`
