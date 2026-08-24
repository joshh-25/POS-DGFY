---
status: reference
authority_level: reference
owner: pos-platform
last_reviewed: 2026-08-20
applies_to: standalone_pos_pwa
topic: standalone_pos_pwa_phase_plan
---

# Standalone DGFY POS PWA Phases

## Purpose

This document is the detailed planning companion for hardening the standalone
DGFY POS Progressive Web App. It starts the PWA initiative from its own
foundation while preserving the repository's continuous numeric phase ledger.

The [Implementation Phase Ledger](IMPLEMENTATION_PHASE_LEDGER.md) remains the
authority for repository phase numbers, statuses, dependencies, and completion
evidence. This document owns the PWA-specific scope, sequencing, risks, and
acceptance detail. The labels `PWA Stage 1` through `PWA Stage 5` are
initiative-local labels and are not a replacement phase sequence.

## Planning metadata

- Packet: release-packet with web/fullstack delivery slices
- Initiative: standalone DGFY POS PWA hardening
- Production surface: `https://pos.dgfy.ph`
- Source surface: `apps/dgfy-pos/`
- Dedicated build: `npm run build:pos`
- Generated output: `dist-apps/pos/`
- Current ledger baseline: Phase 138 is the highest recorded phase at the time
  of this plan; the PWA initiative is mapped to Phases 139–143.
- Readiness: mixed; source ownership is known, but installed-browser, hardware,
  staging, and canary evidence require explicit access and fixtures.

## Authority and governance

Apply documents according to repository authority and lifecycle metadata:

