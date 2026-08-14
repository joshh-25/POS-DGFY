# @sieitzz/web-core

Shared frontend trunk extracted from the former monolithic `apps/dgfy-web` package
(issue [#322](https://github.com/Sieitzz/dgfy-platform/issues/322)). Consumed by
`apps/dgfy-ims`, `apps/dgfy-pos`, and `apps/dgfy-storefront` via
`"@sieitzz/web-core": "file:../../packages/web-core"`, the same pattern used by
`packages/shared-constants` and `packages/pos-receipt`.

## Contents

- `src/` — services, hooks, observability clients, shared UI components, utils, and
  `src/features/` (including the POS terminal feature, mounted by both `dgfy-pos` and
  `dgfy-ims`)
- `Components/` — the shadcn/UI primitive library plus shared domain components
- `Pages/` — the four DGFY account pages POS also lazy-loads
  (`DgfyAuthPage`, `DgfyCompanySelect`, `RegisterCompany`, `CompanyRegistrationStatus`)
- `vite/sentryViteConfig.js` — the shared Sentry Vite plugin factory

## What this package deliberately does not have

**No `node_modules`, no lockfile, no build step.** This is a plain-ESM source package —
consuming apps import its files directly (via `vite`'s `resolve.alias`, mapping
`@sieitzz/web-core/*` onto this package's source, or via the `exports` map for Node
consumers like `apps/dgfy-api/tests/`). All bare specifiers used inside this package
(`react`, `react-router-dom`, `radix-ui`, etc.) resolve against the **consuming app's**
`node_modules` — this package only lists them as `peerDependencies` to document the
requirement, never as `dependencies`. That guarantees a single React instance across the
whole app; installing this package's own copy of React would break that guarantee.

Do not run `npm install` inside `packages/web-core/`.

## Import convention

From inside a consuming app:

```js
import { login } from '@sieitzz/web-core/services/authService.js';
import { Button } from '@sieitzz/web-core/Components/ui/button';
import DgfyAuthPage from '@sieitzz/web-core/Pages/DgfyAuthPage.jsx';
```

From inside this package, imports stay relative (`../services/x.js`, `./ui/button.jsx`) —
the internal directory layout mirrors the old `apps/dgfy-web` root exactly so those
relative imports never needed to change during the split.
