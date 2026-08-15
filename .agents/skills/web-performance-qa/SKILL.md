---
name: web-performance-qa
description: Local-only QA, E2E, performance, load, and security testing procedures for the dgfy-platform multi-app codebase — Playwright E2E, Lighthouse CI, k6 load checks, and local security verification (input validation, protected-route redirects, security headers). Use whenever a task involves testing across Skupervisor/POS/Storefront, cross-app communication, or multi-tenant queries.
---

# Web Performance, QA & Security Testing Skill

**Portability**: this file was previously Codex-only (`.codex/skills/`) with no frontmatter, so it
was invisible to Claude Code and unusable by this repo's `.agents/skills/` gate
(`scripts/check-agent-surfaces.js`, #442). Moved to the canonical location and given `name`/
`description` so every tool that reads `.agents/skills/` can discover it, matching the other roles.

This skill defines the canonical local-only QA, E2E, performance, load, and security testing procedures for the POS-DGFY multi-app codebase.

---

## 1. Activation Rules
Activate this skill whenever a query or task involves:
* Playwright E2E / Functional testing
* Skupervisor, POS, or Storefront UI/routing verification
* Cross-app communication (`BroadcastChannel`, `localStorage`, cookies)
* Multi-tenancy database queries (`x-company-token`)
* Lighthouse CI / Local Performance Audits
* k6 local stress / API load checks
* Local security verification (Input validation, protected routes redirection, security headers audit)

---

## 2. Project Architecture & Ports
POS-DGFY is structured as three independently deployable frontend apps (issue #322 split them out
of the former single `apps/dgfy-web` package) sharing one trunk package, plus one backend Express
API:

* **Backend API**: `apps/dgfy-api/` (runs on `http://localhost:5000`)
  * Resolves separate tenant databases via the `x-company-token` header.
* **Shared frontend trunk**: `packages/web-core/` (`@sieitzz/web-core`) — no build step, no
  `node_modules` of its own; every app below depends on it via a `file:` dependency + Vite alias.
* **Skupervisor (IMS Admin)**: `apps/dgfy-ims` (runs on `http://localhost:5173`)
  * Bootstrapped via `apps/dgfy-ims/src/main.jsx` (which imports shared trunk code from
    `@sieitzz/web-core/...`).
* **Standalone POS (Cashier PWA)**: `apps/dgfy-pos` (runs on `http://localhost:5174`)
  * Dedicated cashier shell and PWA manifest, plus its own Electron desktop shell
    (`apps/dgfy-pos/desktop/pos-electron`).
* **Storefront (Customer Store)**: `apps/dgfy-storefront` (runs on `http://localhost:5175`)
  * Public e-commerce portal (F&B / Hospitality bookings).
* **Communication**:
  * Shared state & tokens between Skupervisor and POS are synced via a `BroadcastChannel` named
    `auth-channel` (defined in `packages/web-core/src/services/api.js`).
  * Storefront customer session states must remain separated from staff tokens.

---

## 3. Standard Inspection Checklist
Before modifying or debugging test specs, check:
1. Each app's own `package.json` (`apps/dgfy-ims/`, `apps/dgfy-pos/`, `apps/dgfy-storefront/`) and
   `apps/dgfy-api/package.json` for script names — there is no longer one shared frontend
   `package.json`.
2. Each app's own `vite.config.js` for custom configs, proxy rules, and its `@sieitzz/web-core/*`
   alias.
3. `packages/web-core/src/services/api.js` for Axios configurations and session key references.
4. Each app's own `playwright.config.js` and `.env` parameters; `tests/frontend-cross-app/`'s
   `playwright.config.js` for multi-app specs.

---

## 4. Playwright E2E Testing Config
* **Location**: Single-app tests live under each app's own `tests/e2e/`
  (`apps/dgfy-ims/tests/e2e/`, `apps/dgfy-pos/tests/e2e/`, `apps/dgfy-storefront/tests/e2e/`).
  Specs that exercise more than one app at once (cross-app communication, session sync) live in
  `tests/frontend-cross-app/tests/e2e/`, which has its own `package.json`.
* **Execution Constraint**: **Strictly Local**. Never configure GitHub Actions or cloud triggers. Use `workers: 1` locally to prevent database locks and race conditions.
* **Fixtures**: Configure multiple base URLs through Playwright project settings or inline helpers.
* **Target URLs**:
  * Skupervisor: `SKUPERVISOR_URL` / `http://localhost:5173`
  * POS: `POS_URL` / `http://localhost:5174`
  * Storefront: `STOREFRONT_URL` / `http://localhost:5175`
* **Test Credentials**: Loaded strictly from `.env` keys (`TEST_EMAIL`, `TEST_PASSWORD`, `TEST_ADMIN_EMAIL`, etc.).

---

## 5. Required Local scripts
Each app now has its own `test:e2e*` scripts in its own `package.json`
(`apps/dgfy-ims/package.json`, `apps/dgfy-pos/package.json`, `apps/dgfy-storefront/package.json`),
plus a `test:security` script running that app's own `tests/e2e/security*` specs:
```json
"test:e2e": "playwright test",
"test:e2e:headed": "playwright test --headed",
"test:e2e:ui": "playwright test --ui",
"test:e2e:report": "playwright show-report",
"test:security": "playwright test tests/e2e/security-auth.spec.js tests/e2e/security-input.spec.js tests/e2e/security-headers.spec.js"
```

Cross-app E2E, Lighthouse, and k6 load checks live in `tests/frontend-cross-app/package.json`
instead (its `webServer` config boots `apps/dgfy-api` plus all three frontend apps):
```json
"test:e2e": "playwright test",
"test:e2e:headed": "playwright test --headed",
"test:e2e:ui": "playwright test --ui",
"test:e2e:report": "playwright show-report",
"test:lighthouse": "lhci autorun",
"test:load": "k6 run tests/load/smoke-load.js",
"test:load:api": "k6 run tests/load/api-load.js"
```

---

## 6. Testing Guidelines

### A. Skupervisor (IMS)
* Confirm correct routing, dashboard tables, cards, sidebar links, settings modules, and check for blank screens or React console crashes.

### B. Standalone POS
* Verify catalog loading, barcode keypress capture (`POSBarcodeScanner.jsx`), current sale pricing updates, payment selection, and receipts layout. Avoid committing actual database transaction changes unless using sandbox tenant modes.

### C. Storefront
* Verify public landing page renders, booking inputs are validated on submission, and ensure customer session variables do not leak or contain cashier tokens.

### D. Cross-App & Session Sync
* Open multiple Playwright contexts to simulate Skupervisor and POS running simultaneously.
* Assert that triggering a logout or firing a `session-expired` event over the `auth-channel` `BroadcastChannel` instantly locks down the POS page.

### E. Defensive Security Tests
* **Form Inputs**: Verify that forms reject or safely sanitize inputs (SQL-injection string patterns without spaces to bypass client-side email check filters).
* **Protected Routes**: Verify unauthenticated hits to `/items`, `/settings`, and `/pos` redirect to `/login`.
* **Headers**: Verify presence of CSP, `X-Content-Type-Options`, and frame policies. Log warning alerts instead of failing tests if not provided by local Vite development hosts.

### F. Performance & Load
* **Lighthouse CI**: Audit production preview bundles of the 3 apps locally. Track Layout Shifts, best practices, and PWA checklists.
* **k6 load checks**: Keep local load constraints low (smoke test scale) targeting local backend API endpoints. Do not run high concurrent stress patterns.
