---
status: reference
authority_level: reference
owner: pos
last_reviewed: 2026-09-05
applies_to: pos_items_modals_android_webview_and_browser
topic: pos_items_modal_hardening
---

# POS Items Modal Hardening Plan

## Objective

Prevent clipped fields, unreachable actions, unintended background scrolling,
and avoidable interaction delay in the POS Items modals used by the browser POS
and the temporary iMin Android WebView wrapper.

## Governing boundaries

- `packages/web-core` owns the shared Items UI used by `apps/dgfy-pos`.
- `apps/dgfy-android-bridge/imin-wrapper` currently embeds the hosted POS in
  `WebPosActivity`; its manifest already uses `windowSoftInputMode=adjustResize`.
- ADR 0043's separate native React Native/Kotlin hardware POS is a different
  runtime. This plan does not claim that the native app uses these web modals.
- Chrome 80 is the binding WebView floor under ADR 0067.
- No API, database, fiscal, inventory, or device-bridge ownership change is
  planned.

## Phase 291 - Modal inventory and device baseline

Status: `completed` for the amended source-inventory scope (2026-09-05).

### Runtime evidence

- Wrapper application ID: `com.dgfy.iminwrapper`; staging and dev flavors add
  `.stage` and `.dev`.
- Wrapper version in source: version code `3`, version name `1.2`.
- Hosted POS routes: production `https://pos.dgfy.ph`, staging
  `https://pos.stage.dgfy.ph`, and development `https://pos.dev.dgfy.ph`.
- Local POS, API, IMS, Storefront, and device-bridge ports were listening on
  5174, 5000, 5173, 5175, and 5101 respectively during the audit.
- `adb devices -l` returned no connected device. APK package/version, Android
  build, WebView version, physical viewport, keyboard behavior, frame timing,
  and memory trend are therefore unverified.

### Items modal inventory

| Surface | Implementation | Layout/scroll ownership | Phase 291 result |
|---|---|---|---|
| Add Item | `TerminalOperationsWorkspace.jsx` custom portal | `100dvh` height, internal scrolling body, fixed header/footer | Static risk confirmed: no `vh` fallback or shared viewport clamp |
| Edit Item | `TerminalOperationsWorkspace.jsx` custom portal | `100dvh` height, internal scrolling body, fixed header/footer | Same static risk as Add Item |
| Create Service | `PosServiceCatalogCreateModal.jsx` custom portal | `100dvh` maximum, scrolling body | Static risk confirmed: no `vh` fallback |
| Edit Service | `PosServiceCatalogEditModal.jsx` custom portal | `100dvh` maximum, scrolling body | Static risk confirmed: no `vh` fallback |
| Product QR scanner | `ProductQrScannerModal.jsx` custom portal | `100dvh` maximum, whole-dialog scroll | Static risk confirmed: no `vh` fallback |
| CSV import | `CSVImportModal.jsx` shared `Dialog` | shared viewport clamp; nested vertical result regions | Structurally bounded; device nested-scroll proof pending |
| PDF menu import | `PdfMenuImportModal.jsx` shared `Dialog` | shared clamp; intentional horizontal preview table | Structurally bounded; touch pan and footer reachability pending |
| ZIP/CSV batch import | `MenuImportBatchModal.jsx` shared `Dialog` | shared clamp; nested lists and horizontal preview table | Structurally bounded; long-result and keyboard proof pending |

### Confirmed source-level gaps

1. Five custom modal implementations rely on `dvh` without a preceding `vh`
   fallback. Chrome 80 does not support dynamic viewport units, so the height
   constraint can be discarded in the iMin WebView.
2. The shared `Dialog` primitive directly assigns `document.body.style.overflow`
   per instance. With nested dialogs, closing either instance may restore body
   scrolling while another dialog remains open.
3. Add Item fetches up to 10,000 dropdown items on open and recalculates the SKU
   suggestion whenever the item name changes. This is a measurable performance
   risk on lower-powered hardware, but no device timing currently proves user-
   visible delay.