- `docs/START_HERE.md` defines documentation lookup order and authority rules.
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md` and
  `docs/architecture/ARCHITECTURE_GOVERNANCE.md` define architecture process.
- Relevant accepted or amended ADRs govern POS offline, terminal, hardware,
  browser, and application-shell behavior.
- This document does not supersede an ADR, the phase ledger, or the release
  policy.
- A phase may be marked `completed` only after its acceptance gates and required
  validation evidence pass.

Primary governing references:

- [POS offline replay and cache contracts](../architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md)
- [POS application shells and LAN host runtime](../architecture/adr/0025-pos-application-shells-and-lan-host-runtime.md)
- [POS terminal pairing and shift-safe navigation](../architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md)
- [Pluggable POS hardware drivers](../architecture/adr/0053-pluggable-pos-hardware-device-drivers.md)
- [POS hardware UI parity](POS_HARDWARE_UI_PARITY_CONTRACT.md)
- [POS cashier terminal flow](POS_CASHIER_TERMINAL_FLOW.md)
- [POS checkout terminal refactor](POS_CHECKOUT_TERMINAL_REFACTOR.md)
- [DGFY brand standards](../guides/DGFY_BRAND_STANDARDS_AND_DESIGN_SYSTEM.md)
- [POS readiness status](../testing/pos-readiness-status.md)
- [Manual POS/IMS/Store QA runbook](../testing/manual-qa-readiness-runbook-pos-ims-store.md)
- [Release Candidate Policy](../ops/RELEASE_CANDIDATE_POLICY.md)
- [PR conventions](../ai/PR.md)

## Scope

### Included

- POS-owned manifest identity and installation metadata.
- POS-owned PWA icon assets and generated asset verification.
- POS Service Worker installation, waiting, activation, and static-cache
  boundaries.
- Transaction-safe update signaling and activation.
- Existing POS offline shell, offline cash checkout, pending-sync, manual replay,
  and idempotency regression verification.
- Chrome and Edge installed-PWA verification on Windows.
- Existing-install upgrade verification.
- Dedicated POS canary evidence and release handoff.
- Required PWA documentation, tests, compliance declarations, and ledger links.

### Excluded

- SKUpervisor/admin PWA behavior unless a shared abstraction requires a
  compatible, separately reviewed change.
- Storefront.
- Electron or native POS runtime migration.
- New checkout, payment, inventory, authentication, terminal, shift, or
  hardware business logic.
- A second offline queue, transaction database, or synchronization system.
- Production deployment or main-branch merge by the implementation task.

## Existing ownership baseline

The following ownership must be verified at PWA Stage 1 and preserved:

| Responsibility | Existing owner | Required boundary |
| --- | --- | --- |
| POS entry HTML and manifest link | `apps/dgfy-pos/index.html` | POS build only |
| POS manifest source | `apps/dgfy-pos/manifest.webmanifest` | One POS source of truth |
| POS Service Worker | `apps/dgfy-pos/public/sw.js` | Shell/static delivery only |
| POS Service Worker registration | `apps/dgfy-pos/src/main.jsx` | Registration/update coordination |
| Offline precache generation | `apps/dgfy-pos/vitePosOfflinePrecachePlugin.js` | Generated build output |
| POS build configuration | `apps/dgfy-pos/vite.config.js` | Dedicated `build:pos` output |
| Offline persistence and replay | Existing POS hooks/services/utils | Application layer; never Service Worker business logic |
| Checkout and idempotency | Existing POS checkout workflow and API contracts | Existing request and duplicate semantics |
| Terminal and shift safety | Existing POS terminal flow and backend contracts | Logical terminal, location, permission, and shift guards |
| Hardware | Existing POS hardware registry/drivers | No new direct device path |

Current facts to re-verify rather than assume:

- The manifest source currently identifies itself as `SKUpervisor POS`.
- The manifest references `/logo-icon.png` and `/logo.png`; those paths must be
  checked against actual POS build assets.
- The POS Service Worker uses eager `skipWaiting()` behavior.
- The POS bootstrap activates a waiting worker immediately when one exists.
- The POS Service Worker excludes `/api/` and `/uploads/` and precaches the
  generated POS shell/assets.
- Physical-device pairing is optional compatibility state under ADR 0031 and
  must not become a new checkout prerequisite.

## PWA stage map

| PWA stage | Repository phase | Outcome | Status |
| --- | ---: | --- | --- |
| PWA Stage 1 — Baseline and governance | Phase 139 | Ownership, current output, risks, ADR impact, and access blockers are known. | `completed` |
| PWA Stage 2 — Identity and asset integrity | Phase 140 | The installed application identifies as DGFY POS and all icon paths are valid. | `completed` |
| PWA Stage 3 — Transaction-safe updates | Phase 141 | New builds wait safely and cannot interrupt transaction-critical POS state. | `completed` |
| PWA Stage 4 — Offline/install/upgrade verification | Phase 142 | Existing offline semantics and installed-browser behavior are certified. | `in_progress` |
| PWA Stage 5 — Canary and release evidence | Phase 143 | A controlled POS canary produces release-ready evidence and rollback notes. | `planned` |

## PWA Stage 1 — Baseline and governance

### Mapped repository phase

Phase 139 — Standalone POS PWA baseline and governance.

### Objective

Create a read-only baseline before implementation and confirm the smallest
architecture-compatible change set.

### Owner and dependencies

- Owner role: Worker/Implementer for source discovery; Reviewer for governance
  classification.
- Dependencies: current POS source, build environment, authoritative docs, and
  the current Phase 138 ledger state.
- No dependency on completion of Phase 138 unless shared POS runtime files are
  changed by that work before implementation begins.

### Required discovery

- Confirm the authoritative manifest source and generated manifest path.
- Confirm whether a second POS manifest exists; do not create one merely because
  an old path is named in a proposal.
- Inspect the current effective Chromium installed-app identity.
- Run `npm run build:pos` and inspect `dist-apps/pos/`.
- Run existing focused POS PWA, Service Worker, offline, replay, idempotency,
  terminal, and shift tests.
- Identify the exact state owner for update safety.
- Confirm staging URL, Windows Chrome/Edge access, an old installed-PWA fixture,
  disposable POS fixtures, barcode hardware, and printer/drawer access.
- Classify the work as `no-architecture-impact`, `within-existing-boundary`, or
  `cross-boundary`.
- Determine whether the update lifecycle requires an amendment to ADR 0014.

### Acceptance criteria

- [x] A baseline report records all responsibility owners.
- [x] Current build and test results are recorded without changing source code.
- [x] Current manifest, icons, Service Worker, and generated output are recorded.
- [x] Current update behavior and app identity are recorded.
- [x] Blockers use explicit categories such as `missing-design`,
       `environment-access`, or `approval-needed`.
- [x] ADR impact and documentation closure requirements are known.

### Risks and blockers

- Existing worktree changes may affect the shared POS runtime or phase ledger.
- Chrome/Edge application identity may change if `id`, `start_url`, or `scope`
  is altered without migration analysis.
- Physical hardware and old-installation upgrade evidence may not be available.

### Phase 139 baseline report — 2026-08-20

Scope was limited to the standalone POS PWA. No application source was edited.
The production build regenerated the ignored `dist-apps/pos/` output as required
for artifact inspection; no generated file was hand-edited.

#### Responsibility owners

| Responsibility | Current owner | Evidence |
| --- | --- | --- |
| Installed-app name, `short_name`, `id`, `start_url`, `scope`, and icons | POS manifest source | `apps/dgfy-pos/manifest.webmanifest` |
| HTML manifest/theme/favicon links | POS entry document | `apps/dgfy-pos/index.html` |
| Service Worker registration and waiting-worker message | POS bootstrap | `apps/dgfy-pos/src/main.jsx` |
| Shell/runtime cache boundaries and update activation | POS Service Worker | `apps/dgfy-pos/public/sw.js` |
| Build revision and precache manifest generation | POS Vite build plugin | `apps/dgfy-pos/vitePosOfflinePrecachePlugin.js` |
| Offline snapshot, scoped queue, replay, and idempotency behavior | POS offline/checkout services and hooks | `packages/web-core/src/features/pos/services/`, `packages/web-core/src/features/pos/hooks/` |
| Server authority for checkout, stock, payment, receipt finalization, and replay conflicts | POS API/backend | Existing POS checkout and offline contracts governed by ADR 0014 |

#### Build, test, and browser evidence

- `npm run build:pos`: **PASS** — Vite 6.4.3, 4,069 modules transformed,
  64 precache assets, 91 generated files, and build revision
  `v7315deb004498caa`.
- Focused Service Worker/offline/terminal/shift tests: **PASS** — 4 files,
  33 tests.
- Focused replay/idempotency/offline-scope/terminal-pairing tests: **PASS** —
  4 files, 17 tests. Combined focused result: 8 files, 50 tests passed.
- Local production preview at `http://localhost:5176/` rendered title
  `DGFY POS`, the locked `Terminal Login Required` shell, and no captured
  browser error or warning logs. Port 5176 was used because local ports 5174
  and 5175 were already occupied.
