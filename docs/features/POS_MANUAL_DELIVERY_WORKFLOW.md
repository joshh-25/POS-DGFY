---
status: authoritative
owner: pos
last_reviewed: 2026-09-01
applies_to: pos_manual_delivery_workflow
---

# POS Manual Delivery Workflow

## Scope

This contract defines the DGFY-native online delivery workflow before an
external courier provider is integrated. The current provider is `manual`.
The `pos_transactions` row remains the canonical order and sales record;
`delivery_jobs` remains the tenant-local delivery-operation record.

Phase 0 records the behavior contract only. It does not change the database,
API, or POS UI.

## Required lifecycle

An online delivery order must follow this sequence:

```text
pending_dispatch -> assigned -> picked_up -> delivered -> completed
```

| State | Required condition | Allowed next action | Can complete order? |
| --- | --- | --- | --- |
| `pending_dispatch` | Delivery job exists; no delivery person is assigned yet | Assign a registered person or enter a third-party courier name | No |
| `assigned` | A registered person or typed third-party courier name, assignment actor, and assignment timestamp exist | Mark picked up | No |
| `picked_up` | The assigned delivery person collected the order | Mark delivered | No |
| `delivered` | Delivery confirmation was recorded by an authorized POS actor | Complete the online order | Yes, after payment rules pass |
| `completed` | Delivery job is delivered and order completion succeeds | None | Final |

The backend remains authoritative for every transition. The POS must never
skip directly from `pending_dispatch` to `delivered` or `completed`.

## Manual delivery assignment contract

A tenant-scoped delivery-person registry exists (Phase 205, #1080; the `delivery_personnel`
table itself was created earlier, in the Phase 0 migration). Each active person has:

- a display name;
- a contact number;
- an active/inactive state; and
- creation and update audit metadata.

Each delivery job assignment must record:

- either the selected delivery-person identifier or a trimmed third-party courier name;
- the user who assigned the job; and
- the assignment timestamp.

Assignment data must not be stored only in `provider_payload`. That JSON field
is an integration seam and is not a substitute for validated, queryable,
auditable assignment data.

## Phase 2 API boundary

The backend exposes the following guarded POS operations:

- `GET /pos/delivery-personnel` returns active personnel in the authorized
  location scope (`pos:view`).
