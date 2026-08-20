---
authority_level: historical
date: 2026-08-17
attendees: unknown (non-dev attendee took notes; summary relayed by Pat on 2026-08-19)
topic: surebiz_product_review
---

# Meeting notes — 2026-08-17 Surebiz product review

Raw capture, not live-captured by the `notes` role (`.agents/skills/notes/SKILL.md`). A non-developer
attendee took notes during this meeting and sent a summary PDF
(`Meeting-Discussion-Summary.pdf`, dated 2026-08-17, 3:00–5:00 PM) to Pat, who relayed it on
2026-08-19 for routing into the backlog. Transcribed here verbatim from that PDF so every issue this
meeting produced or updated has a citable source, per `docs/meetings/README.md`'s convention. Not a
rule source — a decision worth keeping was routed into a GitHub issue or issue comment during the
2026-08-19 compile pass; this file just remains as the record of where the decision came from.

Numbered `N001…` per section, in the PDF's own order, second-hand relay rather than live capture —
no `[CONFLICT]`/`[FILED]` flags were raised live since no `notes`-role session was primed for this
meeting; conflicts against existing issues/ADRs were instead found during the 2026-08-19 `pm` routing
pass and are recorded as comments on the affected issues themselves, not here.

## 1. Mobile UI — Location Section

- N001 (2026-08-17): In the location section, only the selected card should expand.
- N002 (2026-08-17): Other cards should remain collapsed.

## 2. Featured Products

- N003 (2026-08-17): Featured Products display will be unlimited.
- N004 (2026-08-17): If a user has more than 10 liked products, all of them will still be shown
  under Featured Products.

## 3. Entries Display (Pagination)

- N005 (2026-08-17): The text showing entries (e.g., "Showing 1 out of 84") should include an
  option for users to select how many entries to display.
- N006 (2026-08-17): Options: 50 / 80 / 100 entries.

## 4. Product Pricing

- N007 (2026-08-17): Developers will add the lease price to the products listed in the app.

## 5. Payment & Order Placement

- N008 (2026-08-17): Payment type (partial or full) will be under Surebiz's decision.
- N009 (2026-08-17): For the meantime, the team decided to implement partial payment. Reason: the
  platform charges 3% per transaction. With partial payment, only 3% will be charged initially. The
  remaining balance will be collected after the admin confirms the order on the backend and the
  order is delivered.
- N010 (2026-08-17): Payment options: COD / Credit Card / PayMaya.
- N011 (2026-08-17): On order placement, users must be able to type the delivery location.
- N012 (2026-08-17): The location should automatically be pinned on the map.
- N013 (2026-08-17): If the location is not found on the map, the delivery personnel will
  negotiate/decide the final placement.
- N014 (2026-08-17): Delivery fee: not yet decided.
- N015 (2026-08-17): Backend: after an order is placed, the admin has the right to accept or
  decline the order.

## 6. Delivery Schedule

- N016 (2026-08-17): Final decision not yet made, but it was discussed that delivery schedule will
  be integrated and based on location.
- N017 (2026-08-17): Scheduling rules: unavailable dates will appear in grayscale and will not be
  clickable. Available dates will be shown and clickable.
- N018 (2026-08-17): Delivery notice: for the meantime, users will receive an email or notification
  stating that delivery will arrive within 7–14 days.

## 7. Voucher

- N019 (2026-08-17): Fixed price will be used for vouchers. Example: if D3 Bio original price is
  ₱1,000, the displayed price will be ₱950.
- N020 (2026-08-17): Voucher generation: there will be specific vouchers for each pharmacy.
- N021 (2026-08-17): Admin will be the one to set/create these vouchers.
- N022 (2026-08-17): No vouchers for walk-in customers.
- N023 (2026-08-17): Vouchers are for one-time use only.
