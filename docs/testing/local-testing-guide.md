# POS-DGFY Local Testing & Quality Assurance Guide

This document details how to run, inspect, and generate E2E, performance, load, and security tests for the POS-DGFY multi-app codebase locally on your machine.

---

## 💻 1. App Development Environments Setup
Before executing any test suites, verify that your local development servers are running:

* **Backend API**: `cd backend && npm run dev` (starts API on `http://localhost:5000`)
* **Skupervisor (IMS)**: `cd frontend && npm run dev:skupervisor` (starts IMS on `http://localhost:5173`)
* **Standalone POS (Cashier)**: `cd frontend && npm run dev:pos` (starts POS on `http://localhost:5174`)
* **Storefront (Customer)**: `cd frontend && npm run dev:store` (starts Storefront on `http://localhost:5175`)

*Alternatively, run `npm run dev` from the project root to run the entire backend, device-bridge, and frontend servers concurrently.*

---

## 🎭 2. Playwright E2E & Cross-App Tests

All E2E tests are stored under `frontend/tests/e2e/`.

### Commands List
Run these commands from the `frontend/` directory:

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
5. **Run Only Skupervisor (IMS) Tests**:
   ```bash
   npm run test:e2e:skupervisor
   ```
6. **Run Only Standalone POS Tests**:
   ```bash
   npm run test:e2e:pos
   ```
7. **Run Only Customer Storefront Tests**:
   ```bash
   npm run test:e2e:store
   ```
8. **Run Cross-App / BroadcastChannel Sync Tests**:
   ```bash
   npm run test:e2e:cross-app
   ```
9. **Run Security & Form Input Tests**:
   ```bash
   npm run test:e2e:security
   ```

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
Audit Layout Shifts, Core Web Vitals, and PWA configurations locally:

1. Build preview versions:
   ```bash
   npm run build:all
   ```
2. Run Lighthouse CI audits:
   ```bash
   npm run test:lighthouse
   ```

---

## 🚀 5. k6 Local Load Testing
Target your local backend API using safe, low concurrent stress scripts:

* **General API Smoke Load**:
  ```bash
  npm run test:load
  ```
* **Endpoints Profiling**:
  ```bash
  npm run test:load:api
  ```

---

## ⚠️ Safe Local Testing Constraints
* **No Cloud CI Pipelines**: Do not build GitHub Actions workflows or upload telemetry metrics to public remote servers.
* **No Destructive Security/Load Checks**: Restrict all security test forms input injections and k6 stress limits to local development databases only. Do not trigger sweeps against production or hosting providers.
