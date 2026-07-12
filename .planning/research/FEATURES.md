# Feature Research

**Domain:** SMB multi-vertical POS + storefront commerce (food, retail, service) — Philippines market
**Researched:** 2026-07-12
**Confidence:** MEDIUM (regulatory/BIR findings cross-checked across multiple official + vendor sources; competitor UX/data-model findings are single-search web-sourced, treat as directional, not authoritative — see Sources)

## Milestone Note

This supersedes the prior `.planning/research/FEATURES.md`, which covered the earlier v1.0 database-first foundation milestone (Accounts/Businesses/Tenancy). That milestone is complete. This research covers the current v2.0 Commerce Domain milestone: Product Catalog, POS Checkout & Payment, Shift/Cash-Drawer, Fiscal/Compliance, Storefront Online Ordering, and Order Fulfillment/Delivery Coordination — built as backend API parity with the legacy system on the new `dgfy_*` schema, no new frontends this milestone.

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or, for PH-specific items, is legally non-compliant.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Discount codes (promo/campaign) | Every mainstream POS (Shopify POS, Square, Loyverse) supports admin-defined codes entered/scanned at checkout | LOW-MEDIUM | Model as `Discount` definition (code, type: %/fixed, scope: order/line/product, active window, usage limit) separate from its application record. DGFY already scopes this as "discount codes" in v2.0 target features — correctly table stakes. |
| Manual/staff-applied discount, permission-gated | Cashiers routinely need to comp, adjust, or discount for goodwill/damaged goods; every reviewed platform gates this behind a specific staff permission | LOW | Needs an `applied_by_staff_id` + reason/note field for audit — matters for shift reconciliation and fraud review, not just UX. Depends on the existing Staff Accounts + role-based access foundation from v1.0. |
| Senior Citizen / PWD discount (RA 9994, RR 7-2010, RMC 71-2022) | Legally mandated in the Philippines for any business selling to the public; a compliant POS is a regulatory requirement, not optional | MEDIUM-HIGH | Must capture ID number (OSCA/PWD), name, TIN; compute by stripping 12% VAT first, then 20% off the VAT-exclusive amount; print separate "Less: VAT Exemption" and "Less: 20% SC/PWD Discount" receipt lines; segregate exempt vs. taxable sales in the fiscal record. For group/restaurant meals, apply the Most Expensive Meal Combo (MEMC) rule: discount basis is a per-head base value, capped to the number of qualifying seniors/PWDs actually present. This is exactly the class of thing DGFY's existing fiscal/compliance policy engine already exists to gate — treat SC/PWD math as a fiscal-domain concern, not a generic "manual discount," because BIR receipt shape depends on it. |
| Server-verified checkout totals (line items, discounts, tax, change) | Client-computed totals are a classic POS fraud/bug vector; all serious platforms verify total server-side before finalizing a sale | MEDIUM | Already explicitly named in DGFY's v2.0 scope ("server-verified totals/change") — correctly identified as non-negotiable. The legacy system's known gaps include client-declared payment status and client-side change calculation; this milestone should close that gap, not just replicate it. |
| Payment method selection at checkout (Cash, GCash, Credit Card) | Table stakes for any PH SMB POS given GCash's near-universal adoption alongside cash | LOW-MEDIUM | Recording *which* method was used per Availment is table stakes; real-time payment gateway integration (e.g., actually processing a GCash/card charge) is a bigger lift — see Anti-Features. |
| Shift open/close with starting cash float | Every reviewed POS (Loyverse, Square, Toast) requires a cashier to open a shift with a declared float before transacting | LOW-MEDIUM | Needed before any Availment can be recorded against a terminal/cashier — this is a hard dependency, not a nice-to-have. Depends on v1.0's Staff Accounts and terminal identity foundation. |
| Cash-drawer reconciliation (expected vs. actual, over/short) | Standard loss-prevention practice; Loyverse's model (system-computed "Expected" from cash sales/refunds/pay-ins/pay-outs vs. counted "Actual", with a Difference field) is the de facto pattern | MEDIUM | Recommend the same 3-field model: Expected (system-derived), Actual (cashier-entered count), Difference (computed, signed). Optionally support "blind count" mode (hide Expected from cashier) as a permission — cheap to add, closes an obvious gaming vector. |
| Order fulfillment status tracking (placed → prep → ready → completed) | Every restaurant/retail OMS reviewed (Toast, Chowbus-style systems) centralizes this; customers and staff both expect visible order state | LOW-MEDIUM | Core pipeline is shared across fulfillment types; branch only the "handoff leg" per type (pickup: ready→picked-up; delivery: driver-assigned→en-route→delivered; dine-in: served→closed). Model as `fulfillment_type` + `fulfillment_status`, not one giant enum. |
| Guest checkout for storefront ordering | Forced account creation measurably increases cart abandonment (cited ~24-28% abandonment attributable to forced signup across ecommerce research); this is now baseline UX expectation, not a differentiator | LOW-MEDIUM | DGFY's v2.0 scope already specifies "guest-or-account checkout" — correctly identified. Guest orders still need a durable contact (phone/email) to receive status updates and be linkable to an account later if the guest signs up. Reuses the existing DGFY Account foundation for the account path. |
| Receipt generation reflecting all discounts/taxes | BIR-compliant receipts are a legal requirement whenever a sale occurs, not just a UX nicety | MEDIUM | Tightly coupled to fiscal/compliance gating — the receipt shape itself is a compliance artifact, not a template exercise. |
| Manual delivery/courier assignment for online orders | For a sub-100-user platform without an in-house rider network, a simple "assign this order to [named courier/contact]" flow is what every small PH F&B operator actually does today (Lalamove/Grab booked manually, or an in-house rider tapped by staff) | LOW | DGFY's scope already frames this as "manual delivery/courier assignment," not integration with a live courier API — correctly right-sized, and matches the legacy system's own "outbound links" capability. |