- The generated HTML links
  `./assets/manifest-C0-7ZoNt.webmanifest`. The generated manifest has version
  `1` and 64 precache asset entries.

#### Current identity and cache findings

- The source and generated manifest still use `name: SKUpervisor POS` and
  `short_name: SKU POS`; the HTML document title is already `DGFY POS`.
- The manifest has no explicit `id`, uses `/` for both `start_url` and `scope`,
  and declares `/logo-icon.png` and `/logo.png`.
- Neither declared PNG exists in `apps/dgfy-pos/public/`. A local
  preview request returned `200 text/html` for both paths through SPA fallback,
  not an image. The available POS PNGs are rectangular (`810x298` and
  `1000x368`), so they are not a verified replacement for square PWA icons.
- The HTML theme color is `#1A4E8D`; the manifest theme color is `#0f766e`.
  This is an identity/design consistency issue for Stage 2, not a runtime
  checkout failure.
- The Service Worker uses versioned `sku-pos-shell-*` and `sku-pos-runtime-*`
  caches, bypasses `/api/` and `/uploads/`, precaches the generated manifest and
  critical build assets, bounds runtime entries at 120, and injects the current
  build revision during production build.
- The current worker calls `skipWaiting()` during install and also accepts the
  `SKIP_WAITING` message sent when the POS bootstrap sees a waiting worker. It
  calls `clients.claim()` on activation. This is the exact update behavior that
  Stage 3 must make transaction-safe; no update-policy change was made here.

#### Architecture and ADR classification

- Manifest identity, icon availability, generated manifest wiring, and build
  artifact verification are `within-existing-boundary` POS frontend/PWA work.
- A transaction-safe update lifecycle is `cross-boundary` governance work if it
  changes the existing offline/update default. ADR 0014 already binds the POS
  Service Worker to read-only delivery caches and forbids automatic replay; any
  lifecycle change that alters that contract must be documented as an ADR 0014
  amendment before implementation. Phase 139 made no ADR change.
- Physical device pairing remains optional compatibility state and must not be
  introduced as a prerequisite for authorized shift opening or checkout under
  ADR 0031.

#### Blockers and required access

| Category | Baseline finding | Needed before the relevant phase |
| --- | --- | --- |
| `missing-design` | Approved square DGFY POS icon artwork is not present in the POS public asset set. | Phase 140 |
| `approval-needed` | The target installed-app identity and the safe update notification/activation policy need product/architecture sign-off. | Phases 140–141 |
| `environment-access` | A confirmed staging POS URL, Windows Chrome/Edge installed-app profiles, and an old installed-PWA upgrade fixture were not available in this read-only local run. | Phases 142–143 |
| `fixture-needed` | Disposable tenant, cashier, logical terminal, location, open-shift, catalog, and controlled offline checkout fixtures must be supplied for certification. | Phases 142–143 |
| `hardware-access` | Barcode scanner, receipt printer, and cash-drawer evidence were not exercised by this local shell check. | Phase 142 |
| `readiness-inherited` | Canonical POS readiness still lists human UAT, sustained browser E2E history, source-separation evidence, and location-binding rollout evidence as pending. | Phase 142 and release gate |

#### Closure and next eligible phase

Phase 139 is complete as a baseline/governance phase. The next eligible phase
is Phase 140, which must repair installed identity and icon integrity while
preserving the existing POS route, scope, and offline ownership boundaries.

## PWA Stage 2 — Identity and asset integrity

### Mapped repository phase

Phase 140 — Standalone POS PWA identity, icons, and build isolation.

### Objective

Make the installed application clearly and exclusively identify itself as DGFY
POS while preserving existing routing and installed-app identity.

### Owner and dependencies

