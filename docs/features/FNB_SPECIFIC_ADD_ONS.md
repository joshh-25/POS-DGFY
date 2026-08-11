---
status: authoritative
authority_level: authoritative
owner: product
last_reviewed: 2026-08-10
review_by: 2027-02-09
applies_to: fnb_menu_modifiers
topic: fnb_specific_add_ons
---

# Adds F&B Specific

This initiative delivers restaurant-native add-ons for Food & Beverage Mode. The canonical product and code term is **F&B menu modifier**. The phrase **Service add-on** belongs to Services Mode and must not label or govern F&B customization.

The existing modifier groups, options, item assignments, POS validation, Storefront selection, server-owned price calculation, and transaction snapshots are the baseline. This contract closes the remaining gaps in management, standalone POS selection, channel/location availability, inventory effects, and downstream operational presentation.

## Terminology

- A **variation** is a mutually exclusive sellable form of the same menu item, such as small, medium, or large. Variation modeling is outside Release 1 unless represented by an existing menu-item contract.
- A **modifier group** is a named customization rule attached to a menu item, such as `Milk choice` or `Extras`.
- A **modifier option** is a selectable value inside a group, such as `Oat milk` or `Extra cheese`, with a server-owned price delta.
- A **combo choice** is a constrained selection of another menu component. It is not silently modeled as free text.
- **Special instructions** are customer or cashier notes. They never change price, tax, stock, or required modifier validation.
- One-level conditional modifier groups are supported in Phase 20. Recursive modifier trees remain outside the current contract.

## Ownership And Boundaries

- Catalog and the F&B configuration surface own modifier definitions, item assignments, base menu prices, active state, and presentation metadata.
- Inventory owns stock truth, location availability, FIFO consumption, recipes, and stock movements for linked stock-bearing options.
- POS owns cashier selection, cart-line identity, checkout execution, tender, and immutable sale snapshots.
- Storefront owns public presentation and customer selection, but never authoritative price or availability decisions.
- Kitchen, receipt, refund, and reporting surfaces consume accepted transaction snapshots; they do not recalculate historical modifiers from current configuration.
- This initiative does not revoke the generic `menuModifiers` capability from other modes. It defines the F&B-specific experience and keeps Services option semantics governed separately.

## Selection Contract

- Every group defines `min_select` and `max_select`; `required` means at least one selection is required and must remain consistent with `min_select >= 1`.
- A group with `max_select = 1` is single-select. Larger limits are multi-select.
- Default options count toward limits and remain editable by the cashier or customer unless a later governed rule explicitly locks them.
- The backend validates active item assignment, active group and option state, minimums, maximums, duplicates, and tenant ownership at quote and checkout.
- Clients may send option identifiers and quantities only where the API explicitly supports them. They may not provide trusted names or price deltas.
- Lines with different modifier selections remain distinct cart/order lines. Identical selections may merge only when all price, tax, fulfillment, note, and snapshot inputs match.
- Missing required selections fail closed with the affected item and group identified.

## Price, Tax, And Snapshot Contract

- Authoritative unit price is the menu item's current sellable base price plus validated option deltas. The backend calculates totals; clients display previews only.
- Modifier tax treatment follows the governed tax treatment of the sold menu line unless a later tax ADR introduces an explicit modifier tax class.
- Accepted transactions snapshot group ID/name, option ID/name, option quantity when supported, unit price delta, extended delta, and the final line price used for settlement.
- Receipts, kitchen tickets, refunds, discounts, reports, and order history use accepted snapshots so later menu edits do not rewrite history.
- Refund calculations use the original accepted line and modifier values, not current catalog values.

## Channel, Location, And Availability

- Modifier groups and options may be visible independently to POS and Storefront and may be available per operating location.
- Inactive, unpublished, location-disabled, or sold-out options cannot be newly selected. Previously accepted snapshots remain readable.
- Storefront responses expose only currently publishable choices. POS may show unavailable choices for operational context but must prevent selection and explain why.
- Availability is revalidated by the backend at checkout to close stale-client and concurrent-order races.
- The current schema does not fully represent channel, location, and sold-out state. Phase 15 must introduce additive, tenant-local persistence and backward-compatible defaults before management UI exposes these controls.

## Inventory Contract

