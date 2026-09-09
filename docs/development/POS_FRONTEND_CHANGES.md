---
status: reference
authority_level: reference
owner: pos
date: 2026-09-09
last_reviewed: 2026-09-09
applies_to: pos_frontend
topic: pos_frontend_full_documentation_and_branch_change_inventory
---

# POS Frontend Functional Documentation and Change Inventory

## Purpose

This document is the complete POS frontend reference for the work currently present in
the isolated branch 'codex/services-storefront-next-followup-pos-only'. It combines the functional
POS guide, technical ownership map, operator workflow, UI/UX contract, validation plan,
release inventory, and exact branch change inventory. It is a branch snapshot and not a
replacement for an ADR, API contract, or governed feature document. The governed
architecture and ADR documents listed below take precedence if a future change conflicts
with this record.

The isolated branch was created from the current `origin/develop` and contains only the POS
frontend payload, its tests, and the required documentation. The three original POS source
batches were ported to the current `develop` surface as the first three commits below; two
additional POS-only commits complete the current contracts and align tests with the shared image
architecture.

| Commit | Conventional Commit | Scope | Files | Diff |
|---|---|---:|---:|---:|
| 8a115870f | style(pos): refine terminal catalog presentation | Catalog and terminal presentation; port of source `6bab3628f` | 25 | +962 / -302 |
| 9dc2b924f | fix(pos): harden checkout payment workflows | Checkout, payment, discount, settlement, and receipt workflows; port of source `bb03fc154` | 31 | +775 / -438 |
| 28469ad41 | style(pos): normalize operational workspace presentation | Operational workspaces, mode panels, reports, history, printing, and hardware formatting; port of source `67170d806` | 39 | +240 / -212 |
| 317e6f07f | fix(pos): complete responsive terminal contracts | POS elevation/focus tokens, responsive terminal behavior, and statutory-beneficiary presentation | 3 | +103 / -3 |
| 443f84934 | test(pos): align contracts with shared image architecture | POS image, loading-priority, and receipt contract alignment | 4 | +15 / -14 |
| **Feature total** |  |  | **96 unique paths** | **POS feature files plus shared POS CSS** |

The documentation commits are `5ff155af7`, `0cee9b244`, `b442ba34`, and `da5f6efb4`; the
compliance declaration is `81b9edf7b`. The documentation commits are intentionally kept separate
so the feature history remains bisectable.

## Scope and safety boundary

### Included

- POS frontend code and POS tests under packages/web-core/src/features/pos.
- Catalog browsing and presentation, terminal layout, current-sale interaction,
  checkout/payment workflows, discount and split-tender behavior, operational panels,
  receipts/printing, history/reporting, and POS utility formatting.
- Responsive and accessibility contract corrections that protect the POS UI behavior.

### Not included

- No backend, migration, tenant-schema, or new API endpoint changes are in the POS commits.
- No public Services storefront booking, fulfillment, tracking, or storefront-route
  implementation is included in these three commits.
- The original mixed worktree contains service-related and unrelated dirty/unmerged work, but
  none of that work was copied into this isolated branch or included in the POS-only inventory.
- The POS-side ServicesWorkflowPanel and related POS mode presentation are included
  because they are POS screens. That does not mean the public Services storefront flow
  was changed.

The changed code lives in the shared packages/web-core frontend trunk. This means the
package can be consumed by more than one frontend application, but the feature commits
themselves contain only POS feature paths. The production build evidence below was run
for apps/dgfy-pos; a release owner should still run the required application matrix
before promoting a branch that combines this work with other frontend changes.

### Branch status at audit time

- Current local branch: `codex/services-storefront-next-followup-pos-only` in the isolated
  worktree `C:\w`.
- Compared with the fetched `origin/develop`, the branch is **0 commits behind and 10 commits
  ahead**. The ahead commits are the five POS feature commits, four POS documentation commits,
  and one compliance declaration.
- The remote branch is `origin/codex/services-storefront-next-followup-pos-only`; its history is
  rebased onto the latest fetched `origin/develop` before the push.
- The branch diff contains 95 POS feature paths, `packages/web-core/src/index.css`, and two
  documentation paths only. No Services Storefront, backend, migration, registration, or
  unrelated frontend path is present.
- The original worktree at `C:\xampp\htdocs\DGFY` remains untouched and may still contain the
  user's unrelated dirty/unmerged changes.

## Governing references

The implementation and this inventory were checked against:

- [docs/START_HERE.md](../START_HERE.md) for repository documentation routing.
- [docs/architecture/ARCHITECTURE_BOUNDARIES.md](../architecture/ARCHITECTURE_BOUNDARIES.md)
  for application and backend-layer boundaries.
- [docs/architecture/ARCHITECTURE_GOVERNANCE.md](../architecture/ARCHITECTURE_GOVERNANCE.md)
  for architecture-impact classification and evidence expectations.
- [docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md](../architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md)
  for catalog identity, POS sales execution, and storefront presentation ownership.
- [docs/architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md](../architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md)
  for terminal identity, cashier access, and shift-safe navigation.
- [docs/architecture/adr/0051-pos-employee-credit-tender-and-ledger.md](../architecture/adr/0051-pos-employee-credit-tender-and-ledger.md)
  for employee-credit payment behavior.
- [docs/architecture/adr/0055-tenant-scoped-pos-catalog-realtime-invalidation.md](../architecture/adr/0055-tenant-scoped-pos-catalog-realtime-invalidation.md)
  for tenant-scoped catalog data and invalidation boundaries.
- [docs/architecture/adr/0063-pos-split-tender-and-manual-walk-in-payment-recording.md](../architecture/adr/0063-pos-split-tender-and-manual-walk-in-payment-recording.md)
  for split tender and manual walk-in payment recording.
- [docs/architecture/adr/0065-pos-shared-parked-sales-and-cashier-handoff.md](../architecture/adr/0065-pos-shared-parked-sales-and-cashier-handoff.md)
  for parked-sale ownership and cashier handoff.
- [docs/architecture/adr/0070-downpayment-authorization-across-workflow-modes.md](../architecture/adr/0070-downpayment-authorization-across-workflow-modes.md)
  for downpayment authorization and workflow-mode behavior.
- [docs/architecture/adr/0073-pos-cashier-attendance-breaks-and-register-operator-sessions.md](../architecture/adr/0073-pos-cashier-attendance-breaks-and-register-operator-sessions.md)
  for current POS operator-session behavior.
