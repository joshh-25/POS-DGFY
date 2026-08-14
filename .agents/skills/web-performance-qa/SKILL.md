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
POS-DGFY is structured as a React multi-app workspace with one backend Express API:

* **Backend API**: `backend/` (runs on `http://localhost:5000`)
  * Resolves separate tenant databases via the `x-company-token` header.
* **Skupervisor (IMS Admin)**: `apps/dgfy-web/apps/skupervisor` (runs on `http://localhost:5173`)
  * Bootstrapped via `apps/dgfy-web/apps/skupervisor/src/main.jsx` (which imports `apps/dgfy-web/src/main.jsx`).
* **Standalone POS (Cashier PWA)**: `apps/dgfy-web/apps/pos` (runs on `http://localhost:5174`)
  * Dedicated cashier shell and PWA manifest.
* **Storefront (Customer Store)**: `apps/dgfy-web/apps/store` (runs on `http://localhost:5175`)
  * Public e-commerce portal (F&B / Hospitality bookings).
* **Communication**:
  * Shared state & tokens between Skupervisor and POS are synced via a `BroadcastChannel` named `auth-channel` (defined in `apps/dgfy-web/src/services/api.js`).
  * Storefront customer session states must remain separated from staff tokens.

---

## 3. Standard Inspection Checklist
Before modifying or debugging test specs, check:
1. `apps/dgfy-web/package.json` and `backend/package.json` for script names.
2. `apps/dgfy-web/apps/*/vite.config.js` for custom configs and proxy rules.
3. `apps/dgfy-web/src/services/api.js` for Axios configurations and session key references.
4. `apps/dgfy-web/playwright.config.js` and `.env` parameters.

---

## 4. Playwright E2E Testing Config
* **Location**: All tests must be stored under `apps/dgfy-web/tests/e2e/`.
* **Execution Constraint**: **Strictly Local**. Never configure GitHub Actions or cloud triggers. Use `workers: 1` locally to prevent database locks and race conditions.
* **Fixtures**: Configure multiple base URLs through Playwright project settings or inline helpers.
* **Target URLs**:
  * Skupervisor: `SKUPERVISOR_URL` / `http://localhost:5173`
  * POS: `POS_URL` / `http://localhost:5174`
  * Storefront: `STOREFRONT_URL` / `http://localhost:5175`
* **Test Credentials**: Loaded strictly from `.env` keys (`TEST_EMAIL`, `TEST_PASSWORD`, `TEST_ADMIN_EMAIL`, etc.).

---

## 5. Required Local scripts (in apps/dgfy-web/package.json)
```json
"test:e2e": "playwright test",
"test:e2e:headed": "playwright test --headed",
"test:e2e:ui": "playwright test --ui",
"test:e2e:report": "playwright show-report",
"test:e2e:skupervisor": "playwright test tests/e2e/skupervisor",
"test:e2e:pos": "playwright test tests/e2e/pos",
"test:e2e:store": "playwright test tests/e2e/store",
"test:e2e:cross-app": "playwright test tests/e2e/cross-app",
"test:e2e:security": "playwright test tests/e2e/security",
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
