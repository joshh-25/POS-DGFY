# Storefront Refactor Handoff

> Status: active handoff — hand this to a fresh AI session to continue
> Branch: `claude/storefront-shell-continuation-n67w18` (stacked on `claude/storefront-state-zustand-n67w18`, PR #68, which is being left as its own merge-ready checkpoint)
> Last updated: 2026-07-23
> Scope: `frontend/apps/store/src`

Read this together with:

- `STOREFRONT_REFACTOR_PROGRESS_REPORT.md` — the full dated log of every wave, with exact line
  counts, exact identifiers moved, and every non-obvious design decision explained. **This handoff is
  a summary; the progress report is the source of truth for "what exactly happened."**
- `STOREFRONT_STATE_MANAGEMENT.md` — the zustand sliced-store standard (architecture + conventions).
- `STOREFRONT_FRONTEND_ARCHITECTURE_GUIDE.md` — folder ownership + MVVM/SOLID rules.
- `docs/ai/PR.md` before staging, committing, pushing, or opening a PR.

## Why this effort exists

`StorefrontApp.jsx` was a ~9,231-line God component: no state-management layer (96 `useState` values
prop-drilled with no store) and a render tree too entangled to extract cheaply. The user's goal:
**break it down to under 1,000 lines, following MVVM/SOLID.**

## Current state in simple terms

`StorefrontApp.jsx` line count: **5,435** (down from 9,231 at the very start; down from 6,815 at the
start of the current branch's work).

The file has two halves:
- **The render tree** (JSX) — mostly extracted into owner-folder components already.
- **The logic band** (component body → the main `return`) — `useState`/`useMemo`/`useCallback`/
  `useEffect`/handlers. This was **never touched** until this branch. It's the reason pure JSX
  extraction stalled: even after extracting every remaining view, the untouched logic band alone was
  ~3,900 lines — already ~4x the <1,000 target.

**The dominant remaining lever is logic extraction into ViewModel hooks (`use*`), not JSX extraction.**
This is not new architecture — the app already has ~40 such hooks it consumes
(`discovery/hooks/*`, `customer-dashboard/hooks/*`, `modes/fnb/checkout/hooks/*`,
`modes/services/booking/hooks/*`). The shell just never finished the pattern for its own inline
residue. Same story as the zustand store below: adopt what the codebase already standardized on.

## The state-management layer (zustand, sliced)

`apps/store/src/store/` — one `useStorefrontStore` composed from domain slices (ui/session/catalog/
cart/checkout/serviceBooking/discovery). Full spec: `STOREFRONT_STATE_MANAGEMENT.md`. Status:
- `ui` and `cart` slices are live (migrated from `useState` via the in-place bridge).
- `session`/`catalog`/`checkout`/`serviceBooking`/`discovery` slices are still scaffolds
  (`{ domain: {} }`) — **not yet filled in.** Filling them in is part of the deferred money-path wave
  below, but it is lower priority than the logic-extraction hooks; the hooks alone can hit the target.

Do **not** introduce Redux/Context — zustand is the repo's own established standard
(`frontend/src/store/useStore.js`, the inventory app's store, untouched).

## The extraction pattern (read this before writing a new hook)

For **JSX**: move the block verbatim into a new component in the right owner folder
(`modes/<mode>/storefront/components/`, `shared/components/storefront/`), flat props, module-level
deps (icons/STYLES/helpers) imported directly by the new file, money-path handlers passed through as
props (never owned by the new component). Precedent: `StorefrontServicesCatalog.jsx`,
`StorefrontClassicCatalog.jsx`.

For **logic** (the current dominant lever): move `useState`/`useMemo`/`useCallback`/`useEffect`
verbatim into a new hook in `shared/hooks/`, taking every external reference as an explicit named
parameter, returning every value the shell still needs under the **same local name** it had before —
so the 100+ call sites some of these have (e.g. `isFnbMode`, `isDgfyCustomerSignedIn`) stay textually
unchanged. Precedent: `useStorefrontCatalog.js`, `useStoreCatalogLoader.js`,
`useStorefrontNavigation.js`, `useStorefrontSession.js`, `useGuestCustomerIdentity.js`,
`useStorefrontUiChrome.js`, `useStorefrontTrackingIntent.js` — all in `shared/hooks/`.

**Non-obvious things you WILL hit doing this** (each already resolved once — check the progress report
for the exact commit/reasoning before re-solving from scratch):

1. **Temporal-dead-zone (TDZ) risk.** No test in this repo renders `<StorefrontApp/>` — every test is
   either a unit test on an extracted model/hook or a raw-source-text `toContain(...)` assertion. A
   hook call placed in the wrong spot, or a moved function referenced before its new (later)
   declaration point, throws a `ReferenceError` **at runtime only** — lint, build, and the full test
   suite will all stay green regardless. Before every commit: grep every name the new hook returns
   across the *whole file* and confirm every pre-existing reference before the new call site is inside
   a **deferred closure** (an event handler or effect callback body — safe, since it only runs after
   the whole component has finished its render pass) — never a synchronous read or a `useMemo`/
   `useCallback`/`useEffect` **dependency array** (dependency arrays ARE evaluated synchronously at
   render time and WILL throw).
2. **Genuine ordering cycles exist and are NOT fixable by a lazy getter.** Two hooks can each need an
   output the other produces (e.g. `useCustomerDashboardIdentity` needs `savedCustomerDetails`;
   `useGuestCustomerIdentity`'s effect needs `accountIdentityRawName` from that same
   `useCustomerDashboardIdentity` call as a *reactive* dependency). A lazy getter (`() => x`) only
   works when `x` is merely *called later* (a function invoked from a deferred closure). It does NOT
   work when `x` needs to be a real, current *value* consumed synchronously (e.g. inside another
   hook's own dependency array or its return value) — see `useStorefrontTrackingIntent.js`'s doc
   comment for the fullest write-up of this distinction. When you hit one: leave the conflicting piece
   in the shell rather than forcing it into the new hook; don't duplicate the computation in both
   places (that was tried once, caught in review, and reverted — see the tracking-intent commit).
3. **The lazy-getter idiom itself** (`getX: () => x`, used inside the new hook via a stable
   `useCallback` wrapper that calls the getter only when invoked) is legitimate and already
   established pre-existing codebase precedent (`getGoStoreTrackPage`/`getFetchTrackingPayload` in
   `useCustomerDashboardRuntime`/`useCustomerDashboardTracking.js`) — use it, don't reinvent it, and
   don't use a `useRef`-based version instead (a newer ESLint `react-hooks/refs` rule flags refs read
   from inside a closure handed to an external, opaquely-analyzed factory function called
   synchronously in `useMemo` — this specific codebase already worked around that exact trap once).
4. **`react-hooks/exhaustive-deps` false positives at the hook boundary.** Once a `useState` setter or
   a `useRef` crosses into being a hook *parameter* instead of a locally-declared `useState`/`useRef`,
   ESLint can no longer statically prove it's referentially stable (even though React guarantees
   `useState` setters and refs never change identity) — expect new "missing dependency" warnings on
   otherwise-untouched effects nearby. Fix by adding the setter to the array (harmless, since it never
   changes) or with `// eslint-disable-next-line react-hooks/exhaustive-deps` matching the existing
   rate elsewhere (`useFnbCatalogRuntime.js`, `useFnbProductDetailsRoute.js`,
   `HospitalityBookingPanel.jsx`). **The total warning count must not increase** — verify with a
   before/after ESLint run, not just "0 errors."
5. **Dead state hiding inside the code you're moving.** Twice now, moving a function surfaced a
   `useState` whose *value* was never read anywhere (only the setter was called, write-only dead
   state) — `catalogErrorGuidance`/`catalogImageErrors` inside `useStoreCatalogLoader`'s extraction.
   Grep every identifier touched by moved code for read-sites, not just write-sites, before assuming
   it needs to move too.
6. **A verified-agent's self-report is not verification.** Every extraction in this project was done
   by delegating to a background agent, then **independently** re-checking: read the actual diff, read
   the new file, re-run ESLint/build/vitest myself (not trusting the agent's reported numbers), and
   manually trace TDZ safety for every returned name. This caught: an unused-but-still-destructured
   name (2 avoidable warnings), a dead-code workaround for a text-matching contract test (should have
   updated the test instead), and the duplicated-dead-computation ordering-cycle issue above. **Keep
   doing this** — don't skip to committing on the agent's word.

## Wave history (see `STOREFRONT_REFACTOR_PROGRESS_REPORT.md` for full detail)

| Wave | What | Result |
|---|---|---|
| 0 | zustand store scaffold + `STOREFRONT_STATE_MANAGEMENT.md` | — |
| 1a | migrate `ui` slice (viewport, payment modal) | — |
| 2 | pure-display JSX extractions + dead-code purge | 9,231 → 7,945 |
| 3a | migrate `cart` slice (money-path state) `[QA-REQUIRED]` | 7,949 |
| 4 | cart FAB + services-catalog JSX extraction + dead-code | → 6,815 |
| **5** | **SAFE logic extraction round 1**: `useStorefrontCatalog` (view-models), `useStoreCatalogLoader` (catalog fetch), `useStorefrontNavigation` (pure nav), `StorefrontClassicCatalog` (last big JSX) | 6,815 → 5,699 |
| **6** | **SAFE logic extraction round 2**: `useStorefrontSession`, `useGuestCustomerIdentity`, `useStorefrontUiChrome`, `useStorefrontTrackingIntent` | 5,699 → 5,435 |

Every commit in Waves 5–6: 0 ESLint errors, `build:store` passes, all 198 non-integration tests pass,
`git diff --name-only origin/develop` under `discovery/`/`features/discovery/` stayed empty (map
runtime never touched, per explicit user instruction — **do not touch
`discovery/components/StoresMap.jsx`, `features/discovery/renderers/discoveryResultsRenderer.jsx`,
`DeliveryPinMap`, or any marker/clustering code — develop's maps are the truth**).

## What's left (in priority order)

The shell is at 5,435 lines. Getting under 1,000 requires the **money-path logic** — the one class of
extraction deferred so far, because this environment is **headless with no WebGL/browser** — checkout,
cart mutation, OTP, and booking submission cannot be clicked here, so these migrations need real
browser QA on dev.dgfy.ph before merge, not just green tests.

1. **`useCartMutations`** — `addToCart` (~109 lines), `updateQty`, `removeCartItem`, cart-fly
   animation state, `cartTotals`/`serviceCartLines`/`productCartLines` derivations.
2. **`useServiceBookingViewModel`** — `saveServiceBookingDraft`, `handleServicesCartCheckout`, booking
   draft/intake-response state, the booking summary view-model.
3. **`useCheckoutSubmission`** — `handleCheckout` (~215 lines, the single largest handler in the file),
   `handleQuote`, `handleDownloadCheckoutImage`, the F&B auto-quote effect (~78 lines).
4. **The `persistCheckoutAuthResume` knot** — the tightest cross-domain coupling in the file: a
   cart↔checkout↔service↔session snapshot/restore pair used for the "sign in mid-checkout" flow. Do
   this last, after 1–3 above have simplified what it touches.
5. **Route containers** for the remaining render band → the shell finally collapses to a thin
   mode/route router. This is where it crosses under 1,000.

**Before starting #1–4:** re-run the same domain-clustering analysis the earlier waves used (grep the
current logic band, classify SAFE vs MONEY-PATH, check cross-domain coupling) — line numbers have all
shifted since the last map was made, and new coupling may have emerged from the Wave 5/6 extractions.
**A light replan (not a full redo) is warranted before this wave** — it's meaningfully riskier than
Waves 5–6 (real user-facing checkout/payment behavior, not just derived UI state) and needs the user's
explicit sign-off on scope and the QA checklist before starting, per the project's established rhythm
of pausing for a plan-mode pass before each wave that changes risk profile.

## Folder ownership (still valid, from the architecture guide)

- `customer-dashboard/` — account page/drawer, dashboard tabs, live sync, notifications, addresses.
- `discovery/` — landing sections, search/category UI, map presentation, discovery route/runtime
  hooks. **Shared across modes — never move discovery/map behavior under a mode folder.**
- `modes/fnb/` — F&B hero/catalog/product-detail, cart drawer, checkout route pages, guest OTP,
  promo, tracking.
- `modes/services/` — Services hero/model, booking components/hooks/models, cart drawer props.
- `modes/simple/` — Simple hero/model, checkout route page + props adapter.
- `modes/hospitality/` — hospitality-specific booking/storefront behavior (not the same as Services).
- `shared/{components,hooks,model,theme,utils}/` — mode-neutral only. If a "shared" piece starts
  branching by mode, move the mode-specific part into the owning mode folder.

`shared/` must not import from `modes/*`.

## MVVM/SOLID rules (still valid)

- **View** — render only, receives ready-to-render props/callbacks (cards, forms, route pages,
  drawers, modals, sections).
- **ViewModel** — prepares state/actions for views (route containers, route-props hooks, runtime
  hooks, derived UI state, interaction handlers). Should not render large JSX.
- **Model** — data rules/contracts (payload builders, normalization, persistence formats). No React
  rendering dependency.

## Verification checklist (every commit, no exceptions)

1. `cd frontend && npx eslint apps/store/src/StorefrontApp.jsx <new/changed files>` → 0 errors, total
   warning count not increased (measure the pre-change baseline first).
2. `npm --prefix frontend run build:store` → succeeds.
3. `cd frontend && npx vitest run --exclude '**/*.integration.test.*' apps/store/src` → 198 tests pass
   (the 4 `*.integration.test.jsx` specs use maplibre/WebGL and cannot run headless here — that's
   expected, not a failure).
4. From repo root: `git diff --name-only origin/develop -- frontend/apps/store/src/discovery
   frontend/apps/store/src/features/discovery` → empty.
5. `wc -l frontend/apps/store/src/StorefrontApp.jsx` → confirm the expected line delta.
6. Manual TDZ trace for any hook whose returned names have pre-existing wide usage (grep every
   returned name across the whole file; confirm every pre-call-site reference is a deferred closure).
7. Append a dated entry to `STOREFRONT_REFACTOR_PROGRESS_REPORT.md` (see existing entries for format).
8. Commit, push to the current branch. Do not batch multiple hooks into one commit — one hook/JSX
   block per commit, each green before the next.

## Safe push preparation

```bash
git branch --show-current   # claude/storefront-shell-continuation-n67w18
git status --short
git diff --check -- frontend/apps/store/src
```

Check for accidental secrets before staging anything unexpected:
```bash
rg "SMTP_PASS|SMTP_USER|EMAIL_FROM|PRIVATE KEY|BEGIN RSA|BEGIN OPENSSH|password" frontend/apps/store/src docs -n
```

## Branch/PR state

- **PR #68** (`claude/storefront-state-zustand-n67w18` → `develop`) — Waves 0–4, left open as a
  merge-ready checkpoint at the user's request. Title/body follow `.github/workflows/
  pr-conventional-commits.yml` (type(scope): description; body has `## Summary`/`## Motivation`/
  `## Testing`). **Do not add more commits to that branch** — it's frozen as a checkpoint.
- **`claude/storefront-shell-continuation-n67w18`** — current branch, Waves 5–6, stacked on #68's tip.
  Not yet in a PR. When ready, open a PR from this branch → `develop` (or → the #68 branch, if the
  user wants it stacked instead — confirm with them), following the same conventional-commits format.

## Next immediate step for whoever picks this up

Re-map the current logic band (it's shrunk and shifted since the last full map), classify the
remaining handlers/state by SAFE vs MONEY-PATH and cross-domain coupling, and bring that map to the
user for a scoped go/no-go before starting the cart/checkout/booking hooks — same rhythm as the
Wave 5/Wave 6 replan. Don't start money-path extraction unprompted.