4. The iMin performance marker already disables full-screen backdrop blur and
   long animations. These protections must be preserved through later phases.

### Acceptance scope amendment (2026-09-05)

The user removed physical iMin validation from this initiative. Device identity,
physical keyboard/rotation, frame timing, memory-cycle, and device image-load
measurements are no longer acceptance requirements. No physical APK pass is
claimed. Source inventory is complete; outstanding browser coverage remains
separate from device testing.

## Delivery phases after Phase 291

- Phase 292: implement Chrome-80-safe viewport constraints and reachable modal
  header/body/footer layouts.
- Phase 293: implement reference-counted modal scroll/focus ownership and nested
  modal cleanup.
- Phase 294: optimize the SKU seed and suggestion flow only against the Phase
  291 measurements.
- Phase 295: run component, browser, build, architecture, docs,
  compatibility, and compliance closure.

### Phase 292 implementation record (2026-09-05)

The shared Items modal panel now uses a Chrome-80-compatible `vh` fallback followed
by `dvh`, one internal scroll region, and a fixed safe-area-aware footer. Add/Edit
Item, Create/Edit Service, and Product Scanner use the bounded panel contract.
Focused viewport contracts and browser checks at desktop, mobile portrait, and
short landscape sizes passed. Physical APK validation was removed from acceptance on 2026-09-05.

### Phase 293 implementation record (2026-09-05)

The shared Dialog owns body scrolling through reference-counted locks and restores
the exact previously focused element when each dialog closes. Closing a nested
dialog cannot unlock the page while its parent remains open. The custom Product
Scanner participates in the same lock, traps forward and reverse Tab navigation,
restores focus to its opener, and releases its lock during every close/unmount
path. Focused jsdom coverage exercises nested close order, pre-existing body
overflow restoration, focus return, scanner cleanup, and keyboard wrapping.

### Phase 294 implementation record (2026-09-05)

The Add Item flow still loads the complete authorized dropdown seed so SKU
uniqueness coverage is not weakened. That seed is now indexed once when it
changes. Each item-name keystroke performs a constant-time maximum lookup instead
of scanning up to 10,000 rows again. A local Node benchmark using 10,000 rows and
1,000 suggestions measured 3,600.38 ms for repeated scans and 4.31 ms for indexed
lookups (approximately 835.8x faster for this computation). This benchmark is
local computation evidence only; physical-device performance validation was removed
from acceptance on 2026-09-05.

### Phase 295 validation record (2026-09-05)

Authenticated Chrome validation passed Add Item at 1440x900, 390x844, and
390x360 after correcting two observed custom-portal gaps: background scrolling
was initially unlocked and Escape initially did not close the modal. The final
run kept the dialog inside the viewport, exposed its final action, prevented
horizontal document overflow, held the body lock, closed from Escape, and emitted
no page error, console error, failed request, HTTP 5xx response, or error boundary.

Physical iMin validation was removed by the user on 2026-09-05. Phase 295 remains
`in_progress` only for browser closure not demonstrated by the recorded Add Item
checks: remaining modal surfaces, nested import/image flows, and applicable
compatibility/docs/compliance evidence. This independent browser work does not
block the catalog-search initiative, beginning at Phase 296.

## Catalog-search follow-up

See [POS Items Catalog Search Plan](POS_ITEMS_CATALOG_SEARCH_PLAN.md) for Phases
296-298 and their acceptance gates. No physical iMin validation is required.

## Authoritative references

- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/architecture/adr/0025-pos-application-shells-and-lan-host-runtime.md`
- `docs/architecture/adr/0043-standalone-native-hardware-pos-runtime.md`
- `docs/architecture/adr/0067-frontend-browser-support-baseline-and-es-compat-guardrail.md`
- `docs/architecture/adr/0071-frontend-split-into-three-apps.md`
