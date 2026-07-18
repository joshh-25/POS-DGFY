---
status: reference
authority_level: reference
owner: planning
last_reviewed: 2026-07-10
last_mapped_commit: c19885a7ca2f17474adc1b825eb94aa739bf9f27
applies_to: testing_patterns
topic: codebase_quality_map
---

# Testing Patterns

**Analysis Date:** 2026-07-10

## Test Framework

**Runner:**
- Backend: Jest 29 with ESM support, configured in `backend/jest.config.cjs` and executed by `backend/package.json`.
- Standalone DGFY API: Jest 29 style config in `apps/dgfy-api/jest.config.cjs`.
- Frontend unit/component/contract tests: Vitest 4 via `frontend/package.json` (`"test": "vitest run"`).
- Browser E2E: Playwright via `frontend/playwright.config.js`, with `testDir: './tests/e2e'`, `workers: 1`, and `fullyParallel: false`.
- Script tests: Node test runner for release/deploy controller scripts, invoked by root scripts such as `npm run test:deploy-contract`, `npm run test:merge-adoption`, `npm run test:development-to-production`, and `npm run test:release-controller` in `package.json`.

**Assertion Library:**
- Backend Jest uses Jest `expect` and `jest.fn()` from `@jest/globals`, as in `backend/tests/alertsUsecases.applicationResult.test.js`.
- Frontend uses Vitest `expect`, `vi`, React Testing Library, `@testing-library/user-event`, and `axios-mock-adapter`, as in `frontend/src/components/common/__tests__/NumberStepper.behavior.test.jsx` and `frontend/src/services/__tests__/api.interceptor.test.js`.
- Playwright E2E uses `@playwright/test`, as in `frontend/tests/e2e/skupervisor/auth.spec.js`.

**Run Commands:**
```bash
npm test                              # Root frontend + backend suites
npm run test:frontend                 # Frontend Vitest suite
npm run test:frontend:contracts       # Focused frontend contract gate
npm run test:backend                  # Backend Jest suite
npm run test:backend:matrix           # Backend release matrix with schema preflight
npm --prefix backend run test:watch   # Backend Jest watch mode
npm --prefix backend run test:coverage # Backend Jest coverage
npm --prefix frontend run test:e2e    # Playwright local E2E
npm --prefix frontend run test:e2e:headed # Headed Playwright with one worker
npm --prefix frontend run test:e2e:ui # Playwright UI mode
npm run check:architecture            # Architecture guardrails + controller boundaries
npm run lint:docs                     # Governed docs metadata/link lint
```

## Test File Organization

**Location:**
- Backend tests are centralized in `backend/tests/`; 334 backend Jest test files were detected.
- Standalone DGFY API tests are centralized in `apps/dgfy-api/tests/`; 3 Jest test files were detected.
- Frontend tests are co-located under surface directories in `__tests__` folders and under Playwright E2E folders; 166 frontend `.test.*`/`.spec.*` files were detected outside `node_modules`.
- Playwright E2E tests live under `frontend/tests/e2e/` with subfolders for `skupervisor`, `pos`, `store`, `cross-app`, and `security`.
- Script tests live beside root scripts under `scripts/*.test.js` and under `release-controller/test/`.

**Naming:**
- Backend test names encode proof type: `.transport.test.js`, `.applicationResult.test.js`, `.db.integration.test.js`, `.integration.test.js`, `.contract.test.js`, `.hardening.test.js`, `.middleware.test.js`, `.migration.test.js`, `.legacy.test.js`.
- Frontend test names encode user-facing intent: `.behavior.test.jsx`, `.contract.test.js`, `.integration.test.jsx`, `.guard.test.js`, `.render.test.jsx`, `.a11y.test.jsx`.
- Playwright tests use `.spec.js`, for example `frontend/tests/e2e/security/security-auth.spec.js`.
- Legacy payment tests use `.legacy.test.js` and are ignored by default through `backend/jest.config.cjs`.

**Structure:**
```text
backend/tests/
├── <domain>Usecases.applicationResult.test.js
├── <domain>Handlers.transport.test.js
├── <domain>.db.integration.test.js
└── <script-or-policy>.integration.test.js

frontend/src/**/__tests__/
├── <Component>.behavior.test.jsx
├── <service>.contract.test.js
└── <flow>.integration.test.jsx

frontend/tests/e2e/
├── skupervisor/*.spec.js
├── pos/*.spec.js
├── store/*.spec.js
├── cross-app/*.spec.js
└── security/*.spec.js
```

## Test Structure