- `GET /pos/delivery-personnel/registry` returns the full registry, including
  inactive rows by default, for administrator/settings management
  (`pos:employees:manage`, Phase 205/#1080).
- `POST /pos/delivery-personnel` creates a registry row
  (`pos:employees:manage`, Phase 205/#1080).
- `PATCH /pos/delivery-personnel/:deliveryPersonnelId` updates a registry row;
  `is_active: false` is the deactivation operation -- there is no separate
  delete route and no hard delete (`pos:employees:manage`, Phase 205/#1080).
- `PATCH /pos/orders/:id/delivery-job/assignment` assigns or reassigns an
  active person before pickup and records the assigning user, open shift, and
  timestamp.
- `PATCH /pos/orders/:id/delivery-job/status` rejects `assigned`, `picked_up`,
  or `delivered` transitions unless the assignment evidence is complete.

Assignment and lifecycle mutations require `pos:transact`, an online delivery
order already marked `out_for_delivery`, a `manual` delivery job, and an open
cashier shift at the order location. The assignment endpoint is idempotency-key
protected and writes the assignment plus the `pending_dispatch -> assigned`
transition in one transaction.

## Phase 3 POS controls

The POS Incoming Online Queue now provides the operator workflow for the API
boundary:

- manual delivery orders show a courier field that offers registry entries via
  a picker (Phase 205/#1080) **and** still accepts a typed third-party courier
  name, plus an auditable assign or reassign action;
- lifecycle actions are hidden until assignment evidence is present;
- provider-owned delivery jobs are explicitly read-only in POS;
- assignment and lifecycle controls are disabled while locked, offline, without
  an open shift, or without `pos:transact` permission;
- the compact queue continues to show the delivery provider and current status.

Registered personnel are offered through a registry-backed picker; cashier
assignment never *requires* a registry lookup -- typing an unregistered
third-party courier name still works exactly as before, and exactly one of a
registered person or a typed name is sent per assignment, never both.

## Phase 5 regression hardening

The automated POS regression suite must keep the following invariants covered:

- completion of a manual delivery requires complete assignment evidence
  (a registered `delivery_personnel_id` or `delivery_personnel_name`, assigning
  actor, open-shift reference, and timestamp)
  in addition to `delivery_job.status=delivered` and the applicable payment
  evidence;
- assignment is rejected before `out_for_delivery`, for provider-owned jobs,
  and when an idempotency key is reused with a different payload;
- provider-owned delivery jobs remain read-only in POS;
- successful assignment, lifecycle transitions, replay behavior, and audit
  side effects remain covered by backend use-case tests.

Run the focused regression suite with:

```text
npm --prefix backend test -- --runInBand --runTestsByPath tests/posDeliveryAssignment.usecase.test.js tests/posDeliveryJobStatus.usecase.test.js tests/posDeliveryCompletionGuard.usecase.test.js
```

## Delivery run membership, write-through, and removal (Phase 225, #1273/#1081)

Phase 224 added the schema (`delivery_runs`, `delivery_run_personnel`,
`delivery_jobs.delivery_run_id`); Phase 225 wires the actual membership API.
A delivery run groups many `delivery_jobs` rows under one or more delivery
personnel, with exactly one marked accountable, ahead of Phase 228's
whole-run dispatch.

### API boundary

- `POST /pos/delivery-runs` creates a run in `draft` status (`pos:transact`).
- `GET /pos/delivery-runs`, `GET /pos/delivery-runs/:deliveryRunId` read runs
  and their personnel/members (`pos:view`).
- `PATCH /pos/delivery-runs/:deliveryRunId` edits label/date/notes and moves
  between `draft`/`scheduled`/`cancelled` only -- `dispatched` and `completed`
  are rejected here; those transitions belong to Phase 228 (`pos:transact`).
- `PUT /pos/delivery-runs/:deliveryRunId/personnel` replaces the **whole**
  personnel roster in one call, not an incremental add/remove. `delivery_run_
  personnel` enforces "at most one accountable" via a STORED generated column
  plus a unique index; an incremental edit would pass through a transient
  two-accountable or zero-accountable state the index would reject mid-edit.
  Exactly one row must be `is_accountable: true` (`pos:transact`).
- `POST /pos/delivery-runs/:deliveryRunId/members` adds up to 500 orders to
  the run in one call (`pos:transact`).
- `DELETE /pos/delivery-runs/:deliveryRunId/members/:posTransactionId` removes
  one order from the run (`pos:transact`). One-at-a-time; no bulk-removal
  need has been identified.

No new permission string: runs reuse `pos:transact`/`pos:view`, the same
authority already granted for per-order delivery assignment, exercised here
in bulk.

### Membership eligibility -- keyed on `delivery_jobs` only

Adding an order to a run requires, atomically for the whole batch: an online
delivery order, a `manual` delivery job (provider-owned jobs stay read-only,
unchanged from the per-order contract above), the job still
`pending_dispatch`, the order's location matching the run's `location_id`
(a run is single-location), and the job not already a member of a
*different* run (already a member of *this* run is a no-op).

**`fulfillment_status` (e.g. `packed`) is deliberately never checked.**
Membership keys on `delivery_jobs` alone. This is what keeps F&B orders --
which may never reach `packed` -- eligible for a delivery run on the same
terms as a retail order that does.

### Write-through: fields now, status at dispatch

A run must have exactly one accountable person before any member can be
added (`DELIVERY_RUN_ACCOUNTABLE_REQUIRED` otherwise). When a job is added,
the accountable person's identity is written through into that job's
assignment fields (`delivery_personnel_id`/`_name`, `assigned_by`,
`assigned_shift_id`, `assigned_at`) in the same transaction --
**`delivery_jobs.status` is deliberately left at `pending_dispatch`.**

This reuses the exact same write path as the per-order assignment endpoint
above (`applyDeliveryPersonnelAssignment`, extracted from that endpoint's
use case) with job-status advancement turned off, rather than a second,
divergent write path. The existing lifecycle rule --
"`assigned`/`picked_up`/`delivered` requires an open shift and an order
that is `out_for_delivery`" -- stays intact: a run is populated *before*
dispatch, so nothing here advances a job past `pending_dispatch`. Phase 228
owns the actual dispatch transition.

Replacing the personnel roster (`PUT .../personnel`) re-runs this
write-through for every still-`pending_dispatch` member job whose current
assignment matches the *previous* accountable person, so swapping the
accountable rider updates every job the run is still responsible for. A
job whose assignment was overwritten per-order, or that has moved past
`pending_dispatch`, is left alone and reported separately rather than
silently overwritten.

### Removal: conditional clear, not always-clear or always-keep

Removing a member from a run always clears `delivery_jobs.delivery_run_id`
-- that is the removal. Whether the assignment fields written by the run
are also cleared is conditional, not automatic in either direction:

**The assignment is cleared only when both hold:**

1. the job is still `pending_dispatch` (nothing downstream has consumed the
   assignment yet); and
2. the job's current personnel identity still equals the run's accountable
   person (same `delivery_personnel_id`, or the same free-text name
   case-insensitively).

**Otherwise the assignment is left untouched**, and the response reports
`assignment_cleared: false` with a reason code
(`DELIVERY_JOB_ASSIGNMENT_LOCKED` when the job has moved past
`pending_dispatch`; `DELIVERY_ASSIGNMENT_NOT_RUN_OWNED` when the identity no
longer matches -- for example a per-order reassignment happened after the
run wrote through).

This is a deliberate choice, not the only option considered:

- **Always leaving the assignment** would let a stale accountable-person
  record silently satisfy the assignment-required completion gate above,
  even though nobody currently agreed to carry the order once it left the
  run -- exactly the accountability gap this whole feature exists to close.
- **Always clearing the assignment** would destroy a record the run did not
  create (a per-order assignment made before the order joined the run, or
  overwritten afterward), and could strand a job that has already moved past
  `pending_dispatch` (a courier may be physically holding the parcel).
- **Identity-matching, gated on `pending_dispatch`,** was chosen over adding
  a new "who wrote this assignment" provenance column, since Phase 224's
  schema had already merged and reopening it for an API-only phase was not
  justified. The accepted trade-off: if a job was assigned per-order to
  person X and later added to a run whose accountable person is also X,
  removing it from the run clears an assignment the run did not originate --
  judged strictly better than the alternative false negative (a live order
  still carrying an accountable person nobody agreed to).

## Delivery run management UI (Phase 226, #1273/#1270)

Phase 225 wired the API; Phase 226 puts a management surface over it inside the POS terminal.

### Where it lives, and who sees it

A third "Delivery Runs" tab sits alongside Active Queue / Order History in the terminal's incoming-
orders workspace, **retail mode only** -- gated on
`normalizeWorkflowMode(workflowMode) === 'retail'`, the same check `orderFulfillmentUi.js` already
uses for the `packed` handoff step. This is a UI-visibility gate only: the run API itself stays
mode-agnostic (membership is keyed on `delivery_jobs`, never on `packed` -- see above), so an F&B
tenant is not locked out at the data layer, only from this particular tab. If the workflow mode
flips off retail while the tab is open, the view falls back to Active Queue automatically rather
than continuing to render a tab that no longer applies.

### What the tab does, and does not, do

From the tab an operator can: create and edit a run (label, scheduled date, notes, and -- once a
run exists -- its `draft`/`scheduled`/`cancelled` status); replace its personnel roster in one save
(exactly one person marked accountable, enforced client-side before the request is even sent, on
top of the server's own enforcement); and, per member order, remove it from the run or move it to
another run.

**Setting personnel before adding members is surfaced, not just enforced.** The server already
409s `DELIVERY_RUN_ACCOUNTABLE_REQUIRED` if a run with no accountable person is asked to add a
member; this UI additionally shows an inline warning on the run's detail view whenever it has no
accountable person, so the operator sees the constraint before attempting the action rather than
only after a rejected request.

**"Move to another run" is remove-then-add, because that is what the server actually offers.**
There is no dedicated move endpoint -- `POST .../members` refuses a job already assigned to a
*different* run (`DELIVERY_JOB_ALREADY_IN_RUN`). A move is therefore always two separate requests:
remove the member from its current run, then add it to the target run. This is not atomic: if the
add fails after the remove already succeeded, the order is left in no run at all. The confirm
dialog states this two-step nature before the operator commits to it, and on an add failure the UI
shows a persistent error naming the order and target run and refreshes both runs so the operator
can see the order is unassigned and retry the add from the target run's own view.

**Bulk-adding orders from the Active Queue is not built yet.** An operator adds an order to a run
only from that order's own delivery-assignment context, one at a time (unchanged from Phase 225's
API-only state). Multi-select "add to run" from the Active Queue is Phase 227's job; a run with no
members shows an honest empty state ("No orders in this run yet. Add orders from the Active
Queue.") rather than implying bulk-add already exists.

### Active Queue delivery-run filter (Phase 229, #1290)

The Active Queue's header controls row (next to `Sort`) carries a `Delivery run` filter --
`All orders` (default) / `Unassigned (no run)` / one option per visible run -- that narrows the
already-fetched order list client-side by `deliveryJob.delivery_run_id`. Zero backend change:
Phase 227 already added that field to every queue order.

**Deliberately not built on the same eligibility list the assign-to-run picker uses.** That list
(`getEligibleRunTargets`) excludes dispatched/completed/cancelled runs because it answers "which
run can I add *more* orders to." A dispatched run's members are still sitting in the Active Queue as
`out_for_delivery` orders -- exactly what an operator most wants to filter to -- so the filter's own
option list (`getQueueRunFilterOptions`) keeps `dispatched` runs and only excludes
`completed`/`cancelled`.

**Client-side, not a server param**, because the Active Queue has no pagination to begin with
(F-1, unchanged since Phase 227) -- the whole list is already in the browser, so a client filter is
exact. If the Active Queue ever gains server-side pagination, this filter becomes wrong (it would
filter one page rather than the whole run); the migration path is a `delivery_run_id` query param
switched in later, not built preemptively here.

**A filter-hidden selection is never silently submitted.** The bulk "add to run" selection's
eligible/drift derivation, and the target picker's own `orders` prop, all operate on the *filtered*
list, not the full one -- an order selected before the filter was applied is neither auto-submitted
nor auto-dropped while hidden; a hint names how many selections are currently hidden, and clearing
the filter restores them.

Retail-mode gated identically to the tab above, and cleared by the same mode-flip reset effect. The
filter and the assign-to-run picker now share one `GET /pos/delivery-runs` fetch
(`useDeliveryRunOptions`) so the two views can never disagree about which runs exist.

## Permissions and ownership

- `pos:view` may read delivery status and assignment details.
- `pos:transact` may assign a registered delivery person or type a third-party
  courier name and advance the manual
  delivery lifecycle when the authenticated user owns an open shift at the
  order location.
- Delivery-person registry creation, editing, activation, and deactivation
  belong to an administrator/settings authority, concretely `pos:employees:manage`
  (Phase 205/#1080; reused from the employees module rather than a new permission
  string). Cashiers may use registered personnel but may also assign an
  unregistered third-party courier by name; this does not create or modify the
  registry.
- Provider-owned delivery jobs remain read-only in POS.
- Every mutation records the authenticated actor, tenant, location, shift,
  previous state, new state, and timestamp.

## Completion and payment rules

The existing completion guard remains mandatory:

- delivery job status must be `delivered`;
- a registered delivery person or third-party courier name must be assigned;
- delivery confirmation actor and timestamp must exist; and
- cash-on-delivery orders must contain server-recorded cash evidence before
  completion.

For the implementation phase, delivery confirmation must use the customer's
tracking PIN or an equivalent server-verified confirmation. A cashier must not
be able to claim delivery based only on a browser-side status change.

## Failure behavior

- Missing delivery job returns a deterministic conflict and keeps the order
  incomplete.
- Missing assignment blocks `picked_up`, `delivered`, and order completion.
- Invalid transitions return `409` and do not mutate the delivery job.
- Replayed mutation requests are safe and do not create duplicate audit events.
- Failed or cancelled delivery recovery requires a separately authorized
  supervisor action; it must not silently complete the order.

## Architecture contract

The implementation must preserve the modular boundary:

```text
routes -> controllers -> usecases -> repositories -> models
```

Controllers remain transport-only. Delivery business rules belong in POS
use-cases, persistence belongs in POS repositories, and migrations/models are
tenant-scoped and additive.

## Phase 0 acceptance criteria

Phase 0 is complete when:

1. The lifecycle and completion rules above are documented and approved.
2. The difference between manual status tracking and a real courier backend is
   explicit.
3. Assignment is a first-class, auditable domain value rather than an
   unvalidated JSON-only field.
4. Cashier, administrator, and provider-owned-job permissions are defined.
5. Missing assignment and invalid transition behavior is defined.
6. Phase 1 can implement the contract without changing the canonical sales
   ownership model.

## Deferred scope

This contract does not yet implement courier APIs, rider logins, live tracking,
provider webhooks, automated dispatch, or external delivery fees. Those belong
to a later provider-integration phase and must use the existing `DeliveryJob`
provider seam.