- A non-stock modifier changes price and preparation instructions only; it creates no stock movement.
- A physical or ingredient-backed option must link to governed inventory identity, currently represented by `sku_item_id` where applicable, or to a separately governed recipe/component contract.
- Linked consumption is location-scoped and uses Inventory's existing FIFO and idempotency contracts.
- POS consumes linked modifier stock through the accepted checkout path. Online orders consume it at the governed completion/fulfillment point, not merely when the customer submits an order.
- Recipe and direct-item paths must prevent double deduction when the same ingredient is represented in both a menu recipe and a modifier link.
- Availability preflight and final consumption use the same normalized selection snapshot and report the blocking option, required quantity, available quantity, UOM, and location.

## Management, Permissions, And Security

- Authorized operators can create, edit, order, activate/deactivate, assign, and unassign groups and options without deleting historical snapshots.
- Price, inventory link, channel, location, default-selection, and selection-limit changes require the existing F&B/catalog mutation permission. Read-only operators receive an explicit non-editable state.
- Tenant, location, item, group, and option identifiers are validated server-side. Cross-tenant references and caller-provided price deltas fail closed.
- Deactivation is preferred to destructive deletion when an option has transactional history.
- Every mutation uses existing authenticated APIs, validation, audit conventions, and cache invalidation patterns.

## Delivery Phases

| Phase | Scope | Exit condition |
| --- | --- | --- |
| 14 | Contract and architecture freeze | This contract, ADR amendment, and continuous ledger are authoritative and pass documentation governance. |
| 15 | Backend, database, and API foundation | Additive persistence and server validation cover channel/location availability, pricing, snapshots, and linked inventory without breaking existing modifier payloads. |
| 16 | F&B modifier management | Authorized operators can fully manage and assign modifier groups/options, including price and availability controls. |
| 17 | Standalone POS modifier picker | Cashiers can satisfy required/optional choices with authoritative totals and clear unavailable states. |
| 18 | Storefront ordering hardening | Online customers receive deterministic modifier selection, validation, pricing, and stale-availability recovery. |
| 19 | Kitchen, receipt, inventory, refund, and reporting integration | Every downstream surface uses the accepted snapshot and inventory movements remain accurate and idempotent. |
| 20 | Advanced modifier capabilities | Governed quantities, combo choices, and nested/conditional behavior are implemented only after the flat model is stable. |
| 21 | Final hardening and release evidence | RBAC, accessibility, responsive behavior, concurrency, regression, migration, rollback, and Playwright evidence pass. |
| 27 | Folder-scoped modifier inheritance | POS folder assignments inherit to menu items, with item-level precedence and explicit opt-out; POS and Storefront consume the same resolved assignment. |

Each phase requires separate approval. Planning a later phase does not authorize its implementation.

## Phase 14 Acceptance Gates

- [x] F&B menu modifiers are separated from Services add-ons in terminology and ownership.
- [x] Variation, modifier, combo, and special-instruction meanings are explicit.
- [x] Selection, pricing, tax, snapshot, channel, location, inventory, and permission rules fail closed.
- [x] Existing generic modifier capability and architecture ownership boundaries remain intact.
- [x] Phases 15-21 have explicit scopes, dependencies, and exit conditions.
- [x] Phase 14 introduces no runtime code, database migration, architecture allowlist, or destructive operation.

## Validation And Rollback

Validate Phase 14 with `npm run lint:docs`, `npm run check:adr -- --strict`, `npm run check:architecture`, and `git diff --check`.

Rollback is documentation-only: revert this feature contract, the ADR 0019 amendment, and the corresponding ledger entries together. Runtime behavior and stored data are unchanged by Phase 14.

## Phase 15 Backend, Database, And API Foundation

Phase 15 extends the flat modifier contract additively:

- Modifier groups and options persist `visible_in_pos` and `visible_in_storefront`, both defaulting to `true` for legacy compatibility.
- Modifier options persist global `is_sold_out`, defaulting to `false`.
- Normalized group and option location-availability tables reference tenant locations and use unique modifier/location pairs.
- POS and Storefront catalog repositories load availability records with assigned modifier groups and options.
- POS checkout rejects inactive, POS-hidden, globally sold-out, location-unavailable, location-sold-out, duplicate, and unassigned selections.
- Storefront quote/checkout rejects inactive, Storefront-hidden, globally sold-out, location-unavailable, location-sold-out, duplicate, and unassigned selections.
- Storefront now validates every published group, including required groups receiving zero selections.
- Server snapshots record linked inventory item identity and operating location. Dedicated linked-option FIFO posting remains Phase 19 to avoid double deduction with recipes.
- Creation validation rejects inconsistent limits/defaults and unavailable linked inventory item references.

### Phase 15 Acceptance Gates