- [docs/architecture/adr/0077-pos-cheque-tender-method-scoped-supersession.md](../architecture/adr/0077-pos-cheque-tender-method-scoped-supersession.md)
  for cheque tender behavior.

No new architecture phase is created by this document. It records already committed
work and introduces no new runtime behavior; the continuous phase ledger therefore does
not need a new entry.

+
## POS system overview

### Product responsibility

DGFY POS is the cashier-facing sales execution surface. It is responsible for:

- authenticating an operator and establishing the active company/tenant context;
- identifying or selecting the logical terminal and operating location;
- enforcing terminal lock, operator, permission, and shift-entry conditions;
- presenting the tenant catalog for cashier selection;
- building and editing the current sale;
- applying allowed options, discounts, employee credit, downpayments, and payment methods;
- recording checkout completion through the existing POS services/API contracts;
- supporting order/receipt printing through the selected hardware driver;
- handling online-order queue work, delivery operations, parked sales, history, audit, reports,
  and day-close workflows.

POS is not the source of truth for catalog identity or inventory. The catalog/inventory and
public storefront ownership boundaries remain governed by ADR 0029. POS consumes the data
needed to execute a sale and to present the operator workflow.

### Frontend ownership layers

| Layer | Location | Responsibility |
|---|---|---|
| Standalone application | apps/dgfy-pos | POS entry point, routing, app bootstrap, PWA/service-worker integration, and Electron packaging |
| Shared POS feature trunk | packages/web-core/src/features/pos | Terminal page, checkout, catalog, operational panels, hardware abstractions, stores, utilities, and tests |
| Shared frontend infrastructure | packages/web-core/src | Authentication, API client, permissions, workflow-mode context, UI primitives, observability, and common utilities |
| IMS host | apps/dgfy-ims | Existing host that mounts the shared POS pages and related SKUpervisor views |
| Electron shell | apps/dgfy-pos/desktop/pos-electron | Desktop wrapper around the standalone POS web application for supported hardware terminals |

The shared POS trunk has no separate build/package runtime of its own. It is consumed by
the host applications. Changes in that trunk must therefore be validated from a real
consumer application.

### POS feature directory map

| Directory | Role |
|---|---|
| features/pos/pages | Terminal page, POS page shell, checkout page, and SKUpervisor POS page |
| features/pos/components | Catalog, current sale, checkout, payment, mode panels, operations, reports, receipts, and dialogs |
| features/pos/hooks | Catalog, cart, checkout, financial, history/void, employee-credit, delivery, and hardware workflow orchestration |
| features/pos/services | Existing POS API calls and browser/session stores for drafts, queues, offline snapshots, split payments, and image-failure state |
| features/pos/hardware | Hardware contract, registry, runtime hook, drivers, printer availability, and terminal integrations |
| features/pos/utils | Formatting, layout, terminal identity, shift-entry decisions, update safety, search, audit, and workflow helpers |
| features/pos/__tests__ and nested test directories | Component behavior tests, contract tests, utility tests, and integration-oriented frontend tests |

## Application entry points and local URLs

### Standalone POS application

The standalone application entry point is apps/dgfy-pos/src/main.jsx. It:

1. loads the Chrome 80-84 iMin WebView compatibility layer before other modules;
2. initializes POS observability and global API-error handling;
3. installs the POS-specific low-effects profile for constrained iMin hardware;
4. creates the HashRouter and shared permission/workflow-mode providers;
5. optionally performs development auto-login when explicitly enabled by environment variables;
6. mounts the shared TerminalPage;
7. registers the production service worker when its response is a valid JavaScript worker;
8. resets stale development service workers/caches when running in development mode.

The development server is port 5174. Because the app uses HashRouter, the reliable local
forms are:

| Purpose | Local URL |
|---|---|
| POS entry | http://localhost:5174/ |
| Terminal route | http://localhost:5174/#/terminal |
| Login/terminal entry | http://localhost:5174/#/login |
| Auth route | http://localhost:5174/#/dgfy/auth |
| Company selection | http://localhost:5174/#/dgfy/companies |
| Company registration | http://localhost:5174/#/register-company |
| Registration status | http://localhost:5174/#/register-company/status/:applicationId |
| Sales redirect | http://localhost:5174/#/sales |

The sales route intentionally redirects to the SKUpervisor sales context. Unknown routes
show a POS route-not-available screen.

### IMS-hosted POS

apps/dgfy-ims/src/main.jsx also mounts the shared POS pages, including the shared
TerminalPage and SKUpervisor POS page. When testing a shared-trunk change through IMS,
use the route exposed by the current IMS host configuration rather than assuming the
standalone POS URL. The shared POS feature code remains the same; only the host bootstrap
and surrounding application shell differ.

### Desktop POS

The Electron shell in apps/dgfy-pos/desktop/pos-electron wraps the same standalone POS
application. Desktop packaging is separate from the browser dev server. Hardware behavior
must be tested with the supported bridge/driver environment; browser validation alone does
not prove printer, drawer, or iMin behavior.

## Runtime lifecycle

### 1. Application bootstrap

The application establishes the error boundary, routing, authentication providers,
workflow-mode provider, global API-error handling, toast system, analytics, Sentry context,
and optional service worker. A chunk-load recovery path handles lazy-loaded workspace
failures. Development service-worker cleanup is intentionally limited to development mode.

### 2. Terminal context

TerminalPage coordinates the active terminal context. It resolves:

- signed-in cashier identity;
- active company/tenant;
- logical terminal identity;
- terminal registry and registration mode;
- operating location;
- business settings used for POS and receipts;
- permission and role state;
- active or resumable cashier shift;
- current workflow mode;
- hardware driver availability;
- incoming online-order and queued-operation state.

Terminal identity is scoped through browser storage and session context. It must not be
treated as a substitute for server-side authorization.

### 3. Lock and unlock

A locked terminal does not expose the selling workflow as an unlocked cashier terminal.
The unlock flow validates the terminal/cashier context and then determines whether the
operator should open a shift, resume an owned shift, take over an allowed register, or
complete another configured terminal-entry step.

The user-facing lock state also protects sensitive operations such as checkout, shift
close, and settings access. Permission checks remain in force after unlock.

### 4. Shift and operator session

The operator session controls whether selling and cashier operations are available.
The lifecycle includes:

- shift opening with the required opening float or configured entry;
- resuming an existing shift when ownership and authority are valid;
- cashier breaks and resume behavior;
- terminal/location switching where permitted;
- recording cash-drawer events;
- shift close and day-close readiness;
- stale-shift handling and controlled force-close paths where authorized;
- close-report and Z-reading presentation.

