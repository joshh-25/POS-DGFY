# Services Storefront Frontend Handoff

**Audience:** Services backend and platform developers  
**Date:** 2026-08-17  
**Branch:** `codex/services-checkout-ui`  
**Local commit range:** `origin/develop..HEAD`  
**Status:** Frontend-only local laundry storefront template; not pushed and not production-backed

## 1. Executive summary

This branch contains the frontend storefront work for a laundry business running
under the shared `services` workflow mode. It provides one Services storefront,
one cart, one four-step checkout, one confirmation entry point, and one tracking
page. The user-facing flow is designed for laundry items/services that can be
picked up and delivered or picked up and collected.

The branch also contains browser-only presentation for the planned drop-off and
quote variants so the Services template can be reviewed end to end. These
variants are explicitly local simulations. They do not mean that the current
backend can persist pickup/return legs, collection events, or quote lifecycle
states.

The five feature commits in this branch change only the web storefront build
and its frontend tests. This handoff is recorded in a separate documentation
commit. None of these six local commits adds or modifies backend routes,
validators, database tables, migrations, service booking persistence, payment
processing, or real tracking events. The unrelated dirty worktree changes are
intentionally outside this handoff and must not be included in a Services
storefront push.

## 2. Governing architecture decisions

The implementation follows these repository sources:

- [`docs/START_HERE.md`](../START_HERE.md) — documentation and architecture lookup order.
- [`docs/architecture/ARCHITECTURE_BOUNDARIES.md`](../architecture/ARCHITECTURE_BOUNDARIES.md) — module and ownership boundaries.
- [`docs/architecture/ARCHITECTURE_GOVERNANCE.md`](../architecture/ARCHITECTURE_GOVERNANCE.md) — frontend rendered-proof and validation expectations.
- [`docs/architecture/adr/0016-services-mode-independent-booking-and-ticketing.md`](../architecture/adr/0016-services-mode-independent-booking-and-ticketing.md) — Services is an independent booking/ticketing workflow.
- [`docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md`](../architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md) — Storefront owns public presentation; Inventory owns stock truth.
- [`docs/architecture/adr/0056-store-configuration-templates-and-profiles.md`](../architecture/adr/0056-store-configuration-templates-and-profiles.md) — templates/profiles compose existing capabilities and do not invent new business logic.
- [`docs/architecture/adr/0057-services-fulfillment-profiles.md`](../architecture/adr/0057-services-fulfillment-profiles.md) — fulfillment profiles may compose frontend UI but may not be sent as an unapproved API/database field.
- [`docs/development/SERVICES_STOREFRONT_CHECKOUT_TRACKING_FRONTEND_GUIDE.md`](SERVICES_STOREFRONT_CHECKOUT_TRACKING_FRONTEND_GUIDE.md) — Services storefront, checkout, tracking, ownership, and backend handoff guide.
- [`docs/features/SERVICES_FULFILLMENT_PROFILES.md`](../features/SERVICES_FULFILLMENT_PROFILES.md) — shipped/planned profile matrix and known backend gaps.

The key architectural rule is:

```text
workflow_mode = services
  -> shared Services storefront shell
  -> service item metadata
  -> frontend-only profile composition
  -> existing booking contract where fields are supported
```

The frontend profile key is presentation metadata. It must not be copied into
the booking request, a database column, or a Store Profile value without a
separate approved architecture decision.

## 3. User-facing laundry storefront flow

### 3.1 Services catalog

The catalog now provides a laundry-oriented service presentation while keeping
the shared storefront entry point:

- service cards use the service image when one exists;
- missing images have a stable visual fallback instead of a broken image;
- service name, description, price, option groups, and selected option are shown
  together;
- search/filter controls and the Services toolbar are kept in the Services
  mode surface;
- mobile users can switch between grid and list layouts;
- the grid sizing follows the shared F&B mobile pattern;
- the mobile list layout uses compact image, text, option, price, and cart
  action placement;
- desktop retains the wider catalog layout;
- card controls remain usable at narrow widths and long service names wrap
  without forcing horizontal overflow;
- the cart drawer shows selected service lines and preserves the selected
  option/add-on context.

The catalog is still driven by normal service catalog data. The frontend does
not create new catalog records or invent service prices.

### 3.2 Checkout shell

The checkout is a shared four-step Services journey:

1. **Customer** — guest/customer identity details and contact verification.
2. **Add-ons and instructions** — service options, intake answers, and notes.
3. **Fulfillment** — service flow, timing, location, and required service
   details.
4. **Payment and Review** — payment method, selected services, fulfillment
   summary, and the final action.

The old Services-specific breadcrumb/eyebrow treatment was removed so the
checkout follows the shared storefront checkout hierarchy. Payment and Review
are separate labels and sections in the step presentation. The final action is
still selected from the current supported flow; the UI does not claim that a
quote or pickup logistics booking has been persisted by the normal booking API.

