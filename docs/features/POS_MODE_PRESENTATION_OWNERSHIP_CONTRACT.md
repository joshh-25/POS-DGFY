---
status: authoritative
authority_level: authoritative
owner: product
last_reviewed: 2026-08-13
review_by: 2027-02-13
applies_to: pos,services,fnb,retail,store_templates
topic: pos_mode_presentation_ownership
---

# POS Mode Presentation Ownership Contract

## 1. Purpose And Status

This contract defines which cashier-facing POS presentation belongs to the
shared terminal shell and which presentation belongs only to F&B, Services,
or counter-selling workflows. Its purpose is to prevent a feature added for
one workflow from appearing in another workflow by accident.

Phase 75 freezes the ownership boundary and changes no runtime behavior,
database schema, API response, permission, route, transaction lifecycle, or
stored tenant profile.

## 2. Rewritten Objective

Keep one shared POS transaction engine while composing its user interface from
workflow-owned presentation bundles. F&B changes must remain inside the F&B
bundle, Services changes must remain inside the Services bundle, and genuinely
shared cashier functions must remain consistent across eligible workflows.

The POS must not become separate copied applications for each business type.

## 3. Authoritative Documentation Used

- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- ADR 0014: multi-template mode and centralized registry contract
- ADR 0016: Services Mode independence and booking lifecycle
- ADR 0019: F&B full-service restaurant workflow
- ADR 0056: Store Templates and materialized Store Profiles
- `docs/features/STORE_TEMPLATES_AND_PROFILES.md`
- `docs/features/SERVICES_MODE.md`
- `docs/features/FOOD_AND_BEVERAGE_MODE.md`
- `docs/features/POS_CASHIER_TERMINAL_FLOW.md`

All cited authoritative documents are within their configured review windows
as of 2026-08-13. Reference documents are used only for implementation context
and do not override accepted ADRs.

## 4. Architecture Classification

- Classification: `within-existing-boundary`
- ADR required for Phases 75-78 as scoped here: no
- New database migration: no
- New backend transaction lifecycle: no
- New template-table runtime lookup: prohibited
- New architecture exception or allowlist entry: prohibited

The existing tenant Store Profile remains the runtime source of effective
configuration. Presentation resolves from `profile.pos_workflow` or from the
same shared registries used to materialize it; it must never dereference the
source Store Template at request time.

The presentation bundle is an affordance boundary. It does not replace
server-side authorization, capability gates, validation, inventory policy,
payment rules, or fiscal rules.

Adding a new persisted template/profile field, changing an enum, or adding a
new business lifecycle is outside this contract and requires a fresh
architecture classification before implementation.

## 5. Existing Foundation And Confirmed Gap

The repository already has the required workflow foundation:

- `packages/shared-constants/src/posWorkflows.js` resolves `fnb`, `services`,
  and `counter` presentation shapes from the workflow family and effective
  capabilities.
- `packages/shared-constants/src/storeProfile.js` materializes the same result
  into `profile.pos_workflow`.
- `FnbWorkflowPanel.jsx` and `ServicesWorkflowPanel.jsx` already isolate the
  checkout-detail fields for their respective workflows.
- Their focused component test already proves that F&B terminology is absent
  from the Services workflow panel and Services terminology is absent from
  the F&B workflow panel.

The confirmed gap is the large shared
`packages/web-core/src/features/pos/components/POSCheckoutTerminal.jsx` component
(shared trunk consumed by `apps/dgfy-pos` and `apps/dgfy-ims` via `@sieitzz/web-core`).
Its Current Sale action block renders Parked Sales and Park & New Sale without
consulting the resolved workflow. Consequently, Services currently receives
generic order-oriented wording and future edits to the shared action block can
leak across workflow modes.

Scattered conditions such as `posWorkflow.mode === 'fnb'` are acceptable only
at one composition boundary. They are not the long-term ownership mechanism
for individual buttons throughout the terminal.

## 6. Presentation Composition Contract

The future terminal composition is:

```text
Tenant Store Profile
        |
        v
Resolved POS Workflow
        |
        v
Shared POS Shell and Transaction Engine
        |
        +-- F&B presentation bundle
        +-- Services presentation bundle
        +-- Counter presentation bundle
```

Rules:

1. The shared shell owns infrastructure and financial behaviors that have the
   same meaning across eligible workflows.