The UI may retain local drafts or queue state for recovery, but financial authority comes
from the existing service/API workflow and server-side rules.

### 5. Catalog and current sale

Once the terminal is available for selling:

1. catalog data is loaded for the active tenant/context;
2. the cashier searches, scans, filters, pages, or selects a category;
3. an item or service is added to the current sale;
4. item options or service options are presented when the item requires customization;
5. quantity, price, discount eligibility, and sale actions are updated;
6. the sale may be parked or progressed to checkout.

Catalog image failures are cached only for the browser session to prevent repeated failed
requests. This cache does not modify the catalog record or image source.

### 6. Checkout and payment

Checkout summarizes the current sale and guides the cashier through:

- customer/order details required by the current workflow;
- discounts and employee selection/approval where eligible;
- employee credit when configured and authorized;
- downpayment behavior where enabled;
- one or more payment methods;
- split tender and manual tender entry;
- cheque and other configured tender methods;
- amount validation, paid/remaining/change summaries;
- confirmation and receipt actions.

Calculations remain numeric. The affected presentation normalizes monetary output around
the peso glyph and consistent locale-aware formatting.

### 7. Post-checkout operations

After a sale or order is recorded, the operator can use the relevant follow-up surfaces:

- receipt preview and printing;
- order-ticket printing for supported workflows;
- online-order queue and delivery operations;
- transaction history and cashier history;
- audit workspace and void audit;
- reports/analytics;
- shift close, close report, and Z-reading;
- voucher, pricelist, affiliate, delivery-pricing, and other permission-gated settings.

## POS workflow state model

The frontend combines several kinds of state. Keeping them separate is important for
safe maintenance:

| State category | Examples | Expected owner |
|---|---|---|
| Authentication/context | cashier, company, tenant session, permissions | shared auth/session services and TerminalPage context |
| Terminal state | terminal identity, lock, registry, active location, operator session | TerminalPage and terminal utilities/services |
| Shift state | opening, active, break, resume, close, stale state | POS services and terminal workflow |
| Catalog state | active catalog, search, category, page size, page, image status | catalog hook/workflow and POS catalog services |
| Sale draft | current items, options, quantities, parked state | cart workflow and POS checkout components |
| Payment state | selected tender, split legs, manual amounts, paid/remaining/change | checkout/payment workflow and split-payment session |
| Operational state | incoming queue, delivery jobs, history, reports, audit filters | operational services and workspace panels |
| Device state | printer/drawer availability, driver, bridge readiness | hardware registry, hook, and drivers |
| Browser recovery state | text-size preference, drafts, offline snapshot, operation queue, image-failure cache | scoped browser stores; not financial authority |

A component should not read an unrelated workflow's internal state directly. Shared
formatting and UI primitives are preferred over duplicating mode-specific state logic.

## Role and permission behavior

The terminal UI is not equivalent to unrestricted administrator access.

- The signed-in user and active company determine the available POS context.
- Terminal identity and registry rules determine whether a terminal can be selected or
  used.
- Shift ownership determines whether a shift can be resumed, transferred, or closed.
- Permission checks control sensitive surfaces such as audit, vouchers, settings, reports,
  and administrative terminal actions.
- Master-admin paths may expose additional setup or recovery controls, but they still use
  the terminal context and existing API authority.
- A hidden or disabled control is a presentation decision; the backend remains the final
  authority for protected mutations.

When documenting a new POS control, record both its visibility rule and its mutation
authority. Do not use a UI-only permission check as a security boundary.

## Mode-specific behavior

The POS shell, catalog, current-sale layout, payment surfaces, and operational workspace
patterns are shared. The operational meaning of a sale is mode-specific.

| Mode panel | Purpose | Isolation rule |
|---|---|---|
| FnbWorkflowPanel | F&B order workflow and related preparation/order actions | Keep F&B terminology and modifier behavior inside F&B flows |
| CounterWorkflowPanel | Counter-oriented service/sale actions | Do not expose F&B-only or public storefront-only controls |
| ServicesWorkflowPanel | POS-side service activity handling | This is POS operational UI; it does not change the public Services storefront booking flow |
| HospitalityPosPanel | Hospitality-specific POS operations | Keep hospitality status/actions within the hospitality context |
| PosFnbModifierManager and FnbModifierPickerDialog | F&B modifier management and selection | Modifier rules remain distinct from generic service options |

Mode-specific components may share layout, typography, currency, dialog, and responsive
patterns, but must preserve their own labels, state transitions, eligibility rules, and
receipt/order semantics. A visual consistency change must not flatten these differences.

## UI/UX contract

### Layout

- The terminal has a catalog/sale working area and bounded supporting panels.
- Primary actions remain reachable when a dialog or panel is taller than the viewport.
- Checkout and payment surfaces adapt between desktop panels and mobile sheets.
- Category strips and catalog viewports support horizontal touch interaction without
  introducing page-level horizontal overflow.
- Action order is intentional on narrow screens; destructive or final actions must not
  become ambiguous after wrapping.

### Typography

- Strong headings distinguish terminal state, current sale, checkout totals, and operational
  sections.
- Long item/service names wrap or clamp inside their content area instead of pushing
  prices, quantities, or action buttons outside the card.
- POS text-size preferences use Normal, Large, and Extra large options.
- Labels, statuses, totals, and supporting copy use consistent weight and spacing across
  mode panels and dialogs.

### Color and emphasis

- POS uses its existing blue/slate/cyan/emerald/amber/rose visual language for navigation,
  selected state, status, success, warning, and destructive emphasis.
- Color is paired with text, iconography, or state so it is not the only indicator.
- POS colors are not the Services storefront theme. Storefront palette decisions belong
  to the storefront surface and must not be copied into the POS terminal without an
  explicit design decision.

### Accessibility

- Custom listboxes expose their label and expanded state.
- Escape and outside-click dismissal are available for transient menus.
- Buttons have explicit action semantics and remain keyboard reachable.
- Scrollable dialogs use contained scroll regions and preserve access to primary actions.
- Contract tests protect roles, labels, layout classes, mode copy, and interaction behavior.

### Images

- Catalog images use responsive source handling and loading priorities.
- Mobile-safe mode avoids unnecessary source variants.
- Failed sources fall back to the placeholder path and can be remembered for the current
  session.
- An image selected or updated in another application is not guaranteed to be visible
  until the catalog source returns the updated URL and the POS refresh/invalidation path
  receives it. Image persistence belongs to catalog services, not the presentation cache.

## Existing service and hardware boundaries

### Service/API boundary