### 3.3 Laundry service flow choices

The local Services template defines these flow presentations:

| UI label | Local method | Frontend profile | Current status |
|---|---|---|---|
| Pick up and deliver | `delivery` | `item_pickup_return` | Local planned preview; address and schedule are collected in the UI. |
| Pick up and I'll collect | `pickup` | `item_pickup_collection` | Local planned preview; address, schedule, and collection presentation are collected in the UI. |
| Drop off and collect | `dropoff` | `item_dropoff_collection` | Development-only planned preview. |
| Request a quote | `quote` | `quote_request` | Development-only planned preview; it must not show a made-up backend total. |

In a non-development build, the chooser exposes only the two legacy-compatible
laundry methods: pickup and deliver, and pickup and collect. Planned methods
are enabled only by the local simulation guard. This is intentional because
the current backend does not have the required pickup/return logistics or quote
contracts.

### 3.4 Timing: Now and Schedule for later

Step 3 separates the timing choice from the handoff choice:

- **Now** shows the next currently available slot based on the service and
  storefront schedules.
- **Schedule for later** opens a date selector.
- The date selector has centered month/year text and previous/next month arrows.
- Quick choices include Today, Tomorrow, In 2 days, and Next week. Selecting a
  quick choice transfers that date into the calendar selection.
- Calendar dates are clickable. Past dates are visually muted and disabled;
  future dates remain selectable.
- The calendar can move across months and years. Tapping the year opens a
  scrollable year chooser with a five-row visible window; it is not a five-year
  business limitation.
- After a date is selected, the UI transitions to time selection. Time slots
  are opened from a dropdown inside the same dialog container.
- The time dropdown expands smoothly within the modal rather than opening as a
  detached upward menu.
- After a time is selected, the UI shows a date/time confirmation state. The
  user can go back to date selection or use **Use this schedule** to confirm.
- The suggested-slot panel is removed after the user explicitly selects a time;
  the selected date/time becomes the source of truth.

Availability logic is derived from storefront open/close hours, service weekly
availability, service duration, lead time, the configured timezone, and the
current time. A recommendation is shown only when a future valid slot exists.
The frontend does not recommend a slot whose time has already passed.

The calendar helper currently builds a bounded quick/recommendation data set for
local UI work, while the calendar can navigate further and derive slots from
the available weekly rules. This must not be treated as proof of unlimited
backend availability; a real availability endpoint is still required for
future dates and capacity.

### 3.5 Location and map

The location section supports the existing storefront location/map experience:

- saved/pinned location presentation;
- map pin and current-location affordances where the shared map is available;
- address summary in the checkout review;
- responsive map sizing on mobile and desktop;
- clear separation between pickup/service location labels and delivery wording.

For the current Services backend, the address is still a frontend/local
workaround and may be folded into the existing notes path. Coordinates and
pickup/return address pairs must not be assumed to be persisted until the
backend contract is approved.

### 3.6 Payment and review

The Services checkout keeps payment method near the top of the final step and
separates the final review content beneath it:

- payment method selector;
- payment explanation for the selected timing/policy;
- selected services and options;
- fulfillment mode, date, time, and location summary;
- total and final action.

The current local experience supports the existing Services payment timing
presentation, including Pay Later where configured. It is not a payment
gateway implementation. Deposits, partial payments, balances, and quote
payment are not production-backed by this branch.

### 3.7 Confirmation and tracking

After the local booking/preview action, the confirmation surface keeps the
booking reference and provides a direct route to Services tracking.

The tracking page was aligned with the other storefront tracking layouts while
keeping Services-specific labels, colors, images, and lifecycle presentation:

- shared store header and store identity;
- prominent status card;
- customer-safe booking details and item image;
- responsive status timeline without mobile horizontal overflow;
- map/location details where available;
- handoff and service total summary where applicable;
- mobile and desktop spacing/typography adjustments;
- removed local-only helper banners, feature strips, and “advance local
  preview” controls from the visible tracking page.

The local simulation can present planned laundry timelines such as request
received, scheduled for pickup, item picked up, service in progress, out for
return, and completed. Those are browser-only simulation states. A production
tracking page must display only backend-persisted states and timestamps.

## 4. Typography and visual system

Services now has one centralized fallback font pairing:

```js
SERVICES_BODY_FONT = "'Source Sans 3', 'Segoe UI', sans-serif"
SERVICES_DISPLAY_FONT = "'Outfit', 'Avenir Next', 'Segoe UI', sans-serif"
```

The fonts are loaded by the storefront build and applied through Services-only
runtime scoping. Headings use the display stack; controls and body content use
the body stack. The scope is `main[data-storefront-mode='services']`, so F&B,
retail, MSME, and other storefront modes keep their existing typography.

