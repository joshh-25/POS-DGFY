---
status: amended
authority_level: authoritative
owner: pos
date: 2026-08-18
last_reviewed: 2026-09-08
review_by: 2027-02-18
applies_to: architecture_decision
topic: frontend_browser_support_baseline_and_es_compat_guardrail
---

# ADR 0067: Frontend Browser-Support Baseline and ES-Compat Guardrail

## Status

Accepted (2026-08-18).

## Context

> **Strictness tiers (ADR 0039).** Clauses below are tagged `[binding]`, `[default]`,
> or `[snapshot]`. `binding` needs a superseding ADR to change; `default` needs an
> amendment block in the implementing PR; `snapshot` is documentation and may be
> updated by ordinary work. Untagged clauses elsewhere in this document are `default`.

The iMin POS terminal fleet runs a fixed Android WebView pinned to Chrome 80-84, with no field
update path. Two production outages have now shipped a modern JS runtime method to that fleet:

- #271 (2026-08-08) — `String.prototype.replaceAll` (ES2021, Chrome 85+)
- #664 (2026-08-18) — `Array.prototype.at` (ES2022, Chrome 92+), fixed on `main` by PR #665

Both times the fix was a targeted swap of the one crashing call site. #271 also added an ESLint
`no-restricted-syntax` rule, but its selector matched only `replaceAll` — it never generalized, and
#664's line entered via an evil merge (`7047b297`) that appeared in neither merge parent, so it never
surfaced in a reviewable PR diff.