POS service modules call existing API contracts for catalog, terminal, shift, checkout,
orders, delivery, history, settings, and related operations. Components should receive
workflow data and callbacks rather than embedding transport details into presentation
markup.

### Browser storage boundary

Browser storage is used for bounded recovery and preference concerns such as:

- terminal identity and lock/context recovery;
- last POS view;
- text-size preference;
- cart drafts and split-payment session state;
- offline snapshots and queued terminal operations;
- image-failure cache;
- online-order sound preference and update-safety state.

Stored data may be stale, missing, or cleared. It must be validated before use and must
never be treated as proof that a financial mutation succeeded.

### Hardware boundary

The hardware contract/registry selects a driver for the current environment. POS UI
components call the hardware hook/contract rather than coupling directly to a particular
printer, drawer, or bridge. Supported drivers may include browser-safe, LAN bridge, and
iMin-native paths. A hardware probe failure should not incorrectly remove a valid action
when the selected runtime can still perform it; the driver returns the final capability
and error result.

### Offline and queued operations

The POS contains browser-side recovery and queued-operation support for selected terminal
operations. Queue replay is bounded and retry-aware. A queued operation must remain
idempotent and scoped to the intended tenant, terminal, operator, and shift. Successful
local queue replay is not the same as a completed server mutation until the service/API
confirms it.

## Developer setup

The canonical application instructions are in
[apps/dgfy-pos/README.md](../../apps/dgfy-pos/README.md).

### Install and run

From the repository root:

~~~powershell
npm install
npm run dev:pos
~~~

Or from apps/dgfy-pos:

~~~powershell
npm run dev
~~~

The local dev server uses port 5174. Configure only the POS VITE variables needed by
the standalone app. Do not copy the entire IMS environment file into POS.

Development auto-login is opt-in and requires the corresponding VITE_POS_DEV_AUTO_LOGIN
setting plus the configured development company token, email, and password. Do not place
real credentials in committed environment files.

### Build and lint

~~~powershell
npm --prefix apps/dgfy-pos run lint
npm --prefix apps/dgfy-pos run build
npm --prefix apps/dgfy-pos run test:e2e
npm --prefix apps/dgfy-pos run test:security
~~~

The normal build is the release-relevant build. On a memory-constrained Windows machine,
a reduced-memory build may be useful for diagnosis, but it must be labeled as reduced
validation and not treated as proof that the optimized release build passed.

### Shared POS unit and contract tests

The shared POS tests are run through a consumer with the required dependency runtime.
The validated local command was run from apps/dgfy-ims:

~~~powershell
Push-Location apps/dgfy-ims
npx vitest run --maxWorkers=1 ../../packages/web-core/src/features/pos
Pop-Location
~~~

The standalone app's npm test command covers its own app specs only. It is not a substitute
for the shared feature-suite command above.

## Manual QA runbook

Use a test tenant and test payment data. Do not use a real customer or payment instrument
for local verification.

### A. Entry and terminal access

1. Open the standalone POS URL on port 5174.
2. Confirm the terminal route renders without a blank page or route fallback.
3. Sign in or use the explicitly configured local auto-login.
4. Select the intended company/tenant.
5. Confirm the terminal identity and operating location.
6. Verify the locked state blocks selling until the terminal is unlocked.
7. Test an invalid or incomplete unlock attempt and confirm an actionable error.
8. Open/resume a shift and confirm the selling surface becomes available.
9. Lock and unlock again; confirm the active context is retained or revalidated safely.

### B. Catalog and current sale

1. Search by a known item/service name.
2. Change category and verify the catalog updates without page-level overflow.
3. Change page size and page number.
4. Enter a valid page number and an out-of-range page number; confirm clamping.
5. Use barcode scan if the local device/browser supports it.
6. Load a catalog item with an image and one without an image.
7. Confirm image fallback does not break item name, price, or quantity controls.
8. Select a service/item with options and confirm the correct options dialog opens.
9. Add the item, change quantity, and verify the current-sale total.
10. Park the sale and restore it; confirm the intended cashier/terminal rules apply.

### C. Checkout and payment

1. Advance a sale to checkout.
2. Confirm monetary values use the expected peso presentation and remain arithmetically
   correct.
3. Apply an eligible discount and verify the selected state, totals, and clear behavior.
4. Test employee selection/approval or employee credit in a configured test account.
5. Test a downpayment where the tenant enables it.
6. Test one tender method with an exact amount.
7. Test an overpayment and verify change.
8. Test split tender with multiple amounts and verify paid, remaining, and change values.
9. Test an invalid split amount and confirm the action is blocked with useful feedback.
10. Test manual tender/cheque only when enabled by the tenant configuration.
11. Confirm the final confirmation surface scrolls within its bounds on a narrow viewport.
12. Complete a test sale and verify receipt preview/print behavior.

### D. Operational workspaces

1. Open incoming orders and verify the selected view mode.
2. Open online-order details and receipt preview.
3. Open transaction history and cashier history; search and inspect a test transaction.
4. Open audit and verify the operator/permission boundary.
5. Open reports and close-report payment breakdown.
6. Verify shift close readiness, close summary, and Z-reading presentation.
7. Open voucher, pricelist, affiliate, or delivery-pricing panels only with an account that
   is authorized to access them.
8. In each configured workflow mode, verify that mode-specific labels and controls remain
   in the correct mode.

### E. Responsive and accessibility pass

Run the same critical path at desktop, tablet, and narrow mobile widths:

- catalog search and category scrolling;
- item options and quantity controls;
- checkout confirmation;
- split-payment dialog;
- parked-sales dialog;
- terminal lock drawer;
- reports/history panels.

Also verify keyboard focus, Escape dismissal, outside-click behavior, readable wrapped
names, and access to primary actions without browser-level horizontal scrolling.

### F. Hardware pass

On a supported terminal or bridge:

1. confirm the driver is detected;
2. print a test receipt;
3. print an order ticket where configured;
4. open the cash drawer where authorized;
5. print shift summary/Z-reading where configured;
6. confirm a driver failure gives a recoverable message and does not corrupt the sale.

## Test matrix