Merchant/runtime theme values may override the fallback stacks when supplied.
Services colors remain theme-driven; the main difference from another business
type is the Services visual palette, not a separate typography system.

Motion is intentionally light: card transitions, calendar selection, and the
time-dropdown container use short transitions, with reduced-motion behavior
respected for users who request less motion.

## 5. Frontend architecture and ownership

### 5.1 Services-owned areas

The main implementation lives under:

```text
apps/dgfy-web/apps/store/src/modes/services/
  storefront/
    components/       catalog cards, toolbar, hero, filters, options
    model/            catalog presentation and option selection
  booking/
    components/       checkout steps, fulfillment, location, review, cart
    model/            schedule, summary, validation, local flow definitions
    hooks/             booking derivations and review props
    pages/             review container
  tracking/
    components/       tracking frame and page
    model/            adapter, status presentation, local simulation
    pages/             tracking route container
  ServiceImage.jsx
  servicesTypography.js
```

Models and adapters derive presentation data and keep transport/state concerns
outside visual components where practical. Tracking status mapping translates
backend-safe lifecycle values into customer-facing copy instead of rendering
raw backend status strings.

### 5.2 Shared integration points

`StorefrontApp.jsx` mounts the Services mode and passes route/runtime state. It
does not own laundry-specific markup or backend profile persistence.

The branch also makes additive shared changes required by Services:

- Services route props and storefront page model wiring;
- shared catalog/cart/checkout composition props;
- guest identity and tracking intent support;
- `StorefrontDropdown` open-state callback support used by the Services time
  selector; default behavior for other modes remains unchanged;
- Services-only runtime font scoping;
- shared mobile checkout summary/action support.

These shared changes are compatibility seams, not new backend behavior. A
future salon template should reuse the same Services shell and add a
profile-specific leaf flow only after the backend contract supports appointment
time, resource/provider capacity, payment, confirmation, and tracking.

## 6. Backend handoff requirements

The frontend is ready for backend integration when the following contracts are
defined and tested.

### Catalog and service metadata

- service rows use the canonical service item category;
- service detail includes price, duration, lead time, payment policy, service
  area type, resources, weekly availability, and real options/add-ons;
- image URLs/variants are customer-safe and stable;
- physical add-ons remain separate from pure service stock behavior.

### Availability

Provide a customer-safe availability contract that can calculate:

- store timezone and open/close intervals;
- service weekly availability;
- service duration and lead time;
- resource/provider capacity;
- holds, blackout dates, holidays, and conflicts;
- available dates and time slots beyond the local quick-option window;
- final revalidation before booking submission.

The current frontend schedule helper is useful for local rendering but is not a
replacement for server capacity authority.

### Booking submission

The backend contract must accept and persist only approved fields, including as
applicable:

- service item and quantity;
- appointment/start datetime;
- location/resource identifier;
- customer details;
- intake responses, add-on snapshots, and instructions;
- payment timing and idempotency key;
- hold token and hold-expiry handling;
- an approved address/location snapshot.

For pickup/return or pickup/collection, the backend additionally needs an
approved contract for pickup and return/collection addresses, logistics legs,
handoff windows, collection branch, and lifecycle events. The raw frontend
profile key must not be added to the request as a shortcut.

### Tracking

The backend should return a customer-safe booking lookup with:

- public reference and booking identity;
- current lifecycle status;
- status timestamps/history when the timeline requires them;
- service line/image/price data;
- payment status;
- address/branch data according to access rules;
- profile-appropriate pickup, service, return, collection, or quote events only
  after those events are persisted.

The currently shipped Services lifecycle is:

```text
requested -> confirmed -> checked_in -> in_service -> completed
```

`cancelled` and `no_show` are supported outcomes. Planned statuses such as
`for_pickup`, `pickup_completed`, `out_for_return`, `quoted`, and `accepted`
must not be treated as real backend events until the backend owns them.

### Payment and quote support

- reuse the approved tenant payment capability filtering;
- define prepaid/postpaid/deposit behavior precisely;
- for deposits, persist amount, balance due, and partial-payment status;
- for quote-first, define request, review, quote amount, acceptance, expiry,
  and payment semantics;
- keep quote requests from displaying a fabricated total.

## 7. Known limitations and deferred work

1. **No backend booking integration was added in this branch.** The local
   simulation stores browser state and is enabled only in development.
2. **Pickup/return and pickup/collection remain planned profiles.** Their UI is
   a template preview until logistics legs and lifecycle events exist.
3. **Drop-off/collection and quote-first are local development previews.** They
   are not production booking choices in the normal build.
4. **Address persistence is incomplete.** The current workaround must be
   replaced by an approved address/location contract.