- Owner role: Worker/Implementer with Product Design/Brand review for artwork.
- Dependencies: Phase 139 baseline, approved DGFY artwork, and confirmed
  `pos.dgfy.ph` root routing.

### Required delivery

- Update only the authoritative POS manifest source.
- Set the installed identity to `DGFY POS` and `DGFY POS`.
- Verify `id`, `start_url`, `scope`, colors, and description against actual
  deployment behavior and DGFY brand standards.
- Preserve the existing effective Chromium app identity where possible.
- Create or adapt square 192x192, 512x512, and maskable 512x512 assets from
  approved DGFY artwork.
- Ensure every manifest icon path exists in the generated build.
- Ensure icons have safe padding and suitable contrast for Windows/Chromium.
- Keep legitimate shared SKUpervisor references outside installation metadata.

### Acceptance criteria

- [x] Source and generated manifest identify the installed app as DGFY POS.
- [x] No generated manifest icon path returns 404.
- [x] Required icon sizes and maskable purpose are present.
- [x] `id`, `start_url`, and `scope` do not unintentionally create a second app.
- [x] `npm run build:pos` reproduces the result without manual output edits.
- [x] Generated POS output has no accidental dependency on admin PWA metadata.

### Risks and blockers

- Icon creation is blocked until approved artwork is available if existing files
  are unsuitable.
- Browser-installed metadata may require a documented reinstall for old clients.
- Do not globally remove `SKUpervisor` strings used by valid cross-app handoff.

### Phase 140 completion report — 2026-08-20

- The authoritative manifest now declares `id: "/"`, `name: "DGFY POS"`,
  `short_name: "DGFY POS"`, root `start_url`/`scope`, and the DGFY Ocean Blue
  theme color `#1A4E8D`. No second POS manifest was created.
- Three deterministic PNG assets were derived from the existing DGFY logo mark:
  `pos-icon-192.png` (192x192), `pos-icon-512.png` (512x512), and
  `pos-icon-maskable-512.png` (512x512, `purpose: maskable`). The maskable
  asset uses a white background and safe padding around the mark.
- The generated manifest is
  `dist-apps/pos/assets/manifest-DhzID-vq.webmanifest`; all three icon paths
  exist in `dist-apps/pos/` and serve as `image/png` from the local production
  preview. The generated manifest contains no `SKUpervisor` installation
  metadata.
- `npm run build:pos`: **PASS**. Manifest identity contract and Service Worker
  contract tests: **PASS** — 2 files, 9 tests.
- Browser verification at the local production preview rendered `DGFY POS`,
  linked the generated manifest, used theme color `#1A4E8D`, and captured no
  error or warning logs.
- No existing-installed migration was performed. Because `id`, `start_url`,
  and `scope` remain `/`, the effective root app identity is preserved; old
  installations should still be verified during Phase 142.

Phase 140 is complete. The next eligible phase is Phase 141, which must address
transaction-safe update activation without changing the manifest or offline
checkout authority established here.

## PWA Stage 3 — Transaction-safe updates

### Mapped repository phase

Phase 141 — Standalone POS PWA transaction-safe Service Worker updates.

### Objective

Allow new static assets to download without activating or reloading the POS
during a transaction-critical state.

### Owner and dependencies

- Owner role: Worker/Implementer; Reviewer validates architecture and ADR impact.
- Dependencies: Phase 139 state-ownership baseline and Phase 140 generated
  manifest/assets.

### Required delivery

- Review the current install-time `skipWaiting()` and waiting-worker message path.
- Keep new workers waiting until the application is safe to update.
- Derive safe/unsafe state from existing POS state owners; do not create a
  parallel transaction-state system.
- Treat active cart, payment, checkout commit, offline durable write, replay,
  split payment, and critical print/drawer workflows as unsafe where reload could
  create ambiguity or data loss.
- Permit update application from locked/login, idle, empty-cart, or stable
  post-transaction states as supported by the existing flow.
- Use the smallest update notification and one controlled `controllerchange`
  reload if no existing update UI applies.
- Never put POS business logic or replay logic in the Service Worker.
- Never clear cart drafts, terminal state, or pending transactions during update.

### Acceptance criteria

- [x] A new worker can install and wait while the current POS remains active.
- [x] An active transaction cannot be forcibly reloaded by the update path.
- [x] Payment, local commit, replay, and critical hardware workflows are not
      interrupted.
- [x] An idle POS can activate the waiting worker and reload once.
- [x] Existing checkout and offline state restoration remains authoritative.
- [x] ADR 0014 was reviewed; no default clause changed in this phase, so no
      amendment was required.
- [x] Update behavior is covered by contract-level tests.

### Risks and blockers

- `main.jsx` may not currently have direct access to all transaction-critical
  state, requiring a narrow reviewed coordination seam.