A confirmed, load-bearing fact from investigating #664: `build.target: ['chrome80', 'edge88',
'firefox78', 'safari14']` (set on all four Vite configs — `apps/dgfy-web/vite.config.js` and the
`pos`/`store`/`skupervisor` per-app configs) downlevels **syntax** only. It does not, and per Vite's
own docs cannot, polyfill missing **runtime prototype methods**. No `browserslist`,
`@vitejs/plugin-legacy`, `core-js`, `eslint-plugin-compat`, or `eslint-plugin-es-x` existed in this
repo before this ADR.

Separately confirmed: **ESLint runs nowhere automatically today.** `pr-quality-checks.yml` — the only
workflow that ever ran `npm run lint` — was unwired from `pr-checks.yml` on 2026-08-14 (#416).
`.husky/pre-commit` never invokes the frontend lint either. The only automatic PR gate is
`pr-frontend-build-checks.yml`, which runs `docker build` → `apps/dgfy-web`'s
`npm run build:all:parallel` (a real `vite build` for each of the three apps). A lint-only guardrail
therefore cannot run against the merged tree on every PR — only a build-time mechanism can.

## Decision

1. **Chrome 80 is the binding floor for `apps/dgfy-web`'s three deployed surfaces** (`pos`, `store`,
   `skupervisor`) for as long as the iMin fleet is in production use with no update path. Lowering
   this floor is a decision for a superseding ADR, not ordinary work. `[binding]`
2. **Four layers implement the guardrail, each catching a distinct failure mode:**

   - **Layer 1 — runtime polyfill** (`apps/dgfy-web/src/compat/chrome80Runtime.js`). Feature-tested,
     zero-dependency shims for `Array.prototype.at`, `String.prototype.at`, `Object.hasOwn`,
     `String.prototype.replaceAll`, `Array.prototype.findLast`/`findLastIndex`, installed
     non-enumerably, imported as the first statement of every app entry (`apps/pos/src/main.jsx`,
     `apps/store/src/main.jsx`, `src/main.jsx` — `apps/skupervisor/src/main.jsx` inherits it
     transitively, since its only line re-exports `src/main.jsx`). This is the **only** layer that
     can reach a third-party dependency's own bundled code — `maplibre-gl` calls `Object.hasOwn` five
     times internally and is lazily reachable from the POS location/tenant-setup map screens; no lint
     rule or build check can edit `node_modules`. `[default]`
   - **Layer 2 — build-time gate** (`apps/dgfy-web/build/esCompatGuardPlugin.js`, a Vite
     `generateBundle` plugin registered in all four configs). Fails the build if an emitted chunk
     contains a Chrome-80-incompatible method *not* covered by Layer 1: `structuredClone`,
     `Object.groupBy`/`Map.groupBy`, `.toSorted`/`.toReversed`/`.toSpliced`, `AbortSignal.timeout`,
     `Array.fromAsync`, `Promise.withResolvers`. This is the layer that actually runs in CI today,
     because it executes inside `npm run build:all:parallel`, which `pr-frontend-build-checks.yml`
     already runs on every PR's merged tree — no CI workflow change was needed. It is also what would
     have caught #664's evil-merge vector, since it scans the built output regardless of how the
     source line arrived. `.with()` is deliberately excluded from the deny list — collision-prone
     against ordinary user-defined `.with()` methods in minified output; would need an AST-based
     check, not built here. A reviewed, empty-by-default `ALLOWLIST` exists in the same file for a
     future confirmed-safe exception. `[default]`
   - **Layer 3 — source hygiene** (`apps/dgfy-web/.eslintrc.json`'s `no-restricted-syntax`,
     generalized from #271's single `replaceAll` selector to the ten-method family the issue named:
     `at`, `findLast`, `findLastIndex`, `Object.hasOwn`, `structuredClone`, `toSorted`, `toReversed`,
     `toSpliced`, `Object.groupBy`/`Map.groupBy`, `AbortSignal.timeout`). Fast local/editor feedback,
     but not CI-enforced (see the "Known gap" below) and cannot see `node_modules`. Exempted for
     `**/__tests__/**`/`**/*.test.js(x)` (Node test runner, not the WebView) and existing
     `*.config.js` Node tooling. `[default]`
   - **Layer 4 — the specific first-party call sites** found in #666's sweep and fixed in this same
     PR: `apps/dgfy-web/apps/store/src/modes/fnb/storefront/components/FnbItemReviewModal.jsx`,
     `apps/dgfy-web/Pages/admin/InvoiceManager.jsx` (×2), `apps/dgfy-api/src/modules/pos/domain/
     posDiscountCalculator.js` (Node-only, zero runtime risk — fixed for symmetry with its frontend
     twin), and the POS shift-summary print CSS (see clause 4). `[snapshot]`

3. **Layer 1's coverage boundary is explicit, not implied total.** It protects code reached through
   an app's ES module import graph. It does **not** cover a `<script>` tag executed before that graph,
   or the POS offline-precache service worker (`apps/pos/vitePosOfflinePrecachePlugin.js` patches
   `sw.js` at build time; `sw.js` itself runs in its own worker context, outside this import). Neither
   currently uses a shimmed method — confirmed during this investigation — but that is a property to
   re-check on future changes to either surface, not a permanent guarantee. `[default]`
4. **CSS `:has()` (Chrome 105+) is resolved per-site, not blanket-banned.** The POS shift-summary
   print rule (`src/index.css`, gating `.pos-shift-summary-print-shell`) was a functional bug on
   Chrome 80 — the selector simply doesn't match, and the whole app prints instead of just the
   summary — fixed by replacing it with a `body.pos-shift-summary-printing` class toggled by
   `ShiftCloseSummaryPrintView.jsx`'s mount/unmount effect, mirroring the existing
   `pos-online-order-receipt-print-mode` pattern already used one block above it in the same file for
   `OnlineOrderReceiptModal.jsx`. The store app's 8 `:has()` selectors in `apps/store/src/index.css`
   (decorative maplibre popup styling) are **accepted as-is** — they degrade to "rule doesn't match"
   on old browsers, not a functional break, and are lower priority than a POS crash class. `[default]`
5. **Known gap, not solved by this ADR:** `npm run lint`'s own scope (`eslint src apps --ext
   .js,.jsx`) excludes `Components/`, `Pages/`, and root `Layout.jsx` — confirmed live: the generalized
   Layer 3 rule did not catch `Pages/admin/InvoiceManager.jsx`'s two `.at(-1)` call sites; they were
   only found by the manual sweep and Layer 2's build scan (skupervisor bundles all of `Components/`/
   `Pages/` and is covered there). Widening `npm run lint`'s scope is separate cleanup — those
   directories currently carry 27 pre-existing ESLint errors unrelated to this guardrail — and is not
   undertaken here. `[snapshot]`
6. **Gap closed 2026-08-25 (#1018), partially.** The former `pr-quality-checks.yml` (renamed
   `promotion-quality-gate.yml`) is now automatically wired into the promotion flow — `to-staging/*`
   into `staging`, `release/*` into `main` — once #1015/#1016 (#1008 Phase 1/2) made its ~14min cost
   affordable. This is narrower than "back into the automatic PR pipeline": it still does not run on
   an ordinary PR into `develop`, only on the two promotion-shaped PRs, so `eslint` coverage on a
   `develop`-bound PR remains exactly what Layer 2's build-time scan already provided — this ADR's
   original acceptance criteria are unaffected, not superseded. `[snapshot]`

## Consequences

- The `.at()` failure class (and its four documented siblings) is structurally difficult to ship to
  the POS/store/skupervisor surfaces going forward: Layer 1 makes the currently-known third-party
  hazard (`maplibre-gl`) safe outright; Layer 2 fails the build on the merged tree for anything else,
  including an evil merge; Layer 3 gives fast local feedback for first-party source.
  - `apps/dgfy-web/src/features/pos/__tests__` and `apps/dgfy-web/src/compat/__tests__` (new)
- A future ES-version method not yet in either the shim list or the deny list can still ship silently
  until someone extends both lists by hand — this ADR does not adopt `eslint-plugin-es-x` or an
  equivalent maintained-list plugin; see "Alternatives considered."
- `apps/dgfy-web`'s bundle size grows by roughly 1KB (the polyfill) per app entry —
  `check:frontend-budgets`' existing per-chunk ceilings were re-checked, not raised, as part of
  shipping this ADR.

## Alternatives considered

- **`eslint-plugin-es-x` / `eslint-plugin-compat`** (the issue's own option 2): a maintained,
  auto-updating method list beats a hand-maintained one long-term, but neither plugin can reach
  `node_modules` or run in the one CI gate that actually executes on every PR today — it would have
  solved this ADR's clause 2's Layer 3 concern only, leaving clauses about `maplibre-gl` and the evil
  merge vector unresolved. Partially revisited 2026-08-25 — `promotion-quality-gate.yml` (formerly
  `pr-quality-checks.yml`) now runs on promotion PRs (clause 6) — but not on an ordinary `develop`
  PR, so this alternative's core tradeoff (neither plugin runs in the one gate every PR hits) is
  unchanged.
- **`@vitejs/plugin-legacy`'s `modernPolyfills`** (via `core-js`) instead of a hand-written Layer 1:
  spec-exact and auto-maintained, but adds two new devDependencies (`@vitejs/plugin-legacy`,
  `terser`) and a larger entry chunk against `check:frontend-budgets`' existing ceilings, for five
  methods that are simple enough to shim correctly by hand. Revisit if the shim list grows
  significantly.

## Validation

1. `apps/dgfy-web/src/compat/__tests__/chrome80Runtime.test.js` — deletes each native method, asserts
   spec-matching shim behavior (negative indices, out-of-range, inherited-vs-own properties,
   non-enumerability) and a no-op path when natives already exist.
2. `npm run build:pos`/`build:store`/`build:skupervisor` — Layer 2 proven to actually fail: a
   denylisted token was temporarily added to POS source during this PR's own verification and
   confirmed to break the build, naming the chunk, before being reverted.
3. `npx eslint src apps --ext .js,.jsx` in `apps/dgfy-web` — 0 errors after Layer 4's fixes; confirmed
   the new selectors fire on a deliberately reintroduced `.at(-1)` in a non-test source file and stay
   silent in a `*.test.js` file.
4. `npm run check:frontend-budgets` — POS/store/skupervisor chunk budgets re-confirmed against the
   Layer 1 polyfill's added weight.
5. Not yet done — needs a human with the physical device (tracked separately, #580): open the POS
   location picker on a real iMin terminal (previously a guaranteed `Object.hasOwn` crash) and print a
   shift-close summary (previously printed the whole app).

## References

- `docs/architecture/adr/0039-adr-lifecycle-strictness-tiers-and-amendment-path.md`
- `docs/compliance/impact-declarations/2026-08-05-pos-webview-replaceall-crash.md`
- `docs/compliance/impact-declarations/2026-08-18-pos-webview-array-at-crash.md`
- `docs/compliance/impact-declarations/2026-08-18-pos-es-compat-guardrail.md`
- `packages/web-core/src/compat/chrome80Runtime.js`
- `packages/web-core/vite/esCompatGuardPlugin.js`
- `apps/dgfy-ims/.eslintrc.json`

## Amendments (2026-08-22)

### Frontend split (issue #322, ADR 0071) repoints every layer's file path

This ADR's decision body above (Layers 1-4) and its narrative evidence describe the codebase as it
stood on 2026-08-18, under the single `apps/dgfy-web` package — left as originally written per this
repo's "historical docs record what was true at the time" convention, same as every other
pre-split ADR. The split moved every file this ADR names to a new location; that move is tracked
here rather than by silently rewriting the decision's own prose:

- **Layer 1** (`apps/dgfy-web/src/compat/chrome80Runtime.js`) → `packages/web-core/src/compat/chrome80Runtime.js`.
  Import wiring moved from a same-directory `./compat/chrome80Runtime.js` in each app's `main.jsx`
  to a cross-package `../../../packages/web-core/src/compat/chrome80Runtime.js`, still the first
  statement in all three apps' entrypoints (`apps/dgfy-ims/src/main.jsx`, `apps/dgfy-pos/src/main.jsx`,
  `apps/dgfy-storefront/src/main.jsx`).
- **Layer 2** (`apps/dgfy-web/build/esCompatGuardPlugin.js`) → `packages/web-core/vite/esCompatGuardPlugin.js`,
  following the same precedent as `packages/web-core/vite/sentryViteConfig.js`. Still registered in
  all three apps' `vite.config.js`, immediately after `react()`.
- **Layer 3** (`apps/dgfy-web/.eslintrc.json`) → `apps/dgfy-ims/.eslintrc.json` **only** — the branch's
  sole surviving `.eslintrc.json`. POS, storefront, and `packages/web-core` itself currently have no
  ESLint config of their own, so this layer's `no-restricted-syntax` rule enforces on IMS alone; it
  does not reach POS/storefront source or the shared `packages/web-core` code all three apps actually
  ship, which is exactly where a real find already landed (see below). Tracked as an open gap, not
  fixed by this amendment.
- **Layer 2's own first live catch against the fully absorbed codebase** (2026-08-22 develop-absorb
  cycle, 442 commits): `Array.prototype.toSorted`, reachable via `@radix-ui/react-collection`
  (transitively bundled through `@radix-ui/react-accordion`/`@radix-ui/react-scroll-area`, reachable
  from IMS's Items page). Promoted into Layer 1's shim list per this ADR's own "intended lifecycle
  for a denylist hit" (the same path `structuredClone` took originally) and removed from Layer 2's
  deny list accordingly — see `packages/web-core/src/compat/chrome80Runtime.js` and
  `packages/web-core/vite/esCompatGuardPlugin.js`'s own header comments for the full account.

### 2026-08-23 — Layer 3's "no config on POS/storefront" bullet is now false; the real gap is web-core

Issue #917's fix (`af9e73c9` and follow-up commits) added `apps/dgfy-pos/.eslintrc.json` and
`apps/dgfy-storefront/.eslintrc.json` — byte-faithful restorations of the pre-split
`apps/dgfy-web/.eslintrc.json` (same `env`/`extends`/`parserOptions`/`plugins`/`rules` block,
differing only in the per-app `overrides` entries the pre-split config also carried: POS keeps the
`vitePosOfflinePrecachePlugin.js` Node-tooling carve-out, storefront keeps the `StorefrontApp.jsx`
carve-out). The 2026-08-22 amendment above's claim that "POS, storefront, and `packages/web-core`
itself currently have no ESLint config of their own" is now correct only for the last third of that
sentence:

- **Layer 3 now enforces on all three apps** (`apps/dgfy-ims`, `apps/dgfy-pos`,
  `apps/dgfy-storefront`), each with its own `.eslintrc.json`, no rule downgraded from the pre-split
  baseline.
- **`packages/web-core` still has none, and it is the larger gap** — measured this session at 691
  unlinted source files (579 of which are the exact files `develop`'s `eslint src apps` used to
  lint, before the split moved them). No app's lint script reaches into `packages/web-core`; the two
  apps whose `src/` is smallest (`apps/dgfy-ims`, `apps/dgfy-pos`) each have exactly one file in
  `src/` (`main.jsx`), so their lint jobs validate almost nothing of the code they actually ship.
  Diagnostic sweep found ~22 real non-test errors, including 3 genuine `react-hooks/rules-of-hooks`
  violations (`Components/ai/ActionResultCard.jsx`, `Components/jo/JODetailsModal.jsx`) — filed as
  issue #918, tracking numbers included.
- **`eslint-plugin-react-hooks` is now pinned to the exact `7.0.1`** in all three apps'
  `package.json` (was `^7.0.1`, resolving to a drifted `7.1.1` on this branch — issue #917's other
  root cause). This restores exact parity with `develop`'s resolved lockfile (confirmed identical
  integrity hash), not an arbitrary freeze — but the pin's only in-repo rationale lives here now,
  since a `package.json` dependency line can't carry a comment. It currently masks ~25 React
  Compiler diagnostics that `7.1.1` was surfacing on `apps/dgfy-ims` alone before the pin; issue
  #918 tracks re-evaluating those once `packages/web-core` has real coverage to also apply the pin's
  effect to.

Tracked as an open gap via issue #918, same as before — this amendment updates the *description* of
the gap, not its status.

### 2026-08-29 — `packages/web-core`'s gap is closed; `[default]` clause 5's exclusion list shrinks by one

Issue #918's fix adds `packages/web-core/.eslintrc.json` — the same `env`/`extends`/`plugins`/
`rules` block as the three apps' configs, with `parserOptions.ecmaVersion` raised to `2022` (the
three apps stay at `12`/ES2021) purely to parse a pre-existing top-level `await` in one test file;
that bump is local to web-core's own config and does not relax Layer 3's `no-restricted-syntax`
deny list or touch the three apps' configs. Per ADR 0071 Decision 4 `[binding]`, `packages/web-core`
still gets no `lint` script and no `devDependencies` of its own — coverage runs from
`apps/dgfy-ims`'s already-installed ESLint via `--resolve-plugins-relative-to`, the same pattern
web-core's test suite already used, wired into `frontend-ims-quality`'s job in
`promotion-quality-gate.yml` (advisory, same as every other step in that job per #1063).

- **Layer 3 now enforces on all three apps plus `packages/web-core`** — the shared trunk all three
  apps actually ship is reachable by a CI-run ESLint invocation for the first time since the split.
- **The 3 `react-hooks/rules-of-hooks` violations are fixed**: `Components/ai/ActionResultCard.jsx`
  (a `React.useState` pair called after an early `if (!result) return null;`) and
  `Components/jo/JODetailsModal.jsx` (a `useEffect` called after an early `if (!jo) return null;`) —
  both fixed by moving the guard clause below every hook call, not by removing the guard.
- **10 `react/no-unescaped-entities` errors fixed** (quote/apostrophe escaping, mechanical) and the
  one parsing error (top-level `await`) fixed via the `ecmaVersion` bump above.
- **10 findings explicitly deferred, not silently dropped** — all `react-hooks` diagnostics from the
  same `7.0.1` `recommended` preset clause 5 already names as newly-enforced-elsewhere: 6
  `set-state-in-effect`, 2 `refs` (a shadcn/radix `Components/ui/dropdown-menu.jsx` primitive), 1
  `set-state-in-render`-adjacent "Cannot create components during render" (a dynamic-icon-component
  pattern also used by `ActionResultCard.jsx` itself — the compiler can't statically prove
  `getCategoryIcon(item)`'s return value is stable across renders), and 1 "Compilation Skipped"
  optimization-only notice (`POSSetupStep.jsx`, a `useMemo` dependency-narrowing mismatch, not a
  runtime error). Each would need a behavior-verified fix, not a mechanical one — deferred to a
  follow-up rather than risked in the same PR that first turns coverage on.
- **The `eslint-plugin-react-hooks` `7.0.1` pin (previous amendment) is unchanged** — re-evaluating
  it against the ~25 additional diagnostics `7.1.1` surfaces stays deferred, now trackable against
  real web-core coverage instead of a diagnostic-only sweep.

Clause 5's own list ("POS, storefront, and `packages/web-core` itself currently have no ESLint
config of their own") is now fully superseded, not just partially as the prior amendment left it.

### 2026-09-08 — `packages/web-core` lint gains develop-PR coverage and goes blocking (#1712)

Closes the enforcement half of the gap the 2026-08-29 amendment above left open. Two changes, both
downstream of #1698 (a three-undefined-identifier `ReferenceError` in
`packages/web-core/src/features/pos/services/posService.js` that reached both `staging` and `main`
undetected — root-caused in #1712, fixed separately by #1702/PR #1709):

- **Clause 6's "eslint coverage on a develop-bound PR remains exactly what Layer 2's build-time scan
  already provided" is now superseded.** A new `pr-frontend-lint-checks.yml` job
  (`frontend-ims-lint-check` in `pr-checks.yml`) runs `apps/dgfy-ims`'s and `packages/web-core`'s
  ESLint (the same `--resolve-plugins-relative-to` invocation #918 already wired into the promotion
  leg) on every ordinary `develop`-base PR that touches `apps/dgfy-ims/`, `packages/web-core/`,
  `packages/pos-receipt/`, or `packages/shared-constants/` — blocking, not advisory.
  `apps/dgfy-pos`/`apps/dgfy-storefront` lint remains promotion-leg-only; extending develop-PR
  coverage to those two is tracked as a follow-up, not done here.
- **`promotion-quality-gate.yml`'s `run_web_core_lint` step flips from advisory
  (`continue-on-error: true`) to blocking on the `release/*→main` leg**, matching `run_ims_lint`'s
  #1431 Phase 1 treatment. Safe to flip because #1433/PR #1437 had already downgraded every one of
  web-core's 14 real ESLint errors to `warn` (13 React-Compiler-readiness diagnostics + 1
  `react/no-unescaped-entities`) for exactly this reason. **Verified live, not just inherited from
  #1433/#1437**: a fresh `npx eslint ../../packages/web-core --ext .js,.jsx
  --resolve-plugins-relative-to .` run (from `apps/dgfy-ims`) turned up one further real error
  #1433/#1437 never touched — `src/components/media/ResponsiveImage.jsx`'s own
  `eslint-disable-next-line react/no-unknown-property` comment sat three comment lines above the
  JSX attribute it meant to suppress, so it silently suppressed nothing
  (`eslint-disable-next-line` only reaches the single line immediately below the comment it's
  written on). Fixed in the same PR by moving the directive to the line directly above the
  attribute. Confirmed 0 errors / 155 warnings, exit code 0, after that fix — the actual evidence
  this flip's safety claim rests on, not an assumption carried over from #1433/#1437 alone.
- **Functional-check gap, named in #1712, is separately tracked, not closed by this amendment**: a
  new advisory-only `frontend-ims-pos-sales-e2e-quality` job now runs a real-browser IMS/POS journey
  (`apps/dgfy-api/tests/frontend.imsPosSalesJourney.e2e.test.js`, repaired — it had been unrunnable
  since 2026-07-20 due to a stale `frontendDir` path, independent of the #322 split) on the promotion
  leg, plus one new assertion targeting `TerminalOperationsWorkspace`'s Items tab specifically (the
  code path #1698 broke). This is **not yet a Layer in this ADR's guardrail scheme** (it's a
  functional/behavioral check, not an ES-compat guardrail) and is **not blocking** — recorded here
  because it's the other half of the same incident's root-cause fix, not because it changes any of
  Layers 1-4's ES-compat mechanism. Two further, pre-existing defects were found live while wiring
  this job (neither introduced nor fixed by this PR, both reasons this stays advisory rather than
  blocking): the suite's `frontendDir` path fix alone was not sufficient to actually launch the dev
  server on its intended port — a second, deeper bug (`npm run dev:skupervisor -- --port ...`
  silently mis-parses across the nested `cd apps/dgfy-ims && npm run dev` script, crashing vite —
  fixed by spawning `apps/dgfy-ims`'s own `dev` script directly instead); and the suite's
  `ensureBrowserE2EUser()` helper registers against a `token-original` tenant that does not exist on
  a freshly migrated DB, and even once provisioned (`scripts/register_original_tenant.js`, already
  documented, not new tooling) its registration payload is missing a `phone_number` field
  `apps/dgfy-api/src/validators/authValidator.js` now requires unconditionally.
