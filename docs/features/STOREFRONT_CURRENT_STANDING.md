---
status: reference
authority_level: reference
owner: frontend
last_reviewed: 2026-05-14
applies_to: storefront_all_modes
topic: storefront_current_standing
---

# Storefront: Current Standing (All Modes)

## Purpose
This document records the current storefront status across all active mode presentations in one place.
This is a frontend capability/status reference, not a new architecture decision.

## Authoritative Inputs Used
- `docs/START_HERE.md` (authoritative, last_reviewed: 2026-03-06)
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md` (authoritative, last_reviewed: 2026-03-06)
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md` (authoritative, last_reviewed: 2026-03-06)
- `docs/architecture/adr/0010-storefront-discovery-item-match-index-and-union-query.md`
- `docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md`
- `docs/architecture/adr/0016-services-mode-independent-booking-and-ticketing.md`
- `docs/architecture/adr/0019-food-and-beverage-mode-full-service-restaurant.md`

## Classification
- Change class for this documentation update: `within-existing-boundary`
- Scope: storefront frontend status reporting only
- ADR update required by this doc-only change: `not needed`

## Shared Storefront Standing (Cross-Mode)
- Discovery and tenant entry flow are active (search/list/map + store slug page handoff).
- Mode selection is template-driven through the storefront mode presentation registry and template registry.
- Catalog and checkout visibility are controlled by customer access and inventory display policy.
- Tenant profile/cover branding, branch selection, and map marker previews are active.
- Duplicate-coordinate location pins are display-offset at render time so every branch remains targetable without changing stored coordinates or preferred-location routing.
- Empty-state guidance for tenants without storefront-ready sellable items is active.
- Storefront follow/share controls are available where tenant flags enable them.
- The merged storefront pilot keeps mode-specific view-model logic in the storefront app while preserving existing backend/source-of-truth contracts.

## Mode Standing

## 1) Default Storefront (Fallback / General)
- Hero + catalog + checkout flow is active.
- Discovery-to-store handoff with preferred location support is active.
- Catalog search, availability checks, and customer cart/checkout entry are active.
- Mode-specific fallback copy is applied when tenant content is partial or missing.

## 2) Services Mode (`services`)
- Independent service storefront presentation is active (service-specific hero, tabs, filters, catalog cards).
- Service booking flow supports schedule selection, intake fields, quantity, and customer details.
- Service draft multiplicity and batch booking submission are active.
- Service availability, short-lived holds, edited-draft hold replacement, and hold-backed checkout are wired to the current storefront contract.
- Services + product cart surfaces coexist with mode-aware controls and validation.
- Confirmation rendering handles every booking reference and every per-booking payment handoff returned by batch checkout.

## 3) Food & Beverage Mode (`fnb`)
- Restaurant/menu-style storefront presentation is active.
- F&B view model, menu grouping, default modifier selection, allergen presentation, and mode-specific catalog sections are active.
- F&B ordering flow supports customer/order details and mode-aware checkout progression.
- F&B reservation entry is active through the restaurant reservation surface.
- F&B contract anchors and storefront rendering expectations are currently satisfied by tests.

## 4) Simple Mode (`msme` presentation)
- Simplified product storefront presentation is active for fast browsing/order flow.
- Stock-aware product cards and simple-mode cart/checkout flow are active.
- Simple-mode hero, catalog, and footer/community sections are active with content fallback handling.
- Simple storefront contract coverage is active.

## Storefront Regression Standing (Latest Run)
Run date: `2026-05-14`
Suite command (frontend):
`npm --prefix frontend exec vitest run apps/store/src/__tests__`

Matrix result:
- Storefront discovery: `PASS`
- Item availability: `PASS`
- Service booking: `PASS`
- F&B rendering: `PASS`
- Services/F&B/simple storefront view models: `PASS`
- Mode presentation and template registry coverage: `PASS`
- Mobile layout coverage in storefront suites: `PASS`

Aggregate result:
- Test files: `15/15 passed`
- Tests: `74/74 passed`

Build result:
- Command: `VITE_STORE_BASE_PATH=/tenant-store/ npm --prefix frontend run build:store`
- Result: `PASS`
- Fresh storefront build emitted `assets/vendor-DIHQYMXL.js`; the previously reported failing `vendor-BGNbcnYt.js` chunk is not part of the current local production-candidate build.

## Notes
- This file intentionally tracks the frontend standing and test evidence snapshot only.
- Backend/contract evolution remains governed by ADRs and API docs.
