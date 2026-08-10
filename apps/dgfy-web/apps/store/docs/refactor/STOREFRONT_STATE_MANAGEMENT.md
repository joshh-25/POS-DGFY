# Storefront State Management (zustand, sliced)

Status: **adopted** — this is the standard for `apps/store`. Introduced to break the
`StorefrontApp.jsx` God component (96 prop-drilled `useState` values) into an owned,
testable state layer and let the shell collapse to a thin route+mode router.

## Why zustand (and not Redux / Context)

The repo already standardises on **zustand** (`frontend/package.json`; the inventory app's
`frontend/src/store/useStore.js`). The storefront simply never adopted it. We align with the
existing library rather than introduce a second paradigm:

- **Redux Toolkit** — excellent, but a *second* state library in one repo is the opposite of
  consistency. Not adopted.
- **React Context + useReducer** — no dependency, but a single context re-renders every
  consumer on any change; at cart/checkout typing frequency that forces ~8 hand-optimised
  contexts + a provider tree. Right for low-frequency state, wrong for a cart.
- **zustand (this doc)** — selector subscriptions (no re-render storm, no provider tree),
  async-friendly actions, already in the repo. Scaled here with the **slice pattern**.

## Layout

```
apps/store/src/store/
  useStorefrontStore.js     # create(devtools(composeSlices)); official reset via getInitialState
  slices/
    uiSlice.js              # REFERENCE slice — copy its shape
    sessionSlice.js         # auth/cookie/handoff, account, guest details, visitor id, follow
    catalogSlice.js         # selectedStore, stores, category/search/pagination, openStoreBySlug
    cartSlice.js            # items, add/update/remove, cart-fly anim   (Wave 3, persisted)
    checkoutSlice.js        # fulfillment/payment fields, checkout, quote, promo, OTP, auth-resume
    serviceBookingSlice.js  # drafts, intake responses, booking steps
    discoverySlice.js       # discovery list/filter WIRING only (never map runtime)
  selectors/
    uiSelectors.js          # reference selectors; derived values live here, not in stored state
  __tests__/
    useStorefrontStore.test.js
```

## Conventions

1. **State is nested under one domain key** (`s.cart`, `s.ui`, `s.session`, …). Clean
   boundaries, no name collisions across ~96 migrated values, clean persist `partialize`,
   and per-domain reset.
2. **Actions are flat and named `<domain><Verb>`** — `uiOpenOnlinePaymentModal`,
   `cartAdd`, `checkoutSubmit`. Discoverable, and never collide with state keys.
3. **Immutable domain updates**: `set((s) => ({ cart: { ...s.cart, items } }))`. Replace the
   domain object; never mutate; never touch sibling domains in one setter.
4. **Async lives in actions, not the shell.** API flows (`openStoreBySlug`, `checkoutSubmit`)
   are store actions that call the existing `services/` layer (`requestJson`, etc.). The shell
   stops owning data-loading effects.
5. **Selectors subscribe to the minimum.** Prefer primitives (`s => s.cart.items.length`).
   Only return a fresh object/array with `useShallow`. Derived values are selector functions
   in `selectors/`, never duplicated into stored state.
6. **Reset** reuses the repo's official pattern: `set(store.getInitialState())`.

## Store vs. local state (important)

The store holds **shared / cross-cutting runtime state** only. Truly component-local UI state
stays `useState`:

| Put in the store | Keep as local `useState` |
|---|---|
| cart, checkout draft, selected store, session/account, service booking, cross-view modal flags | a single input's focus/value, hover, a one-off modal's own draft, animation ticks scoped to one component |

"Good practice" is **not** "everything in the store." When in doubt: if two unrelated
components need it, or an action mutates it, it belongs in a slice.

## Migration strategy — the in-place bridge

Each domain migrates behavior-preservingly, in two separable commits:

1. **Relocate state.** Move `const [x, setX] = useState()` into the slice, then in the shell
   write `const x = useStorefrontStore((s) => s.domain.x)` and route `setX` → the slice action,
   **keeping the same local name `x`**. The large render tree and handlers keep referencing `x`
   unchanged → a minimal, reviewable diff, no behavior change.
2. **Collapse props.** Once the state lives in a slice, extract the JSX zones that read it into
   components that pull from the store via selectors (props drop to ~zero).

## Middleware

- **devtools** — on now, dev-guarded (`import.meta.env.DEV`); harmless in prod/tests.
- **persist** — added in **Wave 3** wrapping the migrated `cart` slice only
  (`partialize: (s) => ({ cart: s.cart })`), replacing the standalone
  `useStorefrontCartPersistence` hook. Not enabled before then.
- **immer** — intentionally *not* used: it is not a repo dependency, and the inventory store
  doesn't use it. Nested updates use explicit spread, matching `frontend/src/store/useStore.js`.

## Out of scope

- **Map/discovery runtime** (viewport, markers, clustering) — develop's map modules are the
  source of truth; `discoverySlice` only holds list/filter wiring, never map state.
- The inventory app's `frontend/src/store/useStore.js` — untouched.

## Migration waves

| Wave | Scope | Risk | Gate |
|---|---|---|---|
| 0 | scaffold + this doc + `ui` reference slice | low | build/lint/unit |
| 1 | migrate `session`, `ui`, `discovery`-wiring, `catalog` read paths | low–med | QA: session/modals/discovery |
| 2 | extract presentational JSX zones reading the store | low (view-only) | QA: render smoke |
| 3 | migrate `cart`, `checkout`, `serviceBooking` (money paths) + cart persist | **high** | **QA: COD checkout, cart, quote, OTP, booking — blocks merge** |
| 4 | route containers + thin shell (`StorefrontApp.jsx` → ~300–500 lines) | high | QA: full regression |