### Differentiators (Competitive Advantage)

Features that set the product apart from generic SMB POS. Not required for parity, but valuable given DGFY's target market and constraints.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Fiscal/compliance policy-engine gating (block checkout/receipts/shift when BIR paperwork is missing) | Most SMB POS platforms (Square, Loyverse, Shopify POS) assume the merchant is already fiscally registered elsewhere and don't actively gate transactions on paperwork state; DGFY already has this as a proven legacy capability and it directly serves PH SMBs who are mid-registration or juggling multiple permits | HIGH | This is a genuine differentiator vs. Square/Shopify/Loyverse for the PH long-tail SMB segment — none of the international platforms model "can't legally issue a receipt yet" as a first-class state. Correctly already scoped in v2.0 as its own domain, not folded into checkout logic. |
| Unified Product model spanning Food/Service/Retail categories under one entity | Most POS platforms are either retail-first (Square, Shopify) or F&B-first (Toast) with bolted-on support for the other; a genuinely unified model with stock/non-stock and Booking (bookable services) sharing one Product concept simplifies onboarding for hybrid businesses (e.g., a salon that also sells retail product) | MEDIUM-HIGH | Matches DGFY's stated multi-vertical target and legacy precedent (IMS vocabulary already spans these). Worth the complexity because it's foundational, not a bolt-on. |
| Branch-level booking capacity without staff calendars | Simpler than Square Appointments/Calendly-style per-staff scheduling, but still enables service businesses (barbershops, clinics, repair shops) to cap concurrent bookings per branch/timeslot | MEDIUM | Correctly scoped as "no staff calendar yet" — this is the right MVP cut; full staff-level calendars are a well-known scope trap (see Anti-Features). |
| Discovery/map-based storefront browse across many small vendors | Aggregated multi-tenant discovery (map browse/search across DGFY-hosted storefronts) is closer to a marketplace pattern than a single-merchant Shopify storefront; this is a real differentiator if DGFY's value prop includes helping customers *find* PH SMBs, not just transact with ones they already know | MEDIUM-HIGH | High value but also the most product-strategy-dependent item here; the existing `dgfy_core.storefront_discovery_index` projection built in Phase 2 is already positioned to support this. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create disproportionate cost for a sub-100-active-user platform at this stage.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Programmatic split-tender across arbitrary payment method combinations via API | "Customers should be able to pay part cash, part card, part e-wallet in any combination" feels like parity with Square | Square's own findings show even their mature APIs have real limits here (Terminal API can't split a single checkout into multiple payments in one call; you sequence partial payments against an Order and reconcile at the end) — building this from scratch for 3 payment methods at <100-user scale is high effort for a rarely-used edge case | Support at most 2-way split (e.g., cash + one electronic method) recorded as two `Payment` rows against one `Availment`, verified server-side that the sum equals total. Defer N-way arbitrary splits until real usage data shows demand. |
| Live courier/delivery API integration (Grab, Lalamove, etc.) | "Real-time rider tracking and automated dispatch" looks like table stakes vs. big delivery apps | Requires per-courier API contracts, webhook infrastructure, and payout reconciliation logic that's disproportionate for a sub-100-user base still validating fulfillment demand; legacy system itself only did "outbound links," not deep integration | Manual assignment + status update + payout tracking, exactly as already scoped for v2.0. Revisit real integration only after fulfillment volume justifies the operational cost. |
| Full staff-level appointment calendars (per-staff time slots, staff skill matching, resource booking) | Natural next step once branch-level booking capacity exists, and competitors like Square Appointments do this | Materially larger scope (staff working-hour models, conflict resolution, rescheduling policy) than what's needed to prove the Booking domain at this scale; DGFY's own scope already excludes it explicitly ("no staff calendar yet") | Ship branch-level capacity first (already scoped); let real usage tell you whether staff-level granularity is actually requested before building it. |
| Real-time payment gateway processing embedded in checkout (actually charging a card/GCash at time of sale via DGFY-integrated gateway) | "Payment method selection" naturally suggests "and DGFY processes the payment" | PayMongo (or similar) integration is a genuine differentiator eventually, but v2.0 scope already frames it as "where available" for storefront, and full gateway integration (webhooks, reconciliation, chargebacks) is its own project-sized effort, not a checkout sub-feature | Record payment *method* and amount at checkout as the v2.0 deliverable (what legacy already does); treat live gateway capture/settlement as a distinct, later milestone once Availment/Order plumbing is proven. |
| Loyalty points / rewards program | Loyverse and many SMB POS bundle this as a retention feature and it's commonly requested by vendors once they see competitors have it | No current DGFY scope item mentions it; building a points/rewards ledger now competes for effort against getting Product/Checkout/Fulfillment parity shipped, and it has no legacy precedent to migrate | Explicitly defer; revisit as its own milestone once Commerce Domain parity is proven and there's a customer-facing account system mature enough to attach points to. |
| Automated over/short alerting, cash-variance analytics dashboards | Feels like a natural addition once shift reconciliation exists | At <100 active users this is instrumentation for a scale of cash-handling risk DGFY doesn't have yet; building dashboards before there's data to show them value is premature | Store the Expected/Actual/Difference fields (table stakes) and defer alerting/analytics UI until there's enough shift volume for it to be useful, or until legacy-parity data shows it was actually used. |
| Full omnichannel order routing across many external channels (delivery-app marketplaces, phone orders, kiosk, etc.) | Toast-style "OMS" that centralizes every channel into one kitchen routing engine looks like the gold standard | DGFY's storefront is the only order-intake channel in scope for v2.0 — building a generic multi-channel router now is solving a problem DGFY doesn't have yet (no delivery-marketplace integrations are in scope) | Model fulfillment status/type generically enough (per Table Stakes) that a future channel can plug in, but don't build channel-routing infrastructure until a second channel actually exists. |
| Comprehensive Inventory / external IMS integration | Inventory depth feels adjacent and useful once a Product catalog exists | Explicitly out of scope per `.planning/PROJECT.md` — "contract not yet defined technically"; building deep inventory logic now risks coupling this milestone to an undefined external contract | Ship "Basic Inventory ledger" only, as already scoped; defer comprehensive IMS integration to a dedicated future milestone with its own contract design. |

## Feature Dependencies

```text
Existing foundation (v1.0, already built)
    Accounts + Businesses + Tenancy + Staff Accounts/RBAC
        └──enables──> everything below

Product Catalog (Food/Service/Retail, stock/non-stock, folders, Basic Inventory ledger)
    └──requires──> existing Business/Branch/Tenancy foundation

Booking (bookable Services, branch-level capacity)
    └──requires──> Product Catalog (a bookable Service is a Product subtype/category)

Shift & Cash Drawer (open/close, reconciliation)
    └──requires──> existing Staff Accounts + role-based access (shift belongs to a cashier/terminal identity)
    └──blocks──> POS Checkout & Payment (no Availment without an open shift)

Fiscal/Compliance policy engine
    └──requires──> Business/Branch/Tenancy foundation (compliance state is tenant/branch-scoped)
    └──blocks──> POS Checkout & Payment, Shift open, Receipts (gates all three on compliance-mode state)

POS Checkout & Payment (Availment + line items)
    └──requires──> Product Catalog (line items reference Products)
    └──requires──> Shift & Cash Drawer (Availment must be recorded against an open shift/terminal)
    └──requires──> Fiscal/Compliance gating (checkout must check compliance-mode state before allowing sale/receipt)

Discount codes + manual discounts (incl. SC/PWD)
    └──requires──> POS Checkout & Payment (discounts apply to an Availment/line item)
    └──enhances──> Fiscal/Compliance (SC/PWD discount math feeds BIR-compliant receipt shape)

Storefront Discovery & Online Ordering (browse/cart/checkout)
    └──requires──> Product Catalog (customers browse/order Products)
    └──requires──> Booking (if ordering a bookable Service via storefront)
    └──enhances──> existing Accounts (account checkout path reuses existing DGFY Account login)

Order Fulfillment & Delivery Coordination
    └──requires──> Storefront Discovery & Online Ordering (fulfillment acts on orders placed there)
    └──requires──> POS Checkout & Payment concepts (an online order is conceptually an Availment variant)

Guest checkout ──conflicts──> mandatory account creation
    (guest checkout and forced-signup are mutually exclusive UX choices; research strongly favors guest-first with post-purchase account prompt, not forced signup)
```

### Dependency Notes

- **Shift & Cash Drawer blocks POS Checkout & Payment:** every reviewed platform requires an open shift/terminal session before a sale can be recorded — this must land in an earlier phase than checkout, or checkout has nowhere to attach its Availment.
- **Fiscal/Compliance blocks Checkout, Shift open, and Receipts:** DGFY's legacy precedent already gates all three behind compliance-mode state; this is a cross-cutting concern that should be designed once and referenced by the other three, not reimplemented per-surface.
- **Booking requires Product Catalog:** a bookable Service is presented in this milestone as a Product subtype/category, so the catalog's category model (Food/Service/Retail) must exist before Booking can attach capacity rules to it.
- **SC/PWD discount enhances Fiscal/Compliance, not just Checkout:** because the discount computation directly determines receipt line shape (VAT exemption + 20% discount lines) and the compliance engine gates receipt issuance, these two domains should share the same tax/discount computation module rather than duplicating math.
- **Order Fulfillment requires Online Ordering, not the reverse:** orders must exist before they can be fulfilled — Storefront/Online Ordering is the earlier dependency in any phase sequencing.
- **Guest checkout conflicts with forced account creation:** don't build a "must create account to order" path even as an interim step; research is unusually consistent that this measurably hurts conversion with no compensating benefit at this scale.
- **All of the above depend on the completed v1.0 foundation:** Accounts, Businesses, Tenancy, and Staff Accounts/RBAC (Phases 1-6, complete) are prerequisites for every Commerce Domain feature — no new Commerce Domain feature should attempt to re-derive identity, tenancy, or staff-permission concepts independently.

## MVP Definition

Given DGFY's constraint of "backend API parity with legacy, no new frontends, sub-100 active users," MVP here means backend capability parity, not feature completeness beyond legacy.

### Launch With (v2.0 backend parity)

- [ ] Product Catalog (Food/Service/Retail, stock/non-stock, folders, Basic Inventory ledger) — legacy already has this; existing POS/Storefront frontends need it to keep functioning conceptually once cut over
- [ ] Booking (branch-level capacity, no staff calendar) — explicitly scoped, correctly minimal
- [ ] Availment + line items + server-verified totals/change — the checkout transaction is the core commerce primitive everything else hangs off
- [ ] Discount codes + manual discounts including SC/PWD — legally required (SC/PWD) and already a legacy capability that must not regress
- [ ] Payment method selection (Cash, GCash, Credit Card) recorded on Availment — table stakes; does not require live gateway processing
- [ ] Receipts reflecting discounts/taxes correctly, gated by compliance state
- [ ] Shift open/close + cash-drawer reconciliation (Expected/Actual/Difference) — hard dependency for Checkout to function at all
- [ ] Fiscal/Compliance policy-engine gating — legacy precedent; a known differentiator DGFY must not lose in the rebuild
- [ ] Storefront browse/search/cart, guest-or-account checkout, pickup/delivery scheduling — matches legacy Storefront capability
- [ ] Order Fulfillment status updates + manual courier assignment + payout tracking — matches legacy's "outbound links" capability, correctly not a live integration

### Add After Validation (v2.x)

- [ ] Blind-count shift closing mode (hide Expected cash from cashier) — cheap addition once base reconciliation exists, add if fraud/gaming becomes a concern
- [ ] 2-way split-tender payments (e.g., cash + GCash) recorded as two Payment rows — add once real merchant demand is observed, not preemptively
- [ ] Cash-variance analytics/alerting on top of shift reconciliation data — add once there's enough shift volume to make it meaningful

### Future Consideration (v3+)

- [ ] Live payment gateway integration (PayMongo full capture/settlement, webhooks, chargebacks) — defer until Availment/Order plumbing is fully proven; "where available" per current scope is the right interim posture
- [ ] Real courier/delivery API integrations (Grab, Lalamove) — defer until fulfillment volume justifies the integration and operational cost
- [ ] Staff-level appointment calendars — defer until branch-level Booking capacity proves insufficient in practice
- [ ] Loyalty/rewards program — defer; no legacy precedent, no current scope, competes for effort against Commerce Domain parity
- [ ] Multi-channel order routing (delivery marketplaces, kiosk, phone) — defer until a second intake channel actually exists beyond DGFY's own storefront
- [ ] Comprehensive Inventory / external IMS integration — deferred per `.planning/PROJECT.md`, contract not yet defined
- [ ] Co-ownership feature exposure — data model already supports it, feature not exposed yet, deferred per `.planning/PROJECT.md`
- [ ] Product/Availment data-cutover migration and production cutover — downstream of this milestone, Phase 7 stays paused until this domain is proven

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Product Catalog (Food/Service/Retail, stock/non-stock) | HIGH | MEDIUM | P1 |
| Basic Inventory ledger | MEDIUM | MEDIUM | P1 |
| Booking (branch-level capacity) | MEDIUM | MEDIUM | P1 |
| Availment + line items + server-verified totals | HIGH | MEDIUM | P1 |
| Discount codes | MEDIUM | LOW | P1 |
| Manual discounts (permission-gated) | MEDIUM | LOW | P1 |
| SC/PWD regulatory discount | HIGH (legal requirement) | MEDIUM-HIGH | P1 |
| Payment method selection (record only) | HIGH | LOW-MEDIUM | P1 |
| Receipts | HIGH (legal requirement) | MEDIUM | P1 |
| Shift open/close | HIGH (blocks checkout) | LOW-MEDIUM | P1 |
| Cash-drawer reconciliation | MEDIUM | MEDIUM | P1 |
| Fiscal/compliance gating | HIGH (differentiator + legal) | HIGH | P1 |
| Storefront browse/search/cart | HIGH | MEDIUM | P1 |
| Guest checkout | HIGH | LOW-MEDIUM | P1 |
| Pickup/delivery scheduling | MEDIUM | MEDIUM | P1 |
| Order fulfillment status tracking | HIGH | LOW-MEDIUM | P1 |
| Manual courier assignment + payout tracking | MEDIUM | LOW | P1 |
| Blind-count shift closing | LOW | LOW | P2 |
| 2-way split-tender payments | MEDIUM | MEDIUM | P2 |
| Cash-variance analytics/alerting | LOW | MEDIUM | P3 |
| Live payment gateway capture/settlement | HIGH (eventually) | HIGH | P3 |
| Real courier API integration | MEDIUM | HIGH | P3 |
| Staff-level appointment calendars | LOW (at this scale) | HIGH | P3 |
| Loyalty/rewards program | LOW (at this scale) | MEDIUM-HIGH | P3 |
| Comprehensive Inventory/IMS integration | MEDIUM (eventually) | HIGH | P3 |

**Priority key:**
- P1: Must have for v2.0 Commerce Domain launch (legacy parity + legal requirements)
- P2: Should have, add when possible after core is stable
- P3: Nice to have, future consideration — explicitly deferred given <100-user scale

## Competitor Feature Analysis

| Feature | Shopify POS | Square | Loyverse | Our Approach |
|---------|-------------|--------|----------|--------------|
| Discount codes vs. manual discount | Both supported; manual gated behind "Apply custom discounts" staff permission | Both supported via similar permission model | Both supported | Same two-track model (code-based + permissioned manual), plus SC/PWD as a distinct third regulated discount type layered on the fiscal engine |
| Split/multi-tender payments | Supported at UI level | Supported at UI level; API-level splitting has real documented limits (no single-call split via Terminal API) | Limited public detail found | Record method + amount per Availment as table stakes; defer arbitrary N-way splits, ship at most 2-way if needed (P2) |
| Shift/cash-drawer reconciliation | Not detailed in research | Not detailed in research | Explicit Expected/Actual/Difference model with optional blind-count mode | Adopt Loyverse's 3-field model directly — it's the clearest, most directly reusable pattern found |
| SC/PWD-style regulatory discount | N/A (not a PH-specific platform) | N/A | N/A | No general-purpose competitor precedent exists; must design against BIR regulations directly and against PH-specific POS vendors (StoreHub, Qashier) who already solved this (MEMC base-value pattern for group meals) |
| Order fulfillment status model | N/A (retail-first) | Some restaurant support | N/A | Toast's pattern (shared core pipeline + type-specific handoff leg) is the right generalizable model; adopt `fulfillment_type` + `fulfillment_status` split |
| Guest checkout | Native, well-documented UX guidance to default to guest + post-purchase account prompt | Similar industry-standard pattern assumed | N/A | Directly adopt "guest-first, prompt post-purchase" — matches DGFY's own "guest-or-account checkout" scope language already |

## Sources

- [Shopify Help Center: Discounts in Shopify POS](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/discount-management) — MEDIUM (official vendor docs, single search pass)
- [Shopify Help Center: Applying discounts in Shopify POS](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/discount-management/applying-discounts) — MEDIUM (official vendor docs)
- [Square Developer: Split Payment scenarios](https://developer.squareup.com/docs/payments/scenarios/split-online-payment) — MEDIUM (official vendor docs)
- [Square Support: Process split-tender payments](https://squareup.com/help/us/en/article/5097-process-split-tender-payments-with-square) — MEDIUM (official vendor docs)
- [Square Developer: Terminal API overview](https://developer.squareup.com/docs/terminal-api/overview) — MEDIUM (official vendor docs)
- [Loyverse Help: Shift Management in Loyverse POS](https://help.loyverse.com/help/shift-management-loyverse-pos) — MEDIUM (official vendor docs)
- [Loyverse Support: Shift Management](https://support.loyverse.com/en/articles/1030617-shift-management) — MEDIUM (official vendor docs)
- [Cointab: Cash Drawer Reconciliation for Retailers](https://www.cointab.net/us/a-guide-to-cash-drawer-reconciliation-for-retailers-simplify-your-process) — LOW (general industry blog)
- [Toast Support: Managing Off-Premise Orders with Orders Hub](https://support.toasttab.com/en/article/Managing-Off-Premise-Orders-with-Orders-Hub) — MEDIUM (official vendor docs)
- [Chowbus: Order Management System (OMS) — What is It & How Does it Work](https://www.chowbus.com/blog/oms-order-management-system) — LOW (vendor blog)
- [Toast Developer Guide: Orders API overview](https://doc.toasttab.com/doc/devguide/portalOrdersApiOverview.html) — MEDIUM (official vendor docs)
- [Shopify: Guest Checkout — Simplify Purchases and Boost Sales](https://www.shopify.com/enterprise/blog/guest-checkout) — MEDIUM (official vendor content, contains cited conversion statistics)
- [Cartylabs: Guest Checkout vs. Account Creation on Shopify](https://cartylabs.com/blog/guest-checkout-vs-account-creation-shopify/) — LOW (third-party blog, cross-checked against Shopify's own guest-checkout content)
- [BIR Revenue Regulation No. 7-2010 — Expanded Senior Citizens Act implementation](https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/10/55830) — HIGH (primary regulatory source)
- [BIR RMC No. 71-2022](https://bir-cdn.bir.gov.ph/local/pdf/RMC%20No.%2071-2022.pdf) — HIGH (primary regulatory source, PDF)
- [BIR RR No. 16-2018](https://bir-cdn.bir.gov.ph/local/pdf/RR%20No.%2016-2018.pdf) — HIGH (primary regulatory source, PDF)
- [Hashmicro PH: BIR POS Compliance Requirements and Guide](https://www.hashmicro.com/ph/blog/official-receipt-bir/) — MEDIUM (vendor guide, cross-referenced against BIR primary sources)
- [Respicio & Co.: PWD and Senior Citizen Discounts in the Philippines — Rights and Requirements](https://www.respicio.ph/commentaries/pwd-and-senior-citizen-discounts-in-the-philippines-rights-and-requirements) — MEDIUM (PH law firm commentary, cross-referenced against BIR primary sources)
- [StoreHub Care: PH BIR — How to Set Up and Apply MEMC Discounts for Senior Citizens and PWDs](https://care.storehub.com/en/articles/12252232-ph-bir-how-to-set-up-and-apply-memc-discounts-for-senior-citizens-and-pwds) — MEDIUM (PH-market competitor vendor documentation, directly analogous implementation, fetched and read in full)
- Qashier Help Center: PH Guide to SC/PWD Discounts in the POS (`support.qashier.com/en/articles/8198157`) — cited in search snippets only; direct fetch returned HTTP 403, so this source is summarized secondhand via search results, not independently verified — treat corroborating detail from this one as LOW confidence
- `.planning/PROJECT.md` — v2.0 Commerce Domain milestone scope, deferred items, existing v1.0 foundation

---
*Feature research for: DGFY v2.0 Commerce Domain milestone (Product, Checkout & Fulfillment)*
*Researched: 2026-07-12*