**Suite Organization:**
```javascript
import { jest } from '@jest/globals';
import { buildGenerateAlertsUseCase } from '../src/modules/alerts/usecases/generateAlertsUseCase.js';

describe('alerts use-cases application result contract', () => {
  it('wraps alert service result in success envelope', async () => {
    const useCase = buildGenerateAlertsUseCase({
      alertService: { generateAlerts: jest.fn().mockResolvedValue([{ type: 'LOW_STOCK' }]) }
    });

    const result = await useCase();
    expect(result).toEqual({
      success: true,
      data: [{ type: 'LOW_STOCK' }],
      error: null,
      message: null
    });
  });
});
```

**Patterns:**
- Use-case tests should inject fake dependencies into builder functions and assert `ApplicationResult` shape, as in `backend/tests/alertsUsecases.applicationResult.test.js`.
- Transport tests should mock module exports, dynamically import handlers after mocks, create fake `req/res/next`, and assert status/payload/headers, as in `backend/tests/posHandlers.transport.test.js`.
- DB integration tests should isolate tenant databases when migrations and transactional persistence are the behavior under test, as in `backend/tests/posCheckout.db.integration.test.js`.
- Frontend component tests that need DOM should include `/** @vitest-environment jsdom */` and clean up after each test, as in `frontend/src/components/common/__tests__/NumberStepper.behavior.test.jsx`.
- Frontend service tests that depend on module-level state should use `vi.resetModules()` and dynamic import, as in `frontend/src/services/__tests__/api.interceptor.test.js`.
- Playwright E2E tests should use `test.describe`, one worker, local app servers, and surface-specific folders, as configured in `frontend/playwright.config.js`.

## Mocking

**Framework:** Jest mocks for backend; Vitest mocks for frontend; Playwright browser contexts for E2E; `axios-mock-adapter` for frontend API interceptors.

**Patterns:**
```javascript
const mockListPosCatalogUseCase = jest.fn();

jest.unstable_mockModule('../src/modules/pos/index.js', () => ({
  listPosCatalogUseCase: mockListPosCatalogUseCase
}));

beforeAll(async () => {
  const mod = await import('../src/modules/pos/controllers/posHandlers.js');
  listCatalog = mod.listCatalog;
});
```

```javascript
vi.mock('../api.js', () => ({
  default: { get: vi.fn(), post: vi.fn() }
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
```

**What to Mock:**
- Mock repositories/services when testing use-case branching and error mapping, as in `backend/tests/alertsUsecases.applicationResult.test.js`.
- Mock module index exports when testing transport-only handlers, as in `backend/tests/posHandlers.transport.test.js`.
- Mock browser globals (`window`, `document`, `localStorage`, `BroadcastChannel`, `fetch`) when testing frontend session behavior, as in `frontend/src/services/__tests__/api.interceptor.test.js`.
- Mock heavy browser-only libraries in jsdom tests, for example MapLibre in `frontend/src/components/maps/__tests__/MapPinPicker.maplibre.test.jsx`.

**What NOT to Mock:**
- Do not mock the database in DB integration suites that prove migrations, tenant schemas, transactions, or persistence side effects, for example `backend/tests/posCheckout.db.integration.test.js`.
- Do not mock Playwright page navigation/rendering in E2E suites under `frontend/tests/e2e/`; these exist to prove rendered app behavior.
- Do not replace architecture guardrail scripts with mocks in compliance tests such as `backend/tests/architectureGuardrailsScript.integration.test.js` and `backend/tests/controllerBoundaryScript.integration.test.js`.

## Fixtures and Factories

**Test Data:**
```javascript
const createIsolatedDbName = () => (
  `test_pos_checkout_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
);