2. A workflow bundle owns the controls, labels, validation prompts, and local
   presentation state that express that workflow's operational meaning.
3. A workflow-specific component may be imported only by its bundle or by the
   single bundle-composition boundary.
4. The bundle resolver must fail closed to the existing `counter` presentation
   when it receives a supported non-F&B, non-Services counter workflow.
5. Existing Hospitality behavior remains unchanged until Hospitality receives
   a separately governed presentation contract; this work must not silently
   reclassify it.
6. A Store Template selects or materializes capabilities. It does not contain
   executable UI code or a merchant-defined list of arbitrary buttons.
7. A hidden control never grants or removes authority. The backend remains the
   authority for every protected operation.

## 7. Frozen Ownership Matrix

| Surface or behavior | Owner | Required rule |
| --- | --- | --- |
| Terminal authentication, company/location scope, and active shift | Shared shell | Preserve existing permission and session controls |
| Catalog search, scan, category browsing, cart lines, quantity, totals | Shared shell | Item taxonomy and stock policy still come from governed data |
| Checkout submission, tax, governed discount, split tender, receipt, transaction history | Shared transaction engine | One financial implementation; never copied into workflow bundles |
| Printer availability and cash drawer control | Shared hardware surface | Continue permission and device checks |
| F&B dine-in, takeout, table number, kitchen notes, kitchen/floor affordances | F&B bundle | Never render in Services |
| Services walk-in/appointment, client, provider, resource, service notes | Services bundle | Never render in F&B or generic counter |
| Counter walk-in, pickup, and delivery method presentation | Counter bundle | Must not inherit tables, kitchen, providers, or bookings |
| Parked-sale persistence and resume lifecycle | Shared transaction capability | Presentation and eligibility are workflow-owned |
| `Parked Sales`, `Park & New Sale`, and resumed-sale labels | F&B/counter presentation initially | Must not render unchanged in Services |
| Services appointment continuity | Services booking presentation | Appointments use the booking lifecycle, not parked-sale wording |
| Services walk-in temporary hold | Services presentation, deferred decision | May become `Held Services` / `Hold Service`; runtime enablement requires a separately approved behavior phase |
| Online queue and delivery assignment | Retail/F&B storefront operational surface | Render only where the effective profile exposes the relevant operation; never render or poll it in Services |

## 8. Parked-Sale Decision For Services

Parked-sale persistence is not inherently F&B-only, but the current cashier
presentation is order-oriented and must not be exposed unchanged in Services.

The frozen recommendation is:

- Appointment work uses the governed Services booking lifecycle.
- Services does not display `Parked Sales` or `Park & New Sale` labels.
- A future Services walk-in hold may reuse the safe parked-sale persistence
  primitive only through Services-owned labels, eligibility, and tests.
- Until that follow-up behavior is explicitly approved, extraction must favor
  hiding the order-oriented controls in Services rather than implying that a
  parked order is a booking.

This contract does not cancel, migrate, rename, or alter any existing parked
sale record.

## 9. State And Data Safety

- Workflow presentation changes must not alter cart arithmetic, payment
  allocation, receipt totals, inventory movement, or fiscal snapshots.
- Browser recovery pointers remain transaction-state mechanisms; opening Sell
  must not automatically open a workflow dialog.
- Existing parked sales and split-payment sessions remain recoverable under
  their current server contracts.
- Mode-specific form state must reset only at the same successful lifecycle
  boundaries that reset the shared sale.
- No workflow bundle may trust client-side visibility as authorization.

## 10. Required Test Contract

The implementation phases must add behavior-level regression tests, not only
source-string checks:

1. A Services profile renders client/provider/resource/appointment controls
   and does not render dine-in, table, kitchen, or unchanged parked-sale
   controls.
2. An F&B full-service profile renders dining and kitchen controls and does not
   render Services client/provider/resource controls.
3. An F&B counter-service profile resolves to the counter presentation and
   does not render table or kitchen controls removed by its effective profile.
4. Shared checkout, split payment, receipt, shift, discount, and cart behavior
   remains available wherever its existing permission/capability rules allow.
5. Adding an F&B-only control to the F&B bundle cannot change the rendered
   Services terminal.
6. Unknown or incomplete presentation input does not broaden capabilities.
7. Desktop and narrow/mobile layouts preserve reachable checkout actions and
   do not reintroduce workflow controls through a second action surface.

## 11. Continuous Delivery Phases

