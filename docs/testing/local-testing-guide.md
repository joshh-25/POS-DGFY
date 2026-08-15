# POS-DGFY Local Testing & Quality Assurance Guide

This document details how to run, inspect, and generate E2E, performance, load, and security tests for the POS-DGFY multi-app codebase locally on your machine.

---

## 💻 1. App Development Environments Setup
Before executing any test suites, verify that your local development servers are running:

Each frontend surface is its own Vite package (issue #322 split); there is no single frontend
package left. Run each from the repo root, or `cd` into the app itself:

* **Backend API**: `cd backend && npm run dev` (starts API on `http://localhost:5000`)
* **Skupervisor (IMS)**: `npm run dev:skupervisor` from the root, or `cd apps/dgfy-ims && npm run dev` (starts IMS on `http://localhost:5173`)
* **Standalone POS (Cashier)**: `npm run dev:pos` from the root, or `cd apps/dgfy-pos && npm run dev` (starts POS on `http://localhost:5174`)
* **Storefront (Customer)**: `npm run dev:store` from the root, or `cd apps/dgfy-storefront && npm run dev` (starts Storefront on `http://localhost:5175`)

All three apps consume the shared trunk from `packages/web-core` (`@sieitzz/web-core`) via a
`file:` dependency plus a Vite alias. It has no build step of its own — editing a file under
`packages/web-core/` is picked up by whichever app dev server is running.

*Alternatively, run `npm run dev` from the project root to run the backend, device-bridge, and the
IMS dev server concurrently, or `npm run dev:local-pos-stack` to run the backend, device-bridge,
and all three frontend dev servers at once.*

---

## 🎭 2. Playwright E2E & Cross-App Tests

E2E specs live next to the app they exercise, and each app owns its own `playwright.config.js`:

* `apps/dgfy-ims/tests/e2e/` — Skupervisor (IMS)
* `apps/dgfy-pos/tests/e2e/` — Standalone POS
* `apps/dgfy-storefront/tests/e2e/` — Customer Storefront
* `tests/frontend-cross-app/tests/e2e/` — multi-surface specs that drive more than one app at once

There is no single aggregate `test:e2e:<surface>` script anymore. Pick the package whose surface you
want and run its own scripts.

### Commands List
Run these from the app you want to test — `apps/dgfy-ims/`, `apps/dgfy-pos/`, or
`apps/dgfy-storefront/`. All three expose the same script names:

1. **Terminal Test Run (Headless)**:
   ```bash
   npm run test:e2e
   ```
2. **Headed Browser Test Run (Watch tests run)**:
   ```bash
   npm run test:e2e:headed
   ```
3. **Open Playwright Interactive UI App**:
   ```bash
   npm run test:e2e:ui
   ```
4. **View HTML Test Run Report**:
   ```bash
   npm run test:e2e:report
   ```
5. **Run Security & Form Input Tests** (the security suite currently lives in `apps/dgfy-ims/tests/e2e/security/` only; POS and Storefront declare a `test:security` script but ship no security specs yet):
   ```bash
   cd apps/dgfy-ims
   npm run test:security
   ```

Cross-app work lives in its own package:

6. **Run Cross-App / BroadcastChannel Sync Tests**:
   ```bash
   cd tests/frontend-cross-app
   npm run test:e2e
   ```

Unit/component tests (Vitest) are also per app — `cd apps/dgfy-ims && npm test` (the root
`npm run test:frontend` maps here), `cd apps/dgfy-pos && npm test`, or
`cd apps/dgfy-storefront && npm test`. Specs for shared `packages/web-core` code are run by
whichever app package owns them.

---

## 🤖 3. Generate New Tests Visually (Codegen)
You can use Playwright's built-in code generator to record actions and click paths on your local surfaces to auto-generate test code:

* **Record for Skupervisor**:
  ```bash
  npx playwright codegen http://localhost:5173
  ```
* **Record for Standalone POS**:
  ```bash
  npx playwright codegen http://localhost:5174
  ```
* **Record for Customer Storefront**:
  ```bash
  npx playwright codegen http://localhost:5175
  ```

---

## ⚡ 4. Lighthouse CI (Local Auditing)
Audit Layout Shifts, Core Web Vitals, and PWA configurations locally. Lighthouse CI lives in the
`tests/frontend-cross-app/` package and drives the per-app `preview` servers, so the apps it audits
must already be built on disk (each app builds into its own `apps/<app>/dist/`; there is no shared
`build:all` script anymore):

1. Build the surfaces you want audited, from the repo root:
   ```bash
   npm run build:skupervisor
   npm run build:store
   ```
   `tests/frontend-cross-app/lighthouserc.js` collects `http://localhost:5173/login` from IMS
   always, and adds a storefront URL on `http://localhost:5175/` only when `E2E_STORE_SLUG` names a
   real seeded tenant. `npm run build:pos` is only needed if you extend that config to POS.
2. Run Lighthouse CI audits:
   ```bash
   cd tests/frontend-cross-app
   npm run test:lighthouse
   ```

---

## 🚀 5. k6 Local Load Testing
Target your local backend API using safe, low concurrent stress scripts. These also live in
`tests/frontend-cross-app/`:

* **General API Smoke Load**:
  ```bash
  cd tests/frontend-cross-app
  npm run test:load
  ```
* **Endpoints Profiling**:
  ```bash
  cd tests/frontend-cross-app
  npm run test:load:api
  ```

---

## ⚠️ Safe Local Testing Constraints
* **No Cloud CI Pipelines**: Do not build GitHub Actions workflows or upload telemetry metrics to public remote servers.
* **No Destructive Security/Load Checks**: Restrict all security test forms input injections and k6 stress limits to local development databases only. Do not trigger sweeps against production or hosting providers.