- [x] Migration is additive, idempotent, tenant-local, and preserves legacy modifier availability defaults.
- [x] Sequelize models and associations expose channel and location availability without changing existing identifiers.
- [x] Backend creation accepts and validates the additive fields.
- [x] POS and Storefront enforce authoritative channel/location/sold-out state at checkout.
- [x] Required Storefront modifier groups fail closed when no option is submitted.
- [x] Snapshots preserve linked item and location identity without trusting client price/name fields.
- [x] Focused migration, F&B use-case, POS checkout, and Storefront tests pass.
- [x] No Phase 16 management UI or Phase 19 inventory posting behavior is introduced.

Phase 15 rollback runs the migration down only after confirming no Phase 16 management state depends on the new fields. Existing modifier groups/options and historical transaction snapshots are retained; only additive availability configuration is removed.

## Phase 16 F&B Modifier Management

- The standalone POS Items workspace exposes a structured **Menu modifiers** manager instead of requiring SKUpervisor for modifier creation and assignment.
- Operators can create and edit group names, selection limits, required/active state, ordering, and POS/Storefront visibility.
- Options support price deltas, defaults, active state, POS/Storefront visibility, sold-out state, ordering, and optional inventory-item links.
- Group location availability is editable using active tenant locations. The update API also accepts normalized option location overrides.
- Existing item-to-modifier assignment and kitchen-route workflows remain available below the manager.
- `PUT /fnb/modifier-groups/:modifier_group_id` uses the existing `menuModifiers` capability and manage-menu/inventory permission fallback.
- Updates validate group limits, defaults, linked active items, active locations, and option ownership server-side.
- Omitted existing options are deactivated rather than deleted so historical transaction snapshots remain valid.

Phase 16 rollback removes the structured manager and update route while retaining Phase 15 schema and checkout validation. No historical option or transaction data needs deletion.

## Phase 17 Standalone POS Modifier Picker

- Standalone POS cart lines with assigned F&B groups expose a reusable **Choose modifiers** action.
- The dialog supports single- and multi-select groups, required ranges, defaults, price deltas, and current-location availability.
- Inactive, POS-hidden, globally sold-out, location-unavailable, and location-sold-out choices are not selectable.
- Applying selections recalculates the cart line from its base sale price plus server-provided modifier and service-option deltas.
- Different customized lines retain independent line keys and modifier snapshots.
- Checkout performs a local required/range check and opens the affected line's picker when incomplete; backend validation remains authoritative.
- Existing `line_modifiers` payloads, offline snapshots, receipt snapshots, kitchen context, discounts, and VAT calculations are preserved.

Phase 17 rollback removes the picker and local pre-check only. Phase 15 backend validation continues to fail closed, and no stored modifier or transaction data is removed.

## Phase 18 Storefront Ordering Hardening

- Storefront product details preserve required, minimum, maximum, and default modifier metadata from the published catalog.
- Configured defaults are selected deterministically when a customer opens or refreshes an item detail route.
- Add to Cart and Buy Now fail locally with the affected group named when required or range rules are incomplete; quote and checkout remain server-authoritative.
- Single-select groups use one radio group, multi-select choices stop accepting additions at the configured maximum, and each group displays its required/optional range.
- Catalog serialization removes Storefront-hidden, globally sold-out, location-disabled, and location-sold-out groups/options for the selected operating location.
- A refreshed catalog replaces stale product-detail selections with currently published defaults, while quote and checkout reject any stale cart payload that races the refresh.
- Cart payload construction continues to submit modifier identifiers only; customer-facing names and price deltas are display hints and are never trusted by the backend.

Phase 18 rollback removes Storefront default selection, local selection gating, and location-aware catalog filtering while retaining the Phase 15 authoritative checkout validation. No stored order or modifier history is removed.

## Phase 19 Downstream And Inventory Integration

- Accepted modifier snapshots remain the source for kitchen tickets, receipt output, transaction history, void/refund processing, and reporting reads; current modifier configuration is never re-resolved for historical orders.
- POS checkout issues one location-scoped Inventory movement for each selected modifier option linked through `sku_item_id`, multiplied by the accepted parent-line quantity.
- Online orders defer the same linked-option consumption until the first transition to `completed`. Deterministic line-and-option references protect completion retries from duplicate posting.
- Menu recipe movements and linked modifier movements are independent: the base recipe is consumed once for the menu line, and each selected physical modifier is consumed once as the additional ingredient requested by the customer.
- Non-stock modifiers continue to affect price and preparation instructions without creating stock movements.
- POS void processing reverses the persisted transaction's actual stock movements, including recipe and linked-modifier issues, rather than recalculating from current menu configuration.
- Kitchen and receipt integrations continue to use the persisted option names and price deltas. Sales and refund totals remain based on accepted line prices, which already include modifier deltas.