- Activation timing can expose mixed old/new assets if cache/version behavior is
  changed without an exact build and reload test.

### Phase 141 completion report — 2026-08-20

- `apps/dgfy-pos/public/sw.js` no longer calls `skipWaiting()` during
  install. The explicit `SKIP_WAITING` message remains the only activation
  request, and the worker continues to cache only the existing POS shell/runtime
  assets without business or replay logic.
- `apps/dgfy-pos/src/main.jsx` now observes `updatefound`, keeps the
  new worker waiting, shows a small update notification with an `Update now`
  action, checks the derived POS safety state at activation time, and reloads
  once through a controlled `controllerchange` listener.
- `POSCheckoutTerminal` publishes a derived safety snapshot from its existing
  cart, checkout, split-payment, replay, receipt, drawer, parked-sale, and
  discount state owners. No second transaction state machine was introduced;
  the coordination module only carries the latest derived safety result.
- The safety gate blocks activation for active carts, checkout commit/payment,
  split payment, offline replay, receipt/print, drawer, parked-sale, and active
  checkout-editing workflows. Empty/idle or locked/login states remain eligible
  when the operator chooses the update.
- Focused update-safety and Service Worker contracts: **PASS** — 2 files,
  11 tests. Existing checkout, receipt hardware, split payment, terminal
  pairing, and terminal view regressions: **PASS** — 6 files, 93 tests.
- `npm run build:pos`: **PASS** — Vite 6.4.3, 4,070 modules transformed. The
  generated `dist-apps/pos/sw.js` retains the waiting install lifecycle and the
  explicit message activation path.
- Targeted ESLint completed with zero errors. The existing
  `POSCheckoutTerminal.jsx` max-lines warning remains; it predates this phase's
  changes and is unrelated to the update lifecycle.
- ADR 0014 was reviewed. Its atomic shell installation, read-only cache, no
  `/api/` or `/uploads/` caching, and operator-controlled replay clauses remain
  unchanged, so this implementation stays within the existing POS PWA boundary
  without an ADR amendment.

Phase 141 is complete. The next eligible phase is Phase 142, which must verify
the waiting-worker lifecycle and existing offline semantics in installed Chrome
and Edge environments.

## PWA Stage 4 — Offline, installation, and upgrade verification

### Mapped repository phase

Phase 142 — Standalone POS PWA offline and installed-browser certification.

### Objective

Prove that PWA hardening preserves the existing offline and POS contracts in the
actual installed Windows browser experience.

### Owner and dependencies

- Owner role: Verifier/QA.
- Dependencies: Phases 140–141 implementation and passing local checks.
- Required environment: Windows Chrome, Windows Edge, disposable POS fixtures,
  and supported hardware or approved driver simulators.

### Verification matrix

- Clean Chrome install and standalone launch.
- Clean Edge install and standalone launch.
- Existing old-PWA upgrade.
- Manifest, icon, scope, and Service Worker DevTools inspection.
- Offline shell launch after a successful authenticated load.
- Offline cash sale, pending sync, close/reopen, restart, and manual replay.
- Lost-response retry with unchanged idempotency key.
- Repeated manual sync attempts and replay recovery.
- Login, company selection, logical terminal, location, and shift recovery.
- Optional physical-pairing compatibility behavior.
- Barcode, receipt, drawer, printer failure, and reprint behavior.
- Update available during active sale and while idle.

### Acceptance criteria

- [ ] Chrome clean-install evidence passes.
- [ ] Edge clean-install evidence passes.
- [ ] Existing-install upgrade does not lose pending transactions or create an
      unintended second application.
- [ ] Offline cash checkout and manual replay remain unchanged.
- [ ] One logical sale produces one server-side sale after retry/replay.
- [x] No stale API/upload data is served by the Service Worker.
- [ ] Hardware behavior remains inside existing driver contracts.
- [x] Desktop and mobile/compact POS rendered checks pass where practical.

### Risks and blockers

- Hardware-backed proof may be unavailable in a local environment.
- Browser icon/name refresh behavior may require a documented uninstall/reinstall
  procedure for existing terminals.
- Canonical POS readiness blockers outside PWA scope remain separate.

### Phase 142 verification record (2026-08-20)

Status: `in_progress`. Local certification gates passed, but the phase is not
complete because installed-PWA, authenticated offline, upgrade, staging-fixture,
and hardware evidence is still unavailable in this workspace.

Local evidence:

- **PASS** — 30 focused POS/PWA contract and regression files, 218 tests:
  Service Worker caching/update lifecycle, manifest identity, update safety,
  offline persistence/scope, checkout queue replay, terminal identity/pairing,
  shift ownership, barcode, receipt identity/renderer, printer availability,
  cash drawer/message bus, and iMin driver contracts.
