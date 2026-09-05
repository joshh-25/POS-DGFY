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

Status: `in_progress`.

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

### Device baseline protocol

Run on the actual affected APK and record the exact package name, version code,
version name, Android build, WebView package/version, resolution, density,
orientation, and whether the wrapper origin is production, staging, dev, or a
local override. For each inventory row above:

1. Open the modal with short and long content.
2. Open the software keyboard on the first, middle, and final editable field.
3. Scroll to every field and footer action; record clipping and horizontal
   overflow.
4. Rotate when the device supports rotation and repeat the final-field check.
5. Open and close any nested scanner or confirmation dialog and verify that the
   underlying page does not scroll.
6. Capture modal-open latency, typing latency, dropped-frame evidence, and
   memory before and after 20 open/close cycles with a representative catalog.
7. Capture screenshots or screen recordings plus WebView console/network errors.

### Phase 291 acceptance

- Complete: runtime ownership and source modal inventory.
- Complete: static identification of viewport, nested-scroll, and catalog-load
  risks with exact source locations.
- Pending: named-device APK and WebView identity.
- Pending: keyboard-open portrait/landscape evidence for every modal.
- Pending: p95 open/typing latency, frame, and memory baseline.

Phase 291 must remain `in_progress` until the three pending device evidence
groups are recorded. Source inspection or browser emulation cannot substitute
for this gate.

## Delivery phases after Phase 291

- Phase 292: implement Chrome-80-safe viewport constraints and reachable modal
  header/body/footer layouts.
- Phase 293: implement reference-counted modal scroll/focus ownership and nested
  modal cleanup.
- Phase 294: optimize the SKU seed and suggestion flow only against the Phase
  291 measurements.
- Phase 295: run component, browser, physical APK, build, architecture, docs,
  compatibility, and compliance closure.

### Phase 292 implementation record (2026-09-05)

The shared Items modal panel now uses a Chrome-80-compatible `vh` fallback followed
by `dvh`, one internal scroll region, and a fixed safe-area-aware footer. Add/Edit
Item, Create/Edit Service, and Product Scanner use the bounded panel contract.
Focused viewport contracts and browser checks at desktop, mobile portrait, and
short landscape sizes passed. Physical APK keyboard and rotation proof remains in
Phase 295.

### Phase 293 implementation record (2026-09-05)

The shared Dialog owns body scrolling through reference-counted locks and restores
the exact previously focused element when each dialog closes. Closing a nested
dialog cannot unlock the page while its parent remains open. The custom Product
Scanner participates in the same lock, traps forward and reverse Tab navigation,
restores focus to its opener, and releases its lock during every close/unmount
path. Focused jsdom coverage exercises nested close order, pre-existing body
overflow restoration, focus return, scanner cleanup, and keyboard wrapping.

## Authoritative references

- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/architecture/adr/0025-pos-application-shells-and-lan-host-runtime.md`
- `docs/architecture/adr/0043-standalone-native-hardware-pos-runtime.md`
- `docs/architecture/adr/0067-frontend-browser-support-baseline-and-es-compat-guardrail.md`
- `docs/architecture/adr/0071-frontend-split-into-three-apps.md`