### Phase 75: POS Mode Presentation Ownership Contract

- Freeze this ownership matrix and the no-duplication rules.
- Record the confirmed shared-action leakage.
- Make no runtime, database, or API changes.

### Phase 76: Presentation Bundle Foundation

- Introduce one centralized frontend bundle resolver driven by the existing
  resolved POS workflow.
- Define shared and workflow-owned presentation slots without changing
  transaction behavior.
- Add resolver and fail-closed fallback tests.

### Phase 77: F&B And Services Presentation Isolation

- Move workflow-specific checkout details and Current Sale actions behind the
  bundle boundary.
- Keep F&B behavior inside the F&B bundle.
- Keep Services behavior inside the Services bundle and hide unchanged
  order-oriented parked-sale controls.
- Preserve the shared financial and state engines.

### Phase 78: Cross-Mode Protection And Closure

- Add rendered cross-mode regression coverage for full-service F&B,
  counter-service F&B, Services, and generic counter.
- Validate desktop and narrow/mobile action reachability.
- Run focused tests, POS production build, documentation lint, and architecture
  guardrails.
- Update operational documentation and close the initiative only when every
  required negative-visibility assertion passes.

### Phase 79: Services Navigation And Online Queue Isolation

- Keep Services bookings in the Services Today/Calendar lifecycle.
- Remove the retail/F&B `Orders` queue from Services desktop and mobile
  navigation, stale-view restoration, notifications, and background polling.
- Keep `Orders` unchanged for eligible retail, F&B, and counter workflows.
- Correct the Services Store Profile default while failing closed at runtime
  for already-materialized profiles that still contain the legacy value.

## 12. Phase 75 Acceptance Gates

- [x] Existing Store Profile and POS workflow resolution were confirmed as the
  source of presentation mode.
- [x] Shared, F&B, Services, and Counter ownership is frozen.
- [x] The current shared-action leakage is documented with its exact component.
- [x] Services parked-sale presentation is explicitly classified rather than
  assumed to be shared.
- [x] Hospitality compatibility is protected from silent reclassification.
- [x] No runtime code, database schema, API contract, permission, tenant data,
  parked sale, or payment session was changed.
- [x] Phase 76 has an implementation-ready entry contract.

## 13. Phase 76 Entry Gate

Phase 76 may begin only after explicit approval. It is limited to the bundle
resolver, presentation-slot contract, and focused tests. It must not change
checkout persistence, payment behavior, booking behavior, parked-sale records,
database schema, API routes, or Store Profile persistence.

## 14. Phase 76 Completion Record (2026-08-13)

Phase 76 implemented the approved presentation foundation without changing
cashier behavior:

- [x] `resolvePosPresentationBundle()` maps the already-resolved POS workflow
  to F&B, Services, or Counter presentation ownership.
- [x] Invalid or incomplete resolver input fails closed to Counter and cannot
  gain F&B or Services controls.
- [x] Hospitality retains its existing F&B-shaped POS presentation until a
  separately governed Hospitality presentation contract exists.
- [x] Shared catalog, cart, checkout, payment, discount, receipt, shift, and
  hardware slots remain one shared implementation.
- [x] The current Current Sale action block is explicitly marked
  `legacy_shared`; its behavior and visibility remain unchanged until Phase 77.
- [x] Checkout-detail panel composition moved behind one
  `PosCheckoutDetailsSlot` boundary with no label, field, validation, or
  submission change.
- [x] Focused resolver, rendered slot, existing workflow-panel, workflow
  resolver, and composition contract tests pass.
- [x] Targeted frontend lint has zero errors, the POS production build passes,
  and documentation/architecture checks pass.
- [x] The locked POS shell renders at desktop and narrow widths with no browser
  console errors; authenticated workflow interaction remains Phase 78
  hardening evidence.

Phase 77 is the next eligible slice. It moves Current Sale presentation behind
the established bundle boundary and hides the unchanged order-oriented parked
sale controls in Services while preserving the shared parked-sale engine.

## 15. Phase 77 Completion Record (2026-08-13)

Phase 77 implemented the approved F&B and Services Current Sale isolation:

- [x] `PosCurrentSaleActions` is the single Current Sale action composition
  boundary and receives the resolved presentation bundle.
- [x] F&B and Counter retain `Parked Sales` and `Park & New Sale` with their
  existing handlers, disabled rules, labels, and persistence behavior.