const createRes = () => {
  const res = {
    locals: {},
    status: jest.fn(),
    json: jest.fn(),
    send: jest.fn(),
    setHeader: jest.fn()
  };
  res.status.mockReturnValue(res);
  res.send.mockReturnValue(res);
  return res;
};
```

**Location:**
- Backend shared setup is `backend/tests/setup.js`; it provides deterministic Redis mocking and sets `NODE_ENV=test`.
- Backend teardown is `backend/tests/globalTeardown.cjs`; it closes AI cleanup, tenant connectors, Redis, and Sequelize connections best-effort.
- Test-specific factories are usually local to the spec file, such as `createCashier`, `createFinishedGood`, and `createFifoBatch` in `backend/tests/posCheckout.db.integration.test.js`.
- Frontend test wrappers and browser stubs are generally local to each test file, such as `StatefulStepper` in `frontend/src/components/common/__tests__/NumberStepper.behavior.test.jsx`.

## Coverage

**Requirements:** No numeric coverage threshold is enforced in detected configs. `backend/jest.config.cjs` defines `collectCoverageFrom: ['src/**/*.js', '!src/config/*.js', '!src/seeders/*.js']`, but no `coverageThreshold`.

**View Coverage:**
```bash
npm --prefix backend run test:coverage
```

## Test Types

**Unit Tests:**
- Backend unit tests cover validators, policies, use-cases, middleware, and small utilities, for example `backend/tests/onboardingValidator.test.js`, `backend/tests/posDiscountCalculator.unit.test.js`, and `backend/tests/passwordValidation.test.js`.
- Frontend unit tests cover pure helpers and view-model logic, for example `frontend/apps/store/src/__tests__/catalogSearch.test.js`, `frontend/apps/store/src/__tests__/checkoutRules.test.js`, and `frontend/src/utils/__tests__/tenantCapabilityMessages.test.js`.

**Contract Tests:**
- Backend contract tests preserve module exports, route mounts, fiscal/payment/POS contracts, and transport payloads, for example `backend/tests/authModuleExports.contract.test.js`, `backend/tests/commercePaymentRouteMount.contract.test.js`, and `backend/tests/posGovernedDiscountLineId.contract.test.js`.
- Frontend contract tests preserve API/service/UI integration expectations, for example `frontend/src/services/__tests__/adminService.adminOperations.contract.test.js`, `frontend/src/features/pos/__tests__/terminalPairing.contract.test.js`, and `frontend/apps/store/src/__tests__/geoSearchIntegration.contract.test.js`.

**Integration Tests:**
- Backend integration tests use Supertest, real Sequelize/MySQL setups, migration execution, or script execution depending on the risk, for example `backend/tests/adminTenantLifecycle.integration.test.js`, `backend/tests/billingScheduler.db.integration.test.js`, and `backend/tests/auditIndexesScript.integration.test.js`.
- Frontend integration tests use jsdom plus React Testing Library to exercise composed surfaces, for example `frontend/src/pages/__tests__/TenantManager.capabilities.integration.test.jsx` and `frontend/apps/store/src/__tests__/discoveryHeaderAccount.integration.test.jsx`.

**E2E Tests:**
- Playwright E2E tests are under `frontend/tests/e2e/` and cover Skupervisor, POS, Storefront, cross-app session sync, performance smoke, and security checks.
- Backend browser E2E Jest suites are opt-in through `RUN_BROWSER_E2E=true` scripts in `backend/package.json`, for example `test:frontend-session-e2e` and `test:frontend-ims-pos-sales-e2e`.

**Release/Quality Gates:**
- `docs/testing/README.md` defines mandatory evidence gates for dependency audits, browser session security, PayMongo webhook security, production env validation, DGFY company access, frontend contracts, backend matrix, frontend bundle budgets, MapLibre picker runtime, Storefront public visibility, and POS UAT.
- Architecture-sensitive changes must include `npm run check:architecture` evidence per `docs/architecture/ARCHITECTURE_GOVERNANCE.md`.
- Local-only Playwright/Lighthouse/k6/security constraints are defined in `.codex/skills/web-performance-qa/SKILL.md` and `docs/testing/local-testing-guide.md`.

## Common Patterns

**Async Testing:**
```javascript
it('maps alert service failures to domain error contract', async () => {
  const useCase = buildGenerateAlertsUseCase({
    alertService: {
      generateAlerts: jest.fn().mockRejectedValue(new Error('Alerts unavailable'))
    }
  });

  const result = await useCase();
  expect(result.success).toBe(false);
  expect(result.error.code).toBe(DomainErrorCode.INTERNAL_ERROR);
});
```

**Error Testing:**
```javascript
mockListPosTransactionsUseCase.mockResolvedValue({
  success: false,
  error: {
    code: 'VALIDATION_FAILED',
    message: 'query must be an object',
    details: null,
    statusCode: 400
  }
});

await listTransactions(req, res, next);
expect(res.status).toHaveBeenCalledWith(400);
expect(next).not.toHaveBeenCalled();
```

**Rendered Interaction Testing:**
```javascript
const user = userEvent.setup();
render(<StatefulStepper initialValue={2} />);

const input = screen.getByRole('spinbutton');
await user.click(screen.getByRole('button', { name: /increase value/i }));
expect(input.value).toBe('3');
```

## Documentation-Driven Test Selection

- For authentication, registration, invitations, account lifecycle, payment, checkout, tenant provisioning, or cross-boundary workflows, follow the hardening proof list in `docs/architecture/ARCHITECTURE_GOVERNANCE.md`.
- For backend auth, payment, compliance, POS/fiscal, tenant provisioning, storefront, inventory, reporting, AI tools, database integration, or platform services, use `npm run test:backend:matrix` per `docs/testing/README.md`.
- For Storefront discovery, DGFY account surfaces, admin auth, hospitality mode, F&B POS/storefront behavior, PO receipt valuation, marker rendering, or follow controls, use `npm run test:frontend:contracts` plus `npm run test:frontend` per `docs/testing/README.md`.
- For local rendered QA, use app servers and commands from `docs/testing/local-testing-guide.md`: backend `http://localhost:5000`, Skupervisor `http://localhost:5173`, POS `http://localhost:5174`, Storefront `http://localhost:5175`.

---

*Testing analysis: 2026-07-10*