Phase 19 rollback removes linked modifier movement creation from POS checkout and online completion only. Existing accepted snapshots and stock movements must not be deleted; any posted movement correction must use Inventory's governed adjustment workflow.

## Phase 20 Advanced Modifier Capabilities

- Modifier selections may carry a bounded quantity. The backend calculates unit and extended deltas and linked inventory consumption from the accepted quantity.
- A group uses explicit `group_kind`: legacy and ordinary groups are `modifier`; meal-bundle selection groups are `combo_choice`.
- Combo-choice groups are always required and must select at least one option. They reuse the hardened option assignment, price, channel, location, sold-out, snapshot, and inventory contracts rather than introducing a second checkout engine.
- Historical snapshots preserve group kind, option quantity, unit delta, and extended delta.
- A modifier group may reference one active parent option. POS and Storefront hide the child group until that parent is selected, and the backend rejects child selections submitted without the parent.
- Conditional activation is intentionally one level only; recursive parent/child modifier trees are not supported.

Phase 20 rollback is additive and evidence-driven. Before production use, the conditional-reference migration may be rolled down and reapplied. After accepted orders exist, persisted modifier snapshots must remain immutable, and any posted linked-inventory effect must be corrected through Inventory's governed adjustment workflow rather than deleted or recalculated.

## Phase 21 Final Hardening

- Standalone POS F&B modifier management presents an explicit read-only state when the signed-in operator lacks both the F&B menu-management permission and its governed item-edit compatibility permission. Backend capability and route permission checks remain authoritative.
- Component tests cover both authorized management controls and the view-only state.
- Storefront Playwright coverage exercises conditional modifier activation and deactivation with keyboard-only interaction, verifies focus and accessible input names, captures the active conditional state, and checks desktop and mobile layouts for horizontal overflow.
- Backend contract coverage revalidates server-owned pricing and rejects modifier selections that became hidden, globally sold out, unavailable at the selected location, or otherwise invalid before checkout.
- Migration rollback/reapply and tenant-schema registry tests protect additive rollout across existing tenants.
- Final evidence passed all focused frontend and backend suites, all three production builds, two live Storefront browser scenarios, and the complete 13-step F&B readiness gate.

Recursive conditional modifier trees remain intentionally unsupported. The `items:edit` compatibility permission remains governed by ADR 0020 and was not removed in this phase. Existing Browserslist-age, circular-chunk, and large-chunk build warnings are non-blocking follow-up concerns and do not change the Phase 21 functional verdict.

## Phase 22 Standalone POS Ownership Correction

- SKUpervisor is a reference source only for this workflow; the newly structured F&B modifier manager is not mounted in the SKUpervisor F&B page.
- Standalone POS exposes **Items → Menu modifiers** only for F&B tenants with modifier-view access.
- Authorized POS operators can create and edit groups/options and assign selected groups to a specific menu item. View-only operators receive explicit non-editable states.
- Services Mode continues to use its separate **Service add-ons** tab and semantics. Retail and other modes do not expose the F&B manager.
- Shared backend validation, Storefront publication, server-owned pricing, immutable snapshots, and linked inventory behavior are unchanged.

Phase 22 rollback removes the POS workspace tab and components only. It does not delete modifier definitions, item assignments, accepted snapshots, or inventory movements.

## Phase 27 Folder-Scoped Modifier Inheritance

- Operators may assign modifier groups to an `ItemFolder` from standalone POS. Every active item in that folder inherits the assignment through the shared catalog contract.
- Existing item assignments remain authoritative for that item. An item-level assignment replaces the folder metadata for the same group, while `is_excluded = true` explicitly opts the item out of an inherited group.
- Folder assignments are additive and non-destructive. Removing a folder assignment does not alter existing item assignments or accepted transaction snapshots.
- POS and Storefront resolve the same effective groups server-side, including required-state overrides, ordering, channel/location availability, combo metadata, and one-level conditional metadata. Clients never merge folder and item rows independently for checkout authority.
- Folder inheritance is one level only. Parent-folder recursion and implicit cross-folder inheritance remain unsupported until a separate governed phase.

Phase 27 rollback removes the folder-assignment API and management controls only after confirming no active catalog depends on them. The additive folder table and item exclusion column may be rolled back before production use; accepted transaction snapshots and posted inventory movements must remain immutable and are never recalculated or deleted.