- **PASS** — `npm run build:pos`; generated output contains the DGFY POS
  manifest, all three icon files, a waiting Service Worker install lifecycle,
  explicit `SKIP_WAITING` activation, and `/api/` plus `/uploads/` bypasses.
- **PASS** — production-preview Playwright checks in installed Chrome channel:
  `tests/e2e/pos/pwa.spec.js`, three compact/mobile POS viewport checks, and
  authenticated `tests/e2e/pos/smoke.spec.js`; 5 tests passed with no runtime
  crash evidence.
- **PASS** — generated precache contains only static build assets and no
  `/api/` or `/uploads/` entries. Service Worker source contains no automatic
  replay or business-transaction submission path.
- **PASS** — stale Playwright manifest assertions were corrected to accept the
  production-hashed manifest filename; no application behavior was changed.

Acceptance gates still requiring external evidence:

- **BLOCKED** — clean standalone installation and launch in a real Chrome PWA
  profile and a real Edge PWA profile.
- **BLOCKED** — upgrade of an existing old PWA installation while a pending
  transaction exists.
- **BLOCKED** — authenticated offline cash sale, restart/reopen, manual replay,
  lost-response retry, and server-side one-sale idempotency on disposable POS
  fixtures.
- **BLOCKED** — physical barcode scanner, receipt printer, cash drawer, and
  printer-failure/reprint behavior, or an approved hardware-driver simulator.

Architecture and documentation closure:

- Classification: `no-architecture-impact`; this verification pass changes only
  PWA-specific Playwright expectations and governed evidence records.
- ADR impact: none. ADR 0014, ADR 0031, ADR 0043, and ADR 0053 contracts remain
  unchanged; no new cache, pairing, native-runtime, or hardware boundary was
  introduced.
- Rollback: revert the two PWA manifest-selector test changes and the evidence
  records; no runtime rollback is required from this phase.

Current phase: **Phase 142 remains in progress**. Phase 143 is not eligible
until the installed-browser, fixture, authenticated offline, upgrade, and
hardware gates above are captured and accepted.

### Installed PWA blocker resolution packet

This packet is the exact intake required to close the remaining Phase 142
blockers. It must be completed with a disposable test tenant and must never
contain production passwords, session cookies, company tokens, or payment data.

#### Local setup execution record (2026-08-20)

- The local POS-DGFY stack is healthy on POS `5174`, backend `5000`, device
  bridge `5101`, SKUpervisor `5173`, Storefront `5175`, and MySQL `3306`.
- A local production preview is running from `http://localhost:5176/`; the
  generated build was rebuilt with `VITE_POS_DEV_PORT=5176` so company selection
  remains on the same local PWA origin. This is generated local output only.
- Isolated Chrome and Edge profile directories were created under
  `.tmp/pwa-phase-142-20260820-201634/`. Both launch `DGFY POS` in standalone
  display mode with a controlling Service Worker, and both completed local login
  plus `Masu Cafe` company selection with HTTP 200 responses and no unexpected
  runtime errors.
- The existing local `Masu Cafe` fixture is usable for rehearsal: it has 160
  POS-visible catalog items, active locations, active users, and existing POS
  barcode rows. No new tenant or catalog data was created.
- The fixture currently has no open shift. Opening a zero-cash local test shift
  is the next setup action; it is intentionally not performed automatically
  because it creates a local financial shift record.
- The browser-control connector for true Chrome/Edge manifest-install UI was
  unavailable in this session. The app-mode windows are a valid local
  standalone rehearsal, but they are not claimed as final browser install
  evidence until the browser's own Install App action is captured.

#### Local availability already verified

| Requirement | Current value | Status | Remaining action |
| --- | --- | --- | --- |
| Chrome executable | `151.0.7922.138` | `ready` | Create an isolated clean PWA profile and capture install evidence. |
| Edge executable | `151.0.4129.93` | `ready` | Create an isolated clean PWA profile and capture install evidence. |
| Local production preview | `http://localhost:5176/` | `ready` | Use only for local rehearsal; release evidence must use the approved HTTPS staging URL. |
| POS build and shell checks | `build:pos` and local Chrome smoke passed | `ready` | Preserve the exact tested SHA in the evidence record. |
| Installed Chrome PWA profile | Isolated app-mode profile created; browser Install App evidence not captured | `partial` | Capture the browser's own manifest-install confirmation when browser control is available. |
| Installed Edge PWA profile | Isolated app-mode profile created; browser Install App evidence not captured | `partial` | Capture the browser's own manifest-install confirmation when browser control is available. |
| Old installed-PWA fixture | Not supplied | `blocked` | Keep an older build installed with one intentionally queued disposable sale. |
| Disposable authenticated POS fixture | Existing local `Masu Cafe` rehearsal fixture; no open shift | `partial` | Open a zero-cash local test shift and record its ID before offline checkout testing. |
| Barcode/printer/drawer hardware or simulator | Not connected | `blocked` | Supply target devices or an approved driver simulator. |