- [x] Services renders no unchanged parked-sale controls and does not mount the
  parked-sales dialog presentation.
- [x] Services keeps Checkout, Print Order, Open Cash Drawer, and Apply Discount
  through the same shared callbacks and permission/device conditions.
- [x] Missing bundle input does not expose parked-sale controls.
- [x] Existing parked-sale persistence, resume, revision, checkout completion,
  and shift behavior remain unchanged. No record is cancelled, migrated,
  renamed, or deleted by the presentation change.
- [x] Thirty focused resolver, rendered action/detail, workflow, and
  parked-sale tests pass; two modified responsive composition checks pass.
- [x] Targeted frontend lint has zero errors, the POS production build passes,
  and documentation/architecture checks pass.
- [x] The locked POS shell renders at desktop and narrow widths with no browser
  console errors. Authenticated end-to-end cross-mode proof remains the Phase
  78 closure gate.

Phase 78 is the next eligible slice: cross-mode protection and closure. It
must validate the finished F&B, counter-service F&B, Services, and Counter
presentation contracts, including authenticated rendered evidence where a
safe local session is available.

## 16. Phase 78 Completion Record (2026-08-13)

Phase 78 closed the approved presentation-bundle initiative with cross-mode
and responsive protection:

- [x] One rendered matrix exercises full-service F&B, counter-service F&B,
  Services, and generic Counter through the governed workflow resolver,
  presentation resolver, checkout-details slot, and Current Sale actions.
- [x] Every profile has explicit positive and negative visibility assertions;
  F&B terminology is absent from Services and Services terminology is absent
  from F&B and Counter presentations.
- [x] Counter-service F&B resolves to Counter and receives neither dining-table
  nor kitchen presentation.
- [x] Shared Checkout, Print Order, Open Cash Drawer, and Apply Discount
  callbacks remain reachable and behavior-identical in all four profiles.
- [x] Sequential F&B and Services rendering proves that presentation state does
  not leak between mode renders.
- [x] Services keeps four two-column, minimum-46-pixel action targets. The
  compact three-column rule is limited to desktop-width F&B/Counter action sets
  that actually include parked-sale controls.
- [x] Thirty-six focused presentation/workflow/parked-sale tests and two
  affected responsive assertions pass; targeted lint and the POS production
  build pass.
- [x] The locked local POS shell renders nonblank at desktop and narrow capture
  sizes with no error-level console entries. Authenticated mode switching was
  not fabricated because no safe local credentials were available; the
  deterministic rendered four-profile matrix supplies the closure evidence.
- [x] Documentation/ADR lint, architecture guardrails, and whitespace checks
  pass.
- [x] No API, database, Store Profile, permission, payment, booking, parked-sale,
  inventory, receipt, transaction, or shift behavior or record changed.

The POS Mode Presentation Bundles Release 1 initiative is complete. Phase 79
was subsequently approved as a narrow Services navigation isolation phase.

## 17. Phase 79 Completion Record (2026-08-13)

Phase 79 removes the unrelated storefront order-fulfillment queue from the
Services cashier experience without changing booking or order records:

- [x] Services renders its `Services` navigation and does not render `Orders`
  in either desktop or mobile navigation.
- [x] A stale restored `incoming_queue` view is rejected by the existing
  active-view guard and returns to the normal Services checkout workspace.
- [x] Services clears queue state, does not request or poll incoming orders,
  and cannot produce incoming-order notification badges.
- [x] The Services Store Profile default now sets `show_online_queue` to
  `false`; the runtime workflow guard also rejects a legacy Services profile
  that still says `true`.
- [x] Eligible F&B, retail, and counter workflows retain their existing
  capability-gated Orders queue behavior.
- [x] Focused rendered navigation, source-contract, and Store Profile
  equivalence tests pass, including all updated golden snapshots.
- [x] Targeted frontend lint has zero errors; POS and SKUpervisor production
  builds, documentation/ADR lint, and architecture guardrails pass.
- [x] The local locked POS shell restores successfully with no error-level
  browser console entries. Authenticated Services behavior is covered by the
  deterministic rendered regression because no safe credentials were used.
- [x] No API route, database schema, tenant record, booking, online order,
  transaction, payment, inventory, receipt, or shift state changed.

Phase 79 is complete. Phase 80 is the next eligible repository phase number;
no Phase 80 scope is planned by this initiative.
