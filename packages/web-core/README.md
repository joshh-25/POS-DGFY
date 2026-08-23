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
consuming apps import its files directly. All bare specifiers used inside this package
(`react`, `react-router-dom`, `radix-ui`, etc.) resolve against the **consuming app's**
`node_modules` — this package only lists them as `peerDependencies` to document the
requirement, never as `dependencies`. That guarantees a single React instance across the
whole app; installing this package's own copy of React would break that guarantee.

Do not run `npm install` inside `packages/web-core/`.

## Import convention

**Corrected 2026-08-23 (issue #914).** The `exports` map below does let a `@sieitzz/web-core/*`
specifier resolve — and Node consumers like `apps/dgfy-api/tests/` do use it that way — but no
Vite app config aliases that specifier, and no app source actually imports web-core that way.
What app code actually uses is two mechanisms, both already in place before this correction:

1. **Retargeted `@/...` aliases.** The alias *keys* are unchanged from the pre-split
   `apps/dgfy-web` era; only their *targets* moved. Each consuming app's `vite.config.js`
   points `@/components`, `@/hooks`, `@/lib`, `@/services`, and `@/src` at this package
   (`apps/dgfy-ims` and `apps/dgfy-pos` also alias `@/Pages` and bare `@/`, but at their own
   app-local `Pages/`/root, not at web-core):
   ```js
   import { login } from '@/services/authService.js';
   import { Button } from '@/components/ui/button';
   ```
2. **Deep relative imports**, mainly from each app's own entry point, in the shape
   `../../../packages/web-core/src/...` — same depth as the pre-split `../../../src/...` import,
   with `packages/web-core/` inserted before `src/`:
   ```js
   import DgfyAuthPage from '../../../packages/web-core/Pages/DgfyAuthPage.jsx';
   ```

The `@sieitzz/web-core/*` package-specifier form below also resolves (via the `exports` map on
the `file:` dependency) if you'd rather use it going forward — it just isn't what the ~260
existing call sites do today, so don't be surprised finding the alias/relative forms instead:

```js
import { login } from '@sieitzz/web-core/services/authService.js';
import { Button } from '@sieitzz/web-core/Components/ui/button';
import DgfyAuthPage from '@sieitzz/web-core/Pages/DgfyAuthPage.jsx';
```

From inside this package, imports stay relative (`../services/x.js`, `./ui/button.jsx`) —
the internal directory layout mirrors the old `apps/dgfy-web` root exactly so those
relative imports never needed to change during the split.

**Note:** ADR 0071 clause 1 (`[binding]`) also describes resolution as happening via a
`@sieitzz/web-core/*` alias — the *decision* it governs (one shared trunk, consumed via a `file:`
dependency, no build step) is accurate; only that one stated mechanism is not what any of the
three vite configs actually do. Flagged in the PR #513 developer-transition comment rather than
silently amended here.