#### Required intake values

| Field | Required value | Owner | Status |
| --- | --- | --- | --- |
| Tested commit SHA | Exact build SHA used for the run | Worker/Verifier | `TBD` |
| Approved test origin | HTTPS staging URL, or local preview for rehearsal only | Promoter/Release | `TBD` |
| Chrome profile | New isolated profile name/path; no production account | Verifier/QA | `TBD` |
| Edge profile | New isolated profile name/path; no production account | Verifier/QA | `TBD` |
| Old PWA build | Version/SHA installed before the candidate build | Worker/Release | `TBD` |
| Test tenant | Disposable company/tenant identifier | PM/Verifier | `TBD` |
| Test cashier | Disposable cashier account with POS permissions | Verifier/Operations | `TBD` |
| Terminal | Logical terminal ID and pairing policy | Operations | `TBD` |
| Location and shift | Disposable location ID and open shift ID | Operations | `TBD` |
| Catalog fixture | One positive-price, in-stock, POS-visible item with barcode | Operations | `TBD` |
| Hardware fixture | Scanner, receipt printer, drawer, or approved simulator identifiers | Hardware owner | `TBD` |
| Evidence owner | Person responsible for screenshots, traces, and server-side sale count | Verifier/QA | `TBD` |

#### Chrome and Edge clean-install evidence

For each browser, use a new isolated profile and the approved test origin.
Record the browser version, installed app name, manifest `id`, `start_url`,
`scope`, icon paths, Service Worker registration, and standalone launch result.
Capture:

1. Browser install prompt or installed-app confirmation.
2. Application/Manifest panel showing `DGFY POS`, the DGFY icon, `/` scope, and
   the expected Service Worker.
3. Standalone window showing the POS shell without the normal browser tab bar.
4. POS login/terminal-lock screen with no runtime crash or blank shell.

Pass condition: both browsers launch the same DGFY POS application identity from
the approved origin and do not create an unintended second app identity.

#### Existing-install upgrade evidence

1. Install the old PWA build in an isolated profile.
2. Authenticate with the disposable cashier and load the catalog online.
3. Create one disposable cash sale while offline so it is visibly queued; record
   the queue row and idempotency key without exposing credentials.
4. Close and reopen the old installed app; prove the queued sale remains once.
5. Deploy/open the candidate build in the same installed-app identity.
6. Confirm the waiting-worker/update notice does not activate during the active
   sale or replay-critical state.
7. Allow the update while idle, reopen the app, and verify the queued sale is
   still present exactly once.

Pass condition: no pending transaction disappears, no duplicate installed app is
created, and no sale is submitted twice after replay.

Required evidence fields:

```text
old_build_sha:
candidate_build_sha:
browser:
installed_app_name_before:
installed_app_name_after:
pending_queue_id:
pending_idempotency_key_hash_or_redacted_id:
queue_count_before_update:
queue_count_after_update:
server_sale_count_after_replay:
evidence_screenshot_paths:
evidence_trace_paths:
```

#### Authenticated offline and replay fixture

Use only the disposable fixture from the intake table. The operator must prove
the full lifecycle in both Chrome and Edge where practical:

1. Sign in online, select company, unlock the logical terminal, select location,
   and open the disposable shift.
2. Load the catalog and confirm one in-stock barcode item is visible.
3. Disconnect the browser using DevTools Network offline mode.
4. Complete one cash checkout and confirm durable pending-sync state.
5. Reload, close/reopen, and restart the installed app while still offline;
   confirm the queue remains intact and no duplicate local sale appears.
6. Restore connectivity and use the existing manual replay control.
7. Simulate or capture a lost response, retry the same sale, and confirm the
   idempotency key remains unchanged.
8. Repeat manual sync; confirm the server contains exactly one sale.

Pass condition: authentication and terminal/shift state recover as designed,
manual replay is operator-controlled, and one logical sale produces one server
sale.

#### Hardware and driver evidence

| Capability | Required action | Pass condition | Evidence |
| --- | --- | --- | --- |
| Barcode scanner | Scan the fixture barcode online and offline | Correct item/quantity enters the cart; invalid/deactivated code is rejected | Scan log or recording plus screenshot |
| Receipt printer | Print a completed cash receipt and reprint it | Correct receipt identity and totals; failure is visible and recoverable | Receipt image/print output plus console log |
| Cash drawer | Trigger drawer on approved cash workflow | Drawer command stays inside the existing hardware driver/message-bus contract | Driver log plus operator result |
| Printer failure | Disconnect/unavailable printer, complete sale, retry/reprint | Sale state remains authoritative; no duplicate sale or silent loss | Failure screenshot and replay result |
| Optional pairing | Run with pairing absent/present according to policy | Pairing remains compatibility state and does not become an unintended checkout prerequisite | Terminal policy evidence |

