---
status: proposal
authority_level: reference
owner: engineering
date: 2026-08-15
last_reviewed: 2026-08-15
applies_to: storefront, services, pos_frontend, backend
topic: liempyo_laundry_discover_flow_and_gap_analysis
---

# Liempyo Laundry — discover.dgfy.ph Flow Capture and dgfy-platform Gap Analysis

Answers the open half of [#516](https://github.com/Sieitzz/dgfy-platform/issues/516): what the
Laundry UI/UX actually does, and how much of it dgfy-platform already implements.

**How this was produced.** Ralph (@Sera969) confirmed in
[#516's flow-variant comment](https://github.com/Sieitzz/dgfy-platform/issues/516#issuecomment-5300813534)
that the built UI follows *"the same as discover.dgfy.ph's Liempyo Laundry."* This document is a
direct, click-by-click capture of that live demo (2026-08-15), cross-read against the
dgfy-platform tree. It documents **the reference implementation on discover.dgfy.ph**, not
Ralph's frontend repo — those are asserted to match, but that assertion is unverified here.

> **Standing caveat, from the demo itself.** discover.dgfy.ph lists the Services industry as
> **"Coming Soon"** (Retail, Micro-Retail, F&B and Micro-F&B are "Demo available"), with the note:
> *"The service demo will be released after the current service process is fully reviewed and
> approved."* Every page carries *"DGFY interactive demonstration · No real order or payment is
> created"*, and checkout states *"This creates only a same-browser demonstration booking."* The
> flow below is a browser-only simulation with no backend — consistent with what
> `services-checkout-flow-variants.md` §6 already said.

---

## 1. Confirmed answer to #516's flow-variant question

| Variant (reference doc §4) | On discover.dgfy.ph | Notes |
|---|---|---|
| Pickup and return (§4.5) | **Yes** — "Pick up my items and deliver to my address" | Default selection |
| Pickup and collection (§4.6) | **Yes** — "Pick up my items; I'll collect them at the store" | |
| Drop-off and collection (§4.7) | **No** — absent from online checkout | Matches Ralph: POS-only |
| Now vs. schedule-for-later | **Yes** — schedule defaults to "Now"; picking a date/time switches it | Date picker + time dropdown, bounded by store hours |

Ralph's account checks out against the live demo in full. **Drop-off-and-collection is not an
online-store flow** — it is not offered anywhere in the checkout.

Ralph's routing suggestion for drop-off also checks out: the demo's mock POS **does** have a
**Sell** tab ("Live selling and cart management") in the Services vertical. One caveat worth
carrying into planning — in the demo that Sell tab is labelled **"Outside demo"**, so the
drop-off-via-Sell path is *asserted*, not demonstrated.

---

## 2. The storefront (pre-checkout)

Route: `/demo/services/liempyo-laundry`

- Header: branch selector ("Iloilo Demo Service Area"), **Shop**, **Track Order**, account.
- Store profile: cover, avatar, tagline, rating/followers, category, service area, Call /
  Browse Services, QR + share.
- Sections: About Us, Contact & Location (hours, address, map), Why Choose Us, catalog,
  Current Promos, Customer Reviews.
- Catalog: search, price filter, category filter (All services / Laundry packages / Bedding /
  Pressing), 4 service cards.

**Catalog data shape** — each card carries a base price, a category, and **one option group
whose choices carry price deltas**:

| Service | Base | Option group choices |
|---|---|---|
| Wash, Dry & Fold | ₱150.00 | First 5 kilos · With extra detergent (+₱20) · With extra conditioner (+₱10) |
| Wash, Dry, Fold & Press | ₱250.00 | *(none)* |
| Comforter Care | ₱180.00 | Single / Queen · King (+₱20) |
| Individual Pressing | ₱25.00 | T-shirt · Polo shirt (+₱5) · Barong (+₱35) · Suit, 2 pieces (+₱95) |

Promo: `LIEMPYOFRESH` — "Free simulated pickup and return on laundry packages."

A 14-step guided tour (react-joyride) narrates the storefront; a further 23-step tour narrates
checkout. Both are authored copy and effectively the intended-flow spec.

---

## 3. Cart

Floating cart → drawer. Per line: image, name, **selected option**, unit price, qty stepper,
remove. Drawer also has *Add more items → Browse Services*, **Apply a promo / discount** (opens a
"Store promotions" picker), Estimated subtotal, Total, **Continue to booking**.

---

## 4. Checkout — four steps

Route: `/demo/services/liempyo-laundry/checkout`. Stepper:
**1 Customer → 2 Add-ons → 3 Fulfillment → 4 Payment and Review**.

### Step 1 — Customer
"Create DGFY Account" **or** "Continue as Guest". Guest form: First name, Last name, Phone Number
("Used only inside this browser"), Email ("No message will be sent").

### Step 2 — Add-ons
"Service Add-ons and Instructions." Per cart line, an expandable card showing the selected package
and **Optional add-ons as checkboxes with price deltas** (Additional detergent +₱20.00, Additional
fabric conditioner +₱10.00). Plus one order-level **Special instructions** textarea, max 250 chars.

Note the redundancy: the same modifiers appear as a storefront option group *and* as checkout
add-on checkboxes.

### Step 3 — Fulfillment
Heading: *"How should we handle your laundry? Choose pickup with delivery to your address, or
pickup with collection at the store."* Three (or four) numbered blocks:

1. **Handoff** — two option cards (the two variants above).
2. **Handoff schedule** — "Choose date and time" (calendar + time dropdown), with a
   *Scheduled order simulation* banner and store hours. Defaults to **Now**.
3. **Where should we pick up your items?** — saved locations list, `+ Add location`, map pin
   ("Use sample location" / "Select to adjust the sample pin"), free-text address + Add location.
   **Shown for both variants.**
4. **Where will you collect your finished items?** — *pickup-and-collection only*. "Collection
   store — Collect the finished laundry at Iloilo Demo Service Area."

> **The single most important structural fact for backend design:** the flow models **two
> independent legs**. The *inbound* leg (pickup from the customer's address) is always present.
> The *outbound* leg varies — deliver to an address, or collect at a branch. This is exactly the
> "separate pickup and return records or events" that the reference doc's §4.5 said the backend
> would need.

Order summary reflects the choice: `Fulfillment: Delivery` ⇄ `Pickup`.

### Step 4 — Payment and Review
- **Payment type** dropdown: *Cash on delivery or pickup* | *Simulated online payment*. The review
  renders it as "Cash on Delivery" or "Cash on Collection" depending on the handoff.
- **Review** with per-section *Edit section* links: Selected services; Schedule and Service
  Information (Handoff, Preferred date, Preferred time, delivery address when applicable, Payment
  method); Additional Service Details (Special instructions).
- Final action: **Confirm sample booking**.

### Totals model
```
Subtotal                    ₱150.00
Promotion discount · CODE   Applied
Sample delivery fee         ₱0.00
Fees and taxes (2%)         ₱3.00
Total                       ₱153.00
```
On the tracking page the same lines are renamed: *Handoff fee* and *Service fee*.

---

## 5. Post-booking — customer tracking

Route: `/demo/services/liempyo-laundry/order/current`. Shows a booking reference (6-char
alphanumeric, e.g. `TJT0U6`), booking date, line items, the totals block, handoff method + address,
help links — and a **six-stage timeline that differs by variant at stage 5 only**:

| # | Pickup **and return** (delivery) | Pickup **and collection** |
|---|---|---|
| 1 | Service request received | Service request received |
| 2 | For pickup | For pickup |
| 3 | Pickup completed | Pickup completed |
| 4 | Service in progress | Service in progress |
| 5 | **Out for return** | **Ready for collection** |
| 6 | Service completed | Service completed |

Contextual copy differs too: delivery says *"Live return-delivery tracking is not available in this
browser simulation"*; collection says *"Pickup is recorded. The finished laundry will be collected
at the store."*

---

## 6. Post-booking — merchant POS

Route: `/demo/services/liempyo-laundry/pos/online-orders`.

Sidebar — *Primary modes:* **Sell** (marked "Outside demo"), History, Report, Items,
**Orders (n)**, Shift. *Settings:* Settings, Affiliates. Header: Terminal `COUNTER-02`, location
scope, Sample cashier, Customer tracking view, sort, Refresh queue.

Order card fields: **PIN** (= booking reference), Requested time, Cashier, Customer, Payment,
Payment status, **Mode** (Pickup/Delivery), Order time, Address. Secondary actions: Print order,
Open order, View customer tracking.

**Merchant-driven state machine, as observed end to end:**

```
Order placed
  --[Confirm order]------> Confirmed by store      (assigns cashier; Reject order also available)
  --[For pickup]---------> For pickup
  --[Pickup completed]---> Pickup completed
  --[Start service]------> Preparing your order
  --[Ready for collection]> Ready for collection
  --[Collect sample cash]-> payment_status: Unpaid -> Paid   (fulfillment state unchanged)
  --[Complete service]---> Service completed        (leaves the queue)
```

Payment collection is a **separate, orthogonal action** from fulfillment progression — worth
preserving in any backend model.

---

## 7. What dgfy-platform already implements

Short version: **the vocabulary and the UI shell exist and are already correct; the persistence,
the API contract, and the tracking timeline do not.** This is not a discovery — the repo diagnosed
it itself in [ADR 0057](../architecture/adr/0057-services-fulfillment-profiles.md) (accepted
2026-08-09) and filed the gaps as issues.

### Already built ✅

| Thing | Where | Fidelity vs. the demo |
|---|---|---|
| Fulfillment-profile vocabulary, incl. all three laundry variants | [fulfillmentProfiles.js](packages/shared-constants/src/fulfillmentProfiles.js) | **Exact.** `item_pickup_return` / `item_pickup_collection` / `item_dropoff_collection` |
| Per-variant tracking-event vocabulary | same file, `tracking_events` | **Exact match to §5's timelines**, including the stage-5 split |
| "Drop-off is POS-only" | same file, `item_dropoff_collection.notes` | Already says *"Best recorded by staff in POS, not offered as an online checkout choice"* — independently agrees with Ralph |
| Four-step checkout shell | [ServiceBookingJourneyHeader.jsx](apps/dgfy-web/apps/store/src/modes/services/booking/components/ServiceBookingJourneyHeader.jsx) | Account / Add-ons / Fulfillment / Review and Payment — same shape, slightly different labels |
| Two-option handoff chooser, "1. Handoff" | [ServiceBookingFulfillmentChoices.jsx](apps/dgfy-web/apps/store/src/modes/services/booking/components/ServiceBookingFulfillmentChoices.jsx) | Same two options, same heading; **shorter labels** |
| Guest vs. account checkout, add-ons step, special instructions, location/map section, booking reference on confirmation | `modes/services/booking/components/` | Present |
| Capability-module slot for the round trip | `pickupReturnLogistics` in [capabilityModules.js](packages/shared-constants/src/capabilityModules.js) | `status: 'planned'` |

The handoff chooser's own file comment is explicit that the choice **"is presentation-only and never
reaches the booking payload."**

### Not built ❌

| Gap | Evidence | Issue |
|---|---|---|
| Handoff choice never leaves the browser | [servicesBookingContract.js](apps/dgfy-web/apps/store/src/services/servicesBookingContract.js) — the payload has no handoff field at all | [#480](https://github.com/Sieitzz/dgfy-platform/issues/480) |
| No address columns; address is string-prefixed into `notes` (`Service address: …`) | same file, `buildServiceNotes()`; [ServiceBooking.js](apps/dgfy-api/src/models/ServiceBooking.js) | [#480](https://github.com/Sieitzz/dgfy-platform/issues/480) |
| No pickup address / return address / collection branch fields anywhere | `ServiceBooking` model | [#482](https://github.com/Sieitzz/dgfy-platform/issues/482) |
| Status enum cannot express the laundry lifecycle | `ServiceBooking.status` = `requested, confirmed, checked_in, in_service, completed, cancelled, no_show`. **Missing: `for_pickup`, `pickup_completed`, `out_for_return`, `ready_for_collection`** | [#482](https://github.com/Sieitzz/dgfy-platform/issues/482) |
| No round-trip logistics | ADR 0057 / capability notes: *"DeliveryJob is one-way and 1:1 with a POS transaction, and cannot attach to a ServiceBooking at all"* | [#482](https://github.com/Sieitzz/dgfy-platform/issues/482) |
| No services customer-tracking timeline | Only `modes/fnb/tracking` and `modes/retail/tracking` exist — there is **no `modes/services/tracking`** | — |
| POS services queue uses the appointment graph, not the laundry one | `PosPageShell.jsx`: `requested → confirmed → checked_in → in_service → completed` | [#481](https://github.com/Sieitzz/dgfy-platform/issues/481) |
| POS-created walk-in bookings unreachable (`source='pos'`) — the drop-off path Ralph proposes | — | [#481](https://github.com/Sieitzz/dgfy-platform/issues/481) |

The frontend guide is also currently a **hard blocker on faking it**: *"Do not show … `for pickup`,
`pickup completed`, `out for return`, `ready for collection` … until the backend persists and
returns those events through an approved contract."*
([guide §Do not invent tracking events](docs/development/SERVICES_STOREFRONT_CHECKOUT_TRACKING_FRONTEND_GUIDE.md))

---

## 8. Deviations and open questions for the planning stage

1. **Schedule "Now" vs. later.** The demo defaults to **Now** and lets the customer schedule.
   dgfy-platform's chooser comment states the opposite: *"No now/schedule choice — Services always
   books a calendar date/time."* A real behavioural divergence; needs a decision.
2. **Which record owns the laundry order? — settled, not a fork.** An earlier draft of this
   document framed `ServiceBooking` vs. `PosTransaction` as an either/or choice. That was wrong,
   and it is corrected here because it would have misdirected the schema work.

   They are complementary and **already linked** —
   `ServiceBooking.belongsTo(PosTransaction, { foreignKey: 'pos_transaction_id' })`
   ([models/index.js:744](apps/dgfy-api/src/models/index.js)) — and the relationship is
   **1 sale : N bookings**, already shipped via the batch route
   (`POST /api/v1/store/services/bookings/batch` accepts `bookings: [...]`). Merging them would
   break a live contract and would bolt scheduling columns onto every retail sale.

   A laundry order therefore decomposes with no new duality:

   | Concern | Record | State |
   |---|---|---|
   | The sale | `PosTransaction` | Exists |
   | The scheduled pickup window | `ServiceBooking` | Exists; needs address columns + lifecycle states ([#480](https://github.com/Sieitzz/dgfy-platform/issues/480)/[#482](https://github.com/Sieitzz/dgfy-platform/issues/482)) |
   | **The two handoff legs (custody)** | **none — the real gap** | [#482](https://github.com/Sieitzz/dgfy-platform/issues/482) / `pickupReturnLogistics` |

   The genuinely missing concept is the **handoff leg**, which neither record models today. Per
   ADR 0057: *"DeliveryJob is one-way and 1:1 with a POS transaction, and cannot attach to a
   ServiceBooking at all."* Build that, hang it off the booking, and the flow works **without
   touching the unified product domain**.

   Note the demo's merchant POS visibly resembles the `PosTransaction` online-order queue
   (`tracking_pin` → PIN, `order_method` → Mode, Confirm/Reject, payment status separate from
   fulfillment). That is a **UI** resemblance and a good source of screen design; it is not an
   argument for relocating the record.
3. **Add-on modelling redundancy.** Storefront option group vs. checkout add-on checkboxes carry
   the same modifiers. Decide whether these are one concept or two.
4. **Payment collection as an orthogonal action** ("Collect sample cash" does not advance
   fulfillment). Needs to survive into the model.
5. **The reference doc is not in this repo.** `services-checkout-flow-variants.md` is cited by #516
   as "locally at" — it is not under `docs/proposals/` or anywhere in the tree. Section references
   in #516 could not be verified first-hand.
6. **Still unanswered from #516's checklist** — the demo capture cannot supply these; they need
   Ralph: component paths in *his* repo, and confirmation that his build matches discover.dgfy.ph
   rather than merely being described as matching it.
7. **Drop-off via the POS Sell tab is unproven** — the demo marks Sell "Outside demo."

---

## 9. Generalizing beyond laundry (repair, cleaning, spa, tailoring)

Laundry is the first vertical to need this, not the only one. Anything built here must generalize
to computer repair, motorcycle/auto repair, shoe cleaning, and tailoring. Two facts make that
cheap, and one makes it not-quite-free.

### The generalization axis already exists — it is the fulfillment profile

[#504](https://github.com/Sieitzz/dgfy-platform/issues/504) already establishes the frame: laundry,
cleaning and spa **are not three builds**. They are three niches of one `services` industry
(`workflow_mode: services`, `template_key: services_shop`), and what differs between them is
**which fulfillment profile the service item uses** — nothing else.

`registrationIndustries.js` already lists *"Laundry shop, Computer repair shop, Auto repair shop,
Photography studio"* under one Services industry. And the profile vocabulary was authored
generically from the start — the profiles are named `item_pickup_return` /
`item_pickup_collection` / `item_dropoff_collection`, never `laundry_*`, with notes that already
say *"Good for laundry, shoe cleaning, tailoring, and repair with a round-trip."*

**The implementation rule that follows:** build the *profile mechanism*, never a laundry feature.
No `laundry_` prefix in any column, enum value, route, or component name. If a thing being built
cannot be described without the word "laundry", it is at the wrong altitude.

### What each vertical needs

| Vertical | Fulfillment profile(s) | Extra work beyond laundry |
|---|---|---|
| Spa / salon | `appointment_at_business` | **None** — shipped today |
| Cleaning | `service_at_customer_address` | **None** — shipped today |
| Laundry | `item_pickup_return`, `item_pickup_collection` | This document |
| Shoe cleaning / tailoring | same two as laundry | **None** once laundry ships |
| Computer / motorcycle repair | same two, **plus `quote_request`** | **Quote-first lifecycle** — see below |

So roughly: laundry buys you shoe cleaning and tailoring for free, and gets repair **most** of the
way there.

### The one thing repair needs that laundry does not

`quote_request` — *"the final price is not known until the business reviews the request"*, the
diagnose → quote → approve → repair loop that is near-universal in repair but absent in laundry.
It is the least-supported profile in the vocabulary:

- `tracking_events`: `requested → quoted → accepted → completed` (a different shape from the
  handoff timelines, not a superset)
- `final_action`: `request_a_price` (not `send_booking_request`)
- `checkout_fields`: `photos: 'optional'`, `date: 'optional'`, **no price at checkout**
- `planned_module: null` — and the note is explicit about why: *"No pricing-request lifecycle
  exists in the backend today — there is no in-between state for 'business is preparing a quote'
  and no field to hold the quoted price. `planned_module` is null because no existing Capability
  Module names this gap; it would need one."*

**Recommendation:** scope `quote_request` as its own workstream with its own capability module, and
**do not** try to fold it into the handoff-leg work. The two are independent — a repair shop may
want quote-first with in-store drop-off and no pickup logistics at all, and a laundry wants
handoff legs with fixed pricing and no quoting. Coupling them would make each harder to ship.

### Parts + labour on one basket — already solved

Repair shops sell parts (physical) and labour (service) in one order. This needs **no new work**:
ADR 0037 cl.1 puts per-line `stock_effect_type` forward as *"the mechanism that makes a basket
dynamic (labor + parts + food together)"*, and cl.4 makes labour an ordinary
`category='service'`, stock-exempt `items` row. The unified product domain already covers it.

### Where per-vertical variation is allowed to live

Per ADR 0037 cl.2, a vertical is *"a thin preset selecting a composition of capabilities, not a new
engineering mode."* Variation belongs in **labels, defaults and presets** — never a new mode, table
or enum. ADR 0056 cl.3 (`[binding]`) reinforces it: a Store Template or Profile never introduces a
new enum value, column, or business logic.

Concretely, a repair shop should differ from a laundry only in: item taxonomy preset, the
fulfillment profile on its service items, copy/nouns, and which capability modules are enabled.

---

## 10. Is this enough to plan from?

**For the handoff-leg workstream (#479/#480/#481/#482) — yes.** The customer-facing spec is
confirmed first-hand rather than inferred: both variants, both timelines, the merchant state
machine, the totals model, the payload gap and the exact missing enum values are all named with
file-level evidence.

**Known limits a planner should carry forward, not discover late:**

- Ralph's frontend is *asserted* to match discover.dgfy.ph; that has not been verified. #516's
  remaining checklist items (component paths, wired-vs-placeholder) still need him.
- `services-checkout-flow-variants.md` is not in this repo, so #516's section references are
  unverified.
- The drop-off-via-POS-Sell path is unproven — the demo marks Sell *"Outside demo"*.
- `quote_request` is deliberately **out of scope** here and needs its own scoping pass before any
  repair vertical is committed to.
- The demo is a browser-only simulation. It is authoritative for **intended UX**, and carries no
  information about backend contracts, error states, concurrency, or partial failure.

## 11. Bottom line

The gap is **not** design and **not** vocabulary. Both already exist and already agree with the
demo, down to the individual tracking-event names. The gap is that nothing below the UI can hold
the data: no handoff field on the wire, no address columns, no lifecycle states, no round-trip
logistics, no services tracking timeline, and a POS queue wired to the appointment graph.

Existing issues [#479](https://github.com/Sieitzz/dgfy-platform/issues/479),
[#480](https://github.com/Sieitzz/dgfy-platform/issues/480),
[#481](https://github.com/Sieitzz/dgfy-platform/issues/481) and
[#482](https://github.com/Sieitzz/dgfy-platform/issues/482) between them already name the whole
gap. This document should let those be planned against a confirmed spec instead of a planning
reference.

And none of it requires reopening the unified product domain. A service is already an `items` row;
a sale is already a `pos_transaction`. The work is one new concept — the handoff leg — expressed
through the fulfillment-profile mechanism that already exists, which is what makes it reusable for
repair, tailoring and shoe cleaning rather than a laundry one-off.
