---
status: authoritative
owner: pos
last_reviewed: 2026-08-08
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

The implementation phase must add a tenant-scoped delivery-person registry.
Each active person must have:

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
  location scope.
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

- manual delivery orders show a typed courier-name field and an auditable assign
  or reassign action;
- lifecycle actions are hidden until assignment evidence is present;
- provider-owned delivery jobs are explicitly read-only in POS;
- assignment and lifecycle controls are disabled while locked, offline, without
  an open shift, or without `pos:transact` permission;
- the compact queue continues to show the delivery provider and current status.

Registered personnel remain supported for existing assignments, but cashier
assignment no longer depends on a registry lookup or a personnel dropdown.

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

## Permissions and ownership

- `pos:view` may read delivery status and assignment details.
- `pos:transact` may assign a registered delivery person or type a third-party
  courier name and advance the manual
  delivery lifecycle when the authenticated user owns an open shift at the
  order location.
- Delivery-person registry creation, editing, activation, and deactivation
  belong to an administrator/settings authority. Cashiers may use registered
  personnel but may also assign an unregistered third-party courier by name;
  this does not create or modify the registry.
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