If physical hardware is unavailable, an approved simulator must expose the same
driver registry and message-bus responses. A unit test alone does not close the
hardware-backed Phase 142 gate.

#### Evidence handoff and close rule

The Verifier/QA owner must attach the browser screenshots, DevTools manifest and
Service Worker captures, Playwright trace/video on failure, offline queue proof,
server-side sale-count proof, and hardware results to the phase record. Do not
mark Phase 142 completed from local unit tests or a normal browser tab alone.

Phase 142 may change from `in_progress` to `completed` only when every blocked
row above has an owner, a captured result, and a pass condition marked `PASS`.
Until then, Phase 143 remains ineligible.

## PWA Stage 5 — Canary and release evidence

### Mapped repository phase

Phase 143 — Standalone POS PWA canary and release evidence.

### Objective

Validate the hardened PWA on a controlled terminal and prepare governed release
evidence without treating implementation as production deployment.

### Owner and dependencies

- Owner role: Promoter/Release for promotion; Verifier/QA for canary evidence.
- Dependencies: Phase 142 passing evidence, staging access, canary terminal,
  rollback owner, and explicit release authorization.

### Rollout sequence

```text
feature PR → develop
develop → to-staging/<label> → staging
staging → release/<label> → main
manual deploy-main.yml dispatch
```

The implementation task may stop after its PR into `develop`. It must not merge
`main` or dispatch production deployment.

Canary sequence:

```text
staging POS
→ dedicated test terminal
→ one controlled cashier terminal
→ small cashier group
→ full POS rollout
```

### Canary evidence

- Install and upgrade behavior.
- Login, company, logical terminal, location, and shift flow.
- Online sale and offline cash sale.
- Manual sync and duplicate-retry behavior.
- Barcode, receipt, drawer, and printer behavior.
- Active-transaction update deferral.
- Idle update activation.
- Close shift and restart recovery.

### Acceptance criteria

- [ ] Release inventory identifies included and excluded scope.
- [ ] Exact tested commit and generated POS build are recorded.
- [ ] Canary go/no-go owner and rollback owner are explicit.
- [ ] Canary evidence passes before expanding rollout.
- [ ] Rollback preserves pending queue, terminal state, and transaction evidence.
- [ ] Production proof and deployed-change accuracy review are defined before
      any production dispatch.

### Risks and blockers

- Staging or canary access may require external coordination.
- A PWA release can change installed metadata without changing application code;
  browser-specific migration instructions may be required.
- Full rollout is deferred until all canary gates pass.

## Cross-stage acceptance gates

The PWA initiative cannot be marked complete until all applicable gates pass:

- [ ] PWA source/build ownership remains clear.
- [ ] Manifest identity is DGFY POS.
- [ ] Icon paths and sizes are valid in generated output.
- [ ] Installed app identity is migration-safe.
- [ ] Service Worker caches only approved static resources.
- [ ] POS APIs, payments, inventory mutations, authentication mutations, terminal
      mutations, shift mutations, and replay submissions are not served from
      Service Worker cache.
- [ ] Existing offline cash checkout, pending sync, manual replay, and
      idempotency semantics are unchanged.
- [ ] Logical terminal, location, permissions, compliance, and shift guards are
      unchanged.
- [ ] Optional physical pairing remains optional compatibility state.
- [ ] Barcode, printer, drawer, and hardware-driver behavior is unchanged.
- [ ] Active transactions cannot be interrupted by a PWA update.
- [ ] Chrome and Edge installed-PWA checks pass.
- [ ] Existing-install upgrade checks pass.
- [ ] Canary evidence and rollback notes pass.
- [ ] Required ADR, feature documentation, compliance, test, and ledger evidence
      is complete.

## Implementation handoffs

### Worker/Implementer

- Owns source changes, focused tests, documentation updates, commits, and the
  PR into `develop`.
- Does not merge or deploy.

### PR Reviewer

- Reviews the diff, architecture classification, ADR/documentation closure,
  tests, and release evidence quality.

### Verifier/QA

- Verifies merged and deployed behavior in the appropriate environment,
  including installed-browser and canary evidence.

### Promoter/Release

- Executes governed promotion and staging/release evidence.
- Stops at the `main` merge/deployment boundary when explicit human authorization
  is required.

## Required completion report

Every completed PWA phase must report:

1. Phase number and PWA stage.
2. Status and completion date.
3. Files changed and responsibility owners.
4. Architecture classification.
5. ADR impact and documentation closure.
6. Tests and exact commands run.
7. Build and generated-artifact evidence.
8. Browser/hardware/canary evidence where applicable.
9. Deferred items and residual risks.
10. Rollback notes.
11. Current phase and next eligible phase.

No phase may claim production deployment merely from a source build or local
test result.