| Area | Automated evidence | Manual evidence |
|---|---|---|
| Catalog, images, pagination, text size | POS catalog and presentation contract tests | Search, page, image fallback, text-size, touch checks |
| Current sale and options | Item options, terminal view, and workflow contracts | Add, customize, quantity, park, restore |
| Checkout and currency | Checkout, receipt, and utility tests | Exact payment, change, discounts, mobile scroll |
| Split/manual tender | Split-payment behavior and UI contracts | Valid/invalid legs, remaining, change |
| Employee credit/downpayment | Dedicated behavior and contract tests | Authorized and unauthorized scenarios |
| Terminal/shift | Terminal lock and operational contracts | Lock, unlock, open, resume, break, close |
| Modes | Workflow-panel and presentation-matrix tests | F&B, counter, services, hospitality checks |
| Operations/reports | History, audit, report, queue, and print tests | Open each permissioned workspace |
| Hardware | iMin/order-ticket utility tests | Real bridge/printer/drawer validation |
| Application health | Lint, build, architecture, compliance | Local URL and browser smoke flow |

## Acceptance criteria for this POS snapshot

This branch-level POS work is considered technically documented when:

- all five POS feature commits are identified by exact hash and Conventional Commit name;
- every changed POS path is listed and matches the commit manifests;
- catalog, current-sale, checkout/payment, operational, mode, hardware, and browser-state
  responsibilities are explained;
- POS ownership is distinguished from catalog/inventory and public storefront ownership;
- shared-trunk consumers and local routes are identified;
- automated validation evidence and its limitations are recorded;
- manual QA and hardware follow-up steps are available;
- service ancestry and unrelated working-tree changes are explicitly excluded;
- the final branch's relationship to `origin/develop`, pushed branch name, and documentation
  inventory are recorded;
- no merge, deployment, or claim of production verification is made.

The current document satisfies the documentation criteria above. Product acceptance still
requires the release branch's own checks and any required browser, hardware, API, and
deployment evidence.

## Change summary by functional area

### 1. Catalog and terminal presentation

The catalog and terminal presentation batch (`8a115870f`, ported from source `6bab3628f`)
improves the catalog and terminal shell without moving catalog or inventory ownership into POS:

- Added a responsive catalog page-size control with an Auto mode and explicit page
  options.
- Added bounded page-jump input and visible page-number controls, including clamping to
  valid pages and a compact maximum visible-page set.
- Improved catalog search, category-strip scrolling, barcode scanning layout, and touch
  behavior for narrow screens.
- Added safer responsive image handling: mobile-safe sources, source-set suppression in
  mobile-safe mode, placeholder/error fallback behavior, loading priorities, and a
  session-scoped image-failure cache.
- Improved wrapping and truncation for imageless catalog names, item names, prices,
  quantity controls, service labels, badges, and item-option content.
- Refined current-sale and item-option layout, parked-sale action ordering, terminal
  dialogs, sidebar panels, and responsive page surfaces.
- Replaced the POS text-size select presentation with a custom accessible button/listbox
  control supporting Normal, Large, and Extra large preferences, Escape handling, and
  outside-click dismissal.
- Added tests for catalog card presentation, performance/image behavior, item options,
  mobile focus/zoom, mode presentation, text-size behavior/layout/CSS/integration,
  terminal scrolling, and terminal view contracts.

### 2. Checkout, payments, discounts, settlement, and receipts

The checkout and payment batch (`9dc2b924f`, ported from source `bb03fc154`) hardens the
sales-completion path:

- Standardized POS monetary display around the peso glyph ₱ in checkout, payment,
  settlement, and related receipt-facing surfaces. Existing numeric calculations remain
  numeric; this is presentation and formatting normalization.
- Reworked the checkout confirmation surface for mobile sheets and desktop panels with
  bounded horizontal/vertical scrolling and overscroll containment.
- Improved payment-method layout, payment totals, discount selection, statutory and
  commercial discount controls, employee selection/approval, promo/affiliate behavior,
  and selected-state clearing.
- Improved split-tender dialogs and workflows, including manual tender support,
  validation, paid/remaining/change summaries, tender detail presentation, and amount
  arithmetic formatting.
- Refined balance settlement, downpayment settings, refund, bill-request, parked-sales,
  and receipt-dialog presentation.
- Refined employee-credit management, payment, and report panels while preserving the
  employee-credit behavior covered by its ADR.
- Added or updated tests for checkout confirmation, bill requests, discounts,
  downpayments, employee credit, split tender, receipt contracts, terminal settlement,
  downpayment visibility, parked sales, and checkout utility formatting.

### 3. Operational workspace and mode consistency

The operational presentation batch (`28469ad41`, ported from source `67170d806`) normalizes the
broader POS operating experience:

- Refined terminal operations, transaction history, cashier history, audit workspace,
  reports/analytics, and terminal-lock surfaces.
- Refined mode-specific panels for F&B, counter, services, hospitality, and F&B
  modifiers. Mode-specific terminology and controls remain isolated so F&B/service
  concepts do not leak across the wrong POS mode.
- Refined online-order details, online-order receipts, order previews, and the
  Skupervisor POS parallels.
- Refined affiliates, delivery-pricing settings, pricelist management, voucher
  management, and voucher form modeling.
- Refined receipt printing, shift-close summaries, Z-reading, and order-ticket-related
  presentation.
- Standardized currency labels and tenant-symbol fallback behavior in operational
  panels.
- Refined iMin hardware bridge formatting, incoming-queue formatting, history search,
  and void-audit utilities.
- Added or updated tests for cashier history, close-report payment breakdown, delivery
  campaigns, incoming queue view modes, always-available behavior, audit/void behavior,
  workflow-panel contracts, terminal locking, history search, and iMin order-ticket
  formatting.

## End-to-end POS behavior map

The changes can be reviewed in this order:

1. **Terminal entry and shell** — terminal lock/pairing and operator-session surfaces
   establish the POS context; responsive shell and dialog containers keep controls
   usable at the available viewport size.
2. **Catalog discovery** — search, categories, barcode scanning, page size, page jump,
   pagination, image fallback, and text-size controls determine how a cashier finds an
   item or service.
3. **Current sale** — selecting an item opens the appropriate options flow, supports
   quantity changes and service/item customization, and exposes park, clear, and related
   sale actions with responsive ordering.
4. **Checkout preparation** — the checkout surface summarizes the current sale and
   allows discounts, employee-credit behavior, downpayment settings, and payment-method
   selection.
5. **Payment completion** — split tender, manual tender, cheque, settlement, change,
   validation, and checkout confirmation use consistent totals and presentation.
6. **Receipt and follow-up** — receipt dialogs, order preview, printing, transaction
   history, cashier history, and audit/report surfaces use the normalized currency and
   responsive workspace patterns.
7. **Mode-specific operation** — F&B, counter, services, and hospitality panels expose
   their own operational controls while sharing the POS shell and presentation rules.

## UI/UX and frontend contract standards applied