5. **The schedule calendar is not an unlimited availability authority.** It can
   navigate future calendar dates, but real slot availability and capacity must
   come from the backend.
6. **Tracking is local when a local simulation record is used.** It does not
   poll a real booking event stream for simulated records.
7. **Payment is presentation only.** No gateway, deposit settlement, or quote
   payment was implemented.
8. **No salon storefront was created.** A salon appointment flow should be a
   future profile/template extension, not a copy of laundry-specific labels or
   an additional top-level storefront mode.

## 8. Commit inventory and push scope

These are the five Services feature commits currently ahead of `origin/develop`:

| Commit | Type | Scope |
|---|---|---|
| `fd427168` | `feat(services-storefront)` | Base Services storefront, laundry booking, local tracking, shared runtime wiring, images, cart, confirmation, and tracking entry. |
| `151b98a8` | `test(services-storefront)` | Services catalog, booking, schedule, local flow, confirmation, cart, and tracking coverage. |
| `b22a9124` | `feat(services-storefront)` | Services catalog grid/list layout, image/fallback treatment, responsive sizing, toolbar, and centralized typography. |
| `9ff598f7` | `feat(services-checkout)` | Now/schedule timing, calendar/year/date/time selection, availability derivation, payment/review labels, mobile summary, and scheduling UX. |
| `3358f7df` | `feat(services-tracking)` | Services tracking responsive layout, typography, item image rendering, timeline overflow fix, and removal of local-only helper UI. |

The documentation itself is the separate local commit
`8894241a docs(services-storefront): add frontend backend handoff`.

The committed push scope is limited to the storefront web application and its
frontend tests under `apps/dgfy-web/apps/store/`, plus the shared web files
required to mount Services. There are no committed API or migration changes in
this branch range.

The exact committed file set can be inspected locally with:

```powershell
git diff --name-only origin/develop..HEAD
git diff --stat origin/develop..HEAD
```

## 9. Explicitly excluded from this handoff/push

The following current worktree changes are not part of the five Services
storefront commits and must remain excluded unless separately reviewed:

- `apps/dgfy-api/**` changes, including Services routes/use cases,
  repositories, validators, registration, store behavior, and backend tests;
- `apps/dgfy-migration-runner/**` migrations;
- `apps/dgfy-web/src/features/pos/**` POS service/catalog/terminal changes;
- `apps/dgfy-web/src/features/services/**` admin/operations/catalog changes;
- `apps/dgfy-web/src/features/registration/**` registration changes;
- `apps/dgfy-web/apps/store/src/modes/fnb/**` F&B checkout changes;
- unrelated shared checkout edits not already included in the five audited
  commits;
- `apps/store/`, `local-db-backups/`, and `output/pdf/` generated/untracked
  content.

Before a future push, stage only the audited commit range or the exact tracked
files from that range. Do not use a blanket `git add .` while this worktree is
dirty.

## 10. Validation evidence

The local branch was validated without pushing:

| Check | Result |
|---|---|
| Services Vitest suite | Passed: 17 test files, 59 tests. |
| Store production build | Passed with non-blocking Browserslist freshness and large-chunk warnings. |
| `git diff --check` | Passed. |
| Targeted JS/JSX lint | 0 errors; existing warnings remain in large/shared files. |
| Staged architecture/compliance checks for the audited commits | Passed for the candidate Services scope. |
| Push/deployment | Not performed. |

Recommended local commands for a receiving developer:

```powershell
cd C:\xampp\htdocs\DGFY\apps\dgfy-web
npm exec vitest run apps/store/src/modes/services

cd C:\xampp\htdocs\DGFY
npm run build:store
git diff --check origin/develop..HEAD
git status --short
```

The tests and build validate the frontend branch. They do not prove that the
current backend persists pickup/return addresses, logistics events, quotes,
deposits, or unlimited future slot capacity.

## 11. Suggested backend implementation sequence

1. Confirm the existing Services booking and availability contracts for the
   four shipped `service_area_type` values.
2. Add first-class address/location snapshots and server-side map/coordinate
   rules where needed.
3. Define pickup/return and pickup/collection logistics legs, windows, branch
   collection, statuses, timestamps, and idempotency behavior.
4. Define the availability response for date ranges, slots, duration,
   lead-time, resource capacity, blackout dates, and timezone.
5. Define quote request/quote acceptance/payment behavior separately from
   normal booking totals.
6. Define real payment capability, deposit, balance, and status behavior.
7. Extend public tracking lookup with customer-safe timeline events.
8. Add backend contract tests and integration tests before enabling any local
   planned profile in a production build.

Once those contracts exist, the frontend can replace the local simulation with
the approved API adapter while keeping the same Services storefront shell and
profile-specific presentation boundaries.
