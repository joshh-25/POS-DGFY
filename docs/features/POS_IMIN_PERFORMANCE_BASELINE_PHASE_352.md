---
status: reference
authority_level: reference
owner: pos
last_reviewed: 2026-09-14
applies_to: pos_imin_performance
topic: pos_imin_performance_baseline
---

# Phase 352: iMin POS interaction performance baseline

Status: **in progress**. Approved on 2026-09-14. This is a measurement phase;
it does not change runtime behavior, APIs, schemas, hardware protocols, or
production data.

## Objective and boundary

Establish a repeatable physical-device baseline for perceived latency across
POS button feedback, modal opening, operations-tab changes, catalog search,
catalog navigation, image decode/scroll, and iMin printer/drawer commands.
The desktop browser is useful for source and network inspection, but it cannot
stand in for the target iMin WebView's frame, memory, or bridge timings.

Phase 352 is proceeding as an independent approved baseline while Phase 351
remains in progress. No Phase 353 optimization is included here.

## Current source and build inventory

| Signal | Current evidence | Meaning/limit |
| --- | --- | --- |
| Source snapshot | Git `HEAD` `9246ed6df`; working tree is already dirty | This is a working-tree baseline, not a release-commit claim. |
| POS build | `1.12.1`; fresh `vite build` produced matching `dist/version.json` and `dgfy-version` metadata | The artifact builds successfully. |
| iMin wrapper source version | `versionName 1.2`, `versionCode 3`; actual installed APK is unknown | Source configuration only until a device is connected. |
| WebView compatibility target | POS build targets Chrome 80 / Edge 88 / Firefox 78 / Safari 14; the iMin target is documented as Chrome 80-84 | Actual Android System WebView version is still required. |
| iMin performance profile | `apps/dgfy-pos/src/main.jsx` installs `dgfy-imin-performance` before React mounts when `iMinBridge.isIminWrapper()` is true | The profile is source-covered, but activation on hardware is unverified. |
| Modal/animation profile | iMin CSS disables backdrop blur and listed looping/overlay animations; `transition-all` is limited to transform/opacity for 100 ms | This addresses a known paint cost, not all filters or component work. |
| Explicit catalog schedules | Phase 352 baseline: catalog refresh after invalidation 150 ms; initial/deferred catalog load 250 ms; next-page image preload fallback 200 ms | These are code schedules, not measured end-to-end latency. Phase 358 changes only the iMin initial/clear and search-load schedule. |
| Explicit operations-tab schedule | Pane transition is 150 ms; content replacement is scheduled after 150 ms, then a 16 ms enter step | This is a confirmed user-visible delay candidate for Phase 353. |
| Workspace prefetch | Lazy workspace prefetch has a 300 ms fallback timer | Background preparation, not a direct click-to-visible measurement. |
| Catalog image policy | Phase 352 baseline: POS cards request 144x144 images; first four/mobile are eager/high priority and later cards are lazy | Physical decode/paint measurement remains unavailable; Phase 358 now routes persisted variant-backed `PosItemImage` cards through responsive `srcSet`/`<picture>` sources. |
| Blurry-card candidate | Out-of-stock, blocked, and options-loading cards retain `blur-[0.5px]` | This is a normal CSS filter and is not removed by the current backdrop-blur override. |
| Largest POS chunks | Fresh build: `TerminalOperationsWorkspace` 1,309.03 kB minified / 318.40 kB gzip; `vendor-maplibre` 1,066.59 kB / 288.93 kB gzip | Code-load risk, especially when the lazy workspace is first opened; size alone does not prove every-button latency. |
| Native bridge | Async iMin paths exist; legacy synchronous fallback paths remain | Bridge invocation and completion must be measured separately on hardware. |

Source references: [iMin performance profile](../../packages/web-core/src/utils/iminRuntimeFeedback.js),
[iMin CSS profile](../../packages/web-core/src/index.css#L832-L860),
[catalog workflow](../../packages/web-core/src/features/pos/hooks/usePosCatalogWorkflow.js#L350-L359),
[operations workspace](../../packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx#L968-L1003),
[POS item cards](../../packages/web-core/src/features/pos/components/POSCheckoutTerminalView.jsx#L865-L895),
[Android wrapper configuration](../../apps/dgfy-android-bridge/imin-wrapper/app/build.gradle.kts#L66-L71).

## Evidence collected on 2026-09-14

- `npm.cmd run build` from `apps/dgfy-pos`: **passed** in 34.84 seconds.
- Focused shared POS contracts from `apps/dgfy-ims`: **2 files, 13 tests passed** (`iminPerformanceProfile.contract.test.js` and `posCatalogPerformance.contract.test.js`).
- `adb devices -l`: **no attached devices**. No physical model, RAM, Android System WebView version, installed APK/build, frame timing, memory sample, network trace, or native bridge timing is claimed.
- The source workspace contains pre-existing unrelated modifications and untracked files. This report does not reclassify or clean them.

## Physical measurement matrix

Each interaction needs cold and warm runs, at least 30 repetitions per state,
with p50/p95/max and a trace that separates request time from React/render/paint
time. Proposed triage bands below are investigation aids, not accepted product
SLOs.

| Interaction | Required marks | Status |
| --- | --- | --- |
| Ordinary button | pointer/key event → first visible pressed/disabled/loading state → stable frame | Blocked on device |
| Modal | click → overlay visible → dialog content visible → stable frame; record backdrop/filter cost | Blocked on device |
| Operations tab | click → `renderedTab` replacement → first stable pane frame | Blocked on device; source has 150 ms + 16 ms schedule |
| Search | input event → deferred value → request start → response → first visible result | Blocked on device; Phase 352 baseline was 250 ms, while Phase 358 uses 0 ms for iMin initial/clear reads and 150 ms for non-empty deferred searches; browsers remain 250 ms |
| Catalog navigation | page/folder click → request start/response → first card paint → image decode/paint | Blocked on device |
| Image scroll | card enter viewport → request/decode/paint; dropped frames during scroll | Blocked on device |
| iMin bridge | JS call → native accepted → native completed/error; printer and drawer separately | Blocked on device |

For triage only, treat p95 first feedback over 100 ms or warm modal/tab content
over 200 ms as a candidate for code investigation. Do not change a timer or
visual effect until the trace shows whether the delay is queued work, network,
render/paint, image decode, or native bridge work.

## Device collection procedure

1. Connect the target iMin and run `adb devices -l`; record model, Android/API,
   WebView package/version, APK flavor/version, and the loaded POS build from
   `meta[name="dgfy-version"]`.
2. Use a debuggable staging/dev wrapper or an approved inspection path, then
   capture the POS Performance trace through WebView inspection. Record whether
   the document root contains `dgfy-imin-performance`.
3. Run the matrix in cold-start and warm-cache states. Keep DevTools network
   timing, main-thread frames, long tasks, image decode, and React commit/render
   evidence in separate columns.
4. Exercise printer and drawer commands only in a controlled test session;
   record async and fallback path selection without changing production data.

## Exit gate

Phase 352 remains **in progress** until a physical iMin is connected and the
matrix has repeatable trace evidence. Phase 353 and Phase 358 source remediation
were explicitly approved while that device gate was pending; these changes do
not close Phase 352 or allow physical latency claims. The current source
remediation scope includes the 150 ms tab swap, card/locked-surface blur cost,
iMin catalog search scheduling, and responsive catalog image sources.