### Typography and text behavior

- POS hierarchy uses the existing strong heading/label treatment, with constrained
  wrapping and line clamping where card width is limited.
- Item and service names are allowed to wrap without overflowing quantity or price
  controls.
- User-controlled POS text size is exposed through an accessible custom listbox rather
  than an unstyled native select-like control.
- Operational labels, payment totals, and status text use consistent weight and spacing
  across the POS workspaces.

### Responsive behavior

- Narrow screens use bounded scroll regions and mobile sheets where dialogs would
  otherwise exceed the viewport.
- Horizontal category strips and catalog viewports support touch interaction without
  creating page-level overflow.
- Images use responsive loading/fallback rules and avoid downloading inappropriate
  source variants in mobile-safe mode.
- Dialogs and panels contain their scroll area, preserving access to primary actions.

### Accessibility and interaction behavior

- Custom controls expose labels, expanded state, and listbox semantics where applicable.
- Escape and outside-click behavior closes transient controls consistently.
- Buttons and controls preserve keyboard-accessible focus and explicit action semantics.
- Contract tests pin the expected classes, roles, labels, layout states, and mode-specific
  copy so future visual cleanup does not silently remove behavior.

### Currency and visual consistency

- POS monetary presentation uses ₱ in the affected checkout and operational surfaces,
  with locale-aware numeric formatting where the component already supports it.
- Some operational panels use a tenant currency-symbol fallback while retaining the peso
  default used by the local POS experience.
- POS surface colors continue to use the existing POS blue/slate/cyan/emerald/amber/
  rose visual language. These are POS surface choices; they do not replace the separate
  Services storefront palette or any storefront theme contract.

## Data, ownership, and persistence notes

- Catalog identity and inventory truth remain outside POS, consistent with ADR 0029.
  POS consumes catalog information for sales execution and presentation.
- The commits use existing frontend data and API contracts; they do not add an endpoint,
  migration, tenant-schema change, or backend controller.
- The catalog image-failure cache is browser sessionStorage state used to avoid
  repeatedly requesting a source that failed during the current session. It is not a
  server-side catalog update and does not replace the catalog image source of truth.
- Existing POS workflows for parked sales, employee credit, split tender, downpayments,
  cheque tender, operator sessions, and hardware formatting were refined in their
  current boundaries; no ownership transfer was introduced.
- Service-related controls in the POS mode panel are POS operational presentation only.
  They must not be read as changes to Ralph's Laundry, Ralph's Salon, or any other
  public service storefront flow.

## Exhaustive changed-file manifest

The following lists are the complete 96-path POS/shared-POS manifest for the five current
feature commits. The original three source-batch sections are retained for provenance, followed
by the two follow-up contract sections. All paths are repository-relative and no Services
Storefront, backend, migration, or unrelated frontend path is included.

### Commit 8a115870f — catalog and terminal presentation (source batch 6bab3628f)

#### Tests and contracts

~~~text
packages/web-core/src/features/pos/__tests__/posCatalogCardPresentation.contract.test.js
packages/web-core/src/features/pos/__tests__/posCatalogPerformance.contract.test.js
packages/web-core/src/features/pos/__tests__/posItemOptions.contract.test.js
packages/web-core/src/features/pos/__tests__/posMobileFocusZoom.contract.test.js
packages/web-core/src/features/pos/__tests__/posModePresentationMatrix.behavior.test.jsx
packages/web-core/src/features/pos/__tests__/posTextSizeControl.test.jsx
packages/web-core/src/features/pos/__tests__/posTextSizeCss.contract.test.js
packages/web-core/src/features/pos/__tests__/posTextSizeIntegration.contract.test.js
packages/web-core/src/features/pos/__tests__/posTextSizeLayout.contract.test.js
packages/web-core/src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js
packages/web-core/src/features/pos/__tests__/terminalViewModeContracts.test.js
packages/web-core/src/features/pos/utils/__tests__/posCatalogWorkflow.test.js
~~~

These tests lock catalog presentation, image/performance behavior, item options,
mobile focus/zoom, mode presentation, text-size control and layout, responsive scrolling,
terminal view modes, and catalog workflow utilities.

#### Components, hooks, services, and utilities

~~~text
packages/web-core/src/features/pos/components/ItemOptionsDialog.jsx
packages/web-core/src/features/pos/components/POSBarcodeScanner.jsx
packages/web-core/src/features/pos/components/POSCheckoutTerminalView.jsx
packages/web-core/src/features/pos/components/PosCurrentSaleActions.jsx
packages/web-core/src/features/pos/components/PosTextSizeControl.jsx
packages/web-core/src/features/pos/components/ServiceOptionsModal.jsx
packages/web-core/src/features/pos/components/TerminalPageDialogLayer.jsx
packages/web-core/src/features/pos/components/TerminalPageLayout.jsx
packages/web-core/src/features/pos/components/TerminalSidebarPanel.jsx
packages/web-core/src/features/pos/hooks/usePosCatalogWorkflow.js
packages/web-core/src/features/pos/services/posCatalogImageFailureStore.js
packages/web-core/src/features/pos/utils/posCatalogWorkflow.js
packages/web-core/src/features/pos/utils/posTerminalLayout.js
~~~

These files implement the catalog controls, responsive terminal/catalog layout,
current-sale presentation, item/service option surfaces, text-size control, image
fallback state, and catalog workflow helpers described above.

### Commit 9dc2b924f — checkout and payment workflows (source batch bb03fc154)

#### Tests and contracts

~~~text
packages/web-core/src/features/pos/__tests__/POSCheckoutConfirmDialog.behavior.test.jsx
packages/web-core/src/features/pos/__tests__/billRequestDialog.behavior.test.jsx
packages/web-core/src/features/pos/__tests__/discountQuantityEmployeeDropdown.contract.test.js
packages/web-core/src/features/pos/__tests__/discountTypeCards.contract.test.js
packages/web-core/src/features/pos/__tests__/downpaymentSettingsPanel.behavior.test.jsx
packages/web-core/src/features/pos/__tests__/employeeCredit.contract.test.js
packages/web-core/src/features/pos/__tests__/employeeCreditManagementPanel.behavior.test.jsx
packages/web-core/src/features/pos/__tests__/employeeCreditPaymentPanel.behavior.test.jsx
packages/web-core/src/features/pos/__tests__/itemDiscountEligibility.contract.test.js
packages/web-core/src/features/pos/__tests__/posParkedSalesDialog.contract.test.js
packages/web-core/src/features/pos/__tests__/posSplitPaymentManualTender.behavior.test.jsx
packages/web-core/src/features/pos/__tests__/posSplitPaymentUi.contract.test.js
packages/web-core/src/features/pos/__tests__/receiptContractConformance.contract.test.js
packages/web-core/src/features/pos/__tests__/terminalBalanceSettlement.behavior.test.jsx
packages/web-core/src/features/pos/__tests__/terminalDownpaymentVisibility.behavior.test.jsx
packages/web-core/src/features/pos/utils/__tests__/posCheckoutTerminalUtils.test.js
~~~

These tests cover checkout confirmation, bill requests, discounts, downpayments,
employee credit, discount eligibility, parked sales, split/manual tender, receipt
contracts, settlement, downpayment visibility, and checkout formatting utilities.

#### Components and utilities

~~~text
packages/web-core/src/features/pos/components/BalanceSettlementDialog.jsx
packages/web-core/src/features/pos/components/BillRequestDialog.jsx
packages/web-core/src/features/pos/components/DownpaymentSettingsPanel.jsx
packages/web-core/src/features/pos/components/EmployeeCreditManagementPanel.jsx
packages/web-core/src/features/pos/components/EmployeeCreditPaymentPanel.jsx
packages/web-core/src/features/pos/components/EmployeeCreditReportPanel.jsx
packages/web-core/src/features/pos/components/POSCheckoutConfirmDialog.jsx
packages/web-core/src/features/pos/components/POSCheckoutTerminal.jsx
packages/web-core/src/features/pos/components/POSCheckoutTerminalReceiptDialogs.jsx
packages/web-core/src/features/pos/components/POSDiscountWorkspace.jsx
packages/web-core/src/features/pos/components/POSParkedSalesDialog.jsx
packages/web-core/src/features/pos/components/POSRefundWorkflowDialog.jsx
packages/web-core/src/features/pos/components/POSSplitPaymentDialog.jsx
packages/web-core/src/features/pos/components/POSSplitPaymentWorkflow.jsx
packages/web-core/src/features/pos/utils/posCheckoutTerminalUtils.js
~~~

These files implement the checkout shell, payment confirmation, discount workspace,
split payments, settlements, refunds, downpayments, employee credit, parked sales,
bill requests, receipt dialogs, and checkout formatting/validation behavior.

### Commit 28469ad41 — operational workspace presentation (source batch 67170d806)

#### Tests and contracts

~~~text
packages/web-core/src/features/pos/__tests__/cashierHistoryPanel.test.jsx
packages/web-core/src/features/pos/__tests__/closeReportPaymentBreakdown.test.jsx
packages/web-core/src/features/pos/__tests__/deliveryCampaignPanel.behavior.test.jsx
packages/web-core/src/features/pos/__tests__/incomingQueueViewMode.behavior.test.jsx
packages/web-core/src/features/pos/__tests__/posAlwaysAvailable.contract.test.js
packages/web-core/src/features/pos/__tests__/posAuditWorkspace.contract.test.js
packages/web-core/src/features/pos/__tests__/posVoidAudit.test.js
packages/web-core/src/features/pos/__tests__/posWorkflowPanel.contract.test.jsx
packages/web-core/src/features/pos/__tests__/terminalLockDrawer.contract.test.jsx
packages/web-core/src/features/pos/utils/__tests__/iminHardwareBridge.orderTicket.test.js
packages/web-core/src/features/pos/utils/__tests__/posHistorySearch.test.js
~~~

These tests cover history, close-report breakdowns, delivery campaigns, incoming queue
view modes, always-available behavior, audit/void behavior, workflow-panel contracts,
terminal locking, hardware order tickets, and history search.

#### Components and utilities

~~~text
packages/web-core/src/features/pos/components/AffiliatesWorkspacePanel.jsx
packages/web-core/src/features/pos/components/AuditWorkspacePanel.jsx
packages/web-core/src/features/pos/components/CashierHistoryPanel.jsx
packages/web-core/src/features/pos/components/CounterWorkflowPanel.jsx
packages/web-core/src/features/pos/components/FnbModifierPickerDialog.jsx
packages/web-core/src/features/pos/components/FnbWorkflowPanel.jsx
packages/web-core/src/features/pos/components/HospitalityPosPanel.jsx
packages/web-core/src/features/pos/components/OnlineOrderDetailsModal.jsx
packages/web-core/src/features/pos/components/OnlineOrderReceiptModal.jsx
packages/web-core/src/features/pos/components/OrderPreviewView.jsx
packages/web-core/src/features/pos/components/POSTransactionHistoryPanel.jsx
packages/web-core/src/features/pos/components/PosDeliveryPricingSettingsCard.jsx
packages/web-core/src/features/pos/components/PosFnbModifierManager.jsx
packages/web-core/src/features/pos/components/PosReportsAnalyticsWorkspace.jsx
packages/web-core/src/features/pos/components/PricelistManagementPanel.jsx
packages/web-core/src/features/pos/components/ReceiptPrintView.jsx
packages/web-core/src/features/pos/components/ServicesWorkflowPanel.jsx
packages/web-core/src/features/pos/components/ShiftCloseSummaryPrintView.jsx
packages/web-core/src/features/pos/components/SkupervisorPOSCheckoutTerminal.jsx
packages/web-core/src/features/pos/components/SkupervisorPOSTransactionHistoryPanel.jsx
packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx
packages/web-core/src/features/pos/components/VoucherManagementPanel.jsx
packages/web-core/src/features/pos/components/ZReadingPrintView.jsx
packages/web-core/src/features/pos/components/voucherFormModel.js
packages/web-core/src/features/pos/utils/iminHardwareBridge.js
packages/web-core/src/features/pos/utils/incomingQueueOrderFormatting.js
packages/web-core/src/features/pos/utils/posHistorySearch.js
packages/web-core/src/features/pos/utils/posVoidAudit.js
~~~

These files cover operational workspaces, mode panels, online-order surfaces,
transaction/cashier history, reports, audit, pricing, affiliates, vouchers, receipts,
shift close, Z-reading, Skupervisor parallels, hardware formatting, queue formatting,
history search, and void-audit behavior.

### Follow-up commit 317e6f07f — responsive terminal contracts

~~~text
packages/web-core/src/features/pos/components/POSCheckoutTerminalView.jsx
packages/web-core/src/features/pos/components/POSDiscountWorkspace.jsx
packages/web-core/src/index.css
~~~

This follow-up completes the responsive terminal contract by keeping mobile catalog images eager
when appropriate, aligning statutory-beneficiary presentation with the POS blue surface, and
providing the shared POS elevation, focus-shadow, scroll, and mobile checkout-sheet rules required
by the current terminal layout.

### Follow-up commit 443f84934 — shared image and receipt contract tests

~~~text
packages/web-core/src/features/pos/__tests__/itemDiscountEligibility.contract.test.js
packages/web-core/src/features/pos/__tests__/posCatalogCardPresentation.contract.test.js
packages/web-core/src/features/pos/__tests__/posCatalogPerformance.contract.test.js
packages/web-core/src/features/pos/__tests__/receiptContractConformance.contract.test.js
~~~

These tests are aligned with the current `develop` architecture: shared responsive image components,
pending POS image-preview state, mobile-aware loading priority, and the current peso-symbol receipt
format. The tests do not introduce a separate service storefront flow.

## Validation evidence

Validation was run against the final isolated POS branch after the feature and documentation
commits were assembled:

| Check | Command or scope | Result |
|---|---|---|
| POS unit/component/contract suite | From apps/dgfy-ims: `npx vitest run --maxWorkers=1 ../../packages/web-core/src/features/pos` | **PASS — 199 test files passed; 1,264 tests passed** |
| POS application lint | `npm run lint` from apps/dgfy-pos | **PASS** |
| POS production build | `npm run build` from apps/dgfy-pos with `GOMAXPROCS=1` | **PASS — 2,994 modules transformed** |
| IMS consuming production build | `npm run build` from apps/dgfy-ims | **PASS — 3,817 modules transformed** |
| Architecture guardrails and controller boundaries | `npm run check:architecture` | **PASS — ArchitectureGuardrails: 54 modules / 563 files; ControllerBoundary: 94 controller files** |
| Documentation and ADR checks | `npm run lint:docs` | **PASS — 30 governed docs; 89 ADRs** |
| Compliance checks | `npm run check:compliance` | **PASS — 6 sensitive files covered by the POS declaration; API contract checks passed** |
| Whitespace/error check | `git diff --check` | **PASS** |
| Reserved-marker safety scan | Repository safety-marker scan across staged/changed files | **No matches** |
| Scope audit | `git diff --name-only origin/develop...HEAD` | **PASS — 98 paths: 96 POS/shared POS paths and 2 documentation paths; no non-POS paths** |

### Build notes

The normal optimized Vite builds passed for both `apps/dgfy-pos` and the consuming
`apps/dgfy-ims` application. Vite emitted only existing advisory warnings about a dynamically
imported image rollout module and large chunks; neither warning failed the build. The builds were
run with `GOMAXPROCS=1` for predictable local resource use.

### Validation not performed in this audit

- No browser-driven end-to-end walkthrough or hardware/printer validation was run in this audit.
- No merge, deployment, or production verification is claimed.
- No POS backend/API contract change was introduced, so backend and migration checks were not
  required for this frontend-only payload; the repository-wide compliance and architecture checks
  passed.

## POS-only release inventory and exclusions

### Files/commits included in the POS-only follow-up branch

The POS feature payload on the isolated branch is:

~~~text
8a115870f style(pos): refine terminal catalog presentation
9dc2b924f fix(pos): harden checkout payment workflows
28469ad41 style(pos): normalize operational workspace presentation
317e6f07f fix(pos): complete responsive terminal contracts
443f84934 test(pos): align contracts with shared image architecture
~~~

The 96 unique POS/shared-POS paths listed in the exhaustive manifest are the files associated with
those commits. The documentation payload is:

~~~text
5ff155af7 docs(pos): document POS frontend changes
0cee9b244 docs(pos): expand frontend functional documentation
81b9edf7b docs(pos): add compliance impact declaration
b442ba34c docs(pos): refresh branch audit evidence
da5f6efb4 docs(pos): remove marker literal from audit
~~~

The final refresh of this file is the remaining documentation commit on this branch.

### Explicitly excluded service ancestry

These source-branch commits were deliberately not cherry-picked into the isolated POS-only
payload:

~~~text
768d83c21 fix(pos-services): add service catalog image upload support
18257a373 fix(pos-services): expose service activity in POS
8cc5a1653 style(pos-services): normalize service image model files
~~~

They contain service-specific paths under `packages/web-core/src/features/services` and
service-catalog/POS service integration. They must not be bundled into the POS-only branch or
push. The isolated branch has no service ancestry from those commits.

### Explicitly excluded working-tree changes

The original worktree at `C:\xampp\htdocs\DGFY` contains existing non-POS changes and
unresolved/unmerged paths across areas such as backend/API, migration runner, registration,
storefront, and shared service code. This document does not enumerate those as POS changes. They
were not staged, overwritten, resolved, reset, or pushed by this task. The isolated `C:\w` worktree
is clean except for the documentation refresh being committed now.

## Recommended inspection and release procedure

Use these read-only commands from `C:\w` to inspect the exact isolated branch without touching the
original dirty working tree:

~~~powershell
git status --short --branch
git show --stat --oneline 8a115870f
git show --stat --oneline 9dc2b924f
git show --stat --oneline 28469ad41
git show --stat --oneline 317e6f07f
git show --stat --oneline 443f84934
git show --name-only --format=fuller 8a115870f
git show --name-only --format=fuller 9dc2b924f
git show --name-only --format=fuller 28469ad41
git show --name-only --format=fuller 317e6f07f
git show --name-only --format=fuller 443f84934
git diff --name-only origin/develop...HEAD -- packages/web-core/src/features/pos
git rev-list --left-right --count origin/develop...HEAD
~~~

The branch has already been created from the current `origin/develop`, and the selected POS and
documentation commits have already been assembled. Before pushing, verify:

~~~powershell
git rev-list --left-right --count origin/develop...HEAD
git diff --name-only origin/develop...HEAD
git status --short
~~~

The resulting diff should contain only `packages/web-core/src/features/pos/**`,
`packages/web-core/src/index.css`, and the two explicit POS documentation files. If service,
backend, migration, registration, or storefront paths appear, stop and remove them from the
release inventory before pushing.

## Maintenance notes

- Update this document when the documented POS commits are amended, replaced, or cherry-picked
  into a new release branch.
- Do not claim that the original mixed worktree is POS-only; only the isolated branch's listed
  commits are the POS feature payload documented here.
- Run the POS test suite, POS lint, application build, architecture checks, compliance
  checks, and the repository's required PR checks again on the final branch that will be
  pushed.
- Keep public Services storefront changes documented separately so POS operational
  screens and storefront booking/fulfillment flows remain independently reviewable.
