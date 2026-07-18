---
status: reference
authority_level: reference
owner: planning
last_reviewed: 2026-07-10
last_mapped_commit: c19885a7ca2f17474adc1b825eb94aa739bf9f27
applies_to: coding_conventions
topic: codebase_quality_map
---

# Coding Conventions

**Analysis Date:** 2026-07-10

## Naming Patterns

**Files:**
- Backend module files use domain nouns plus layer suffixes: `backend/src/modules/pos/controllers/posHandlers.js`, `backend/src/modules/pos/usecases/posUseCases.js`, `backend/src/modules/pos/repositories/posRepository.js`.
- Backend tests encode the proof type in the filename: `backend/tests/posHandlers.transport.test.js`, `backend/tests/alertsUsecases.applicationResult.test.js`, `backend/tests/posCheckout.db.integration.test.js`, `backend/tests/authTenantIsolation.hardening.test.js`.
- Frontend component files use PascalCase for React components: `frontend/src/components/common/NumberStepper.jsx`, `frontend/src/pages/DgfyAccountManager.jsx`, `frontend/Components/users/UserInvitationModal.jsx`.
- Frontend helpers and services use camelCase filenames: `frontend/src/services/api.js`, `frontend/src/utils/errorHandler.js`, `frontend/src/features/pos/utils/setupFlow.js`.
- Frontend tests use suffixes that describe intent: `.behavior.test.jsx`, `.contract.test.js`, `.integration.test.jsx`, `.guard.test.js`, `.render.test.jsx`, as seen in `frontend/src/components/common/__tests__/NumberStepper.behavior.test.jsx` and `frontend/src/services/__tests__/browserTokenStorage.guard.test.js`.

**Functions:**
- Use camelCase for normal functions and exported helpers: `normalizeApiError` in `frontend/src/utils/errorHandler.js`, `listDiscountApprovers` in `backend/src/modules/pos/controllers/posHandlers.js`, `buildCheckoutPosUseCase` in `backend/src/modules/pos/usecases/posUseCases.js`.
- Backend use-case factories use `build*UseCase` when dependencies are injectable, as in `backend/src/modules/alerts/usecases/generateAlertsUseCase.js` and `backend/src/modules/pos/usecases/posUseCases.js`.
- Backend controllers/handlers are async Express functions with `(req, res, next)`, wrapped in `try/catch` and forwarding unexpected failures to `next(error)`, as in `backend/src/modules/pos/controllers/posHandlers.js`.
- React components use PascalCase functions or default component exports; test-only local wrappers also use PascalCase, such as `StatefulStepper` in `frontend/src/components/common/__tests__/NumberStepper.behavior.test.jsx`.

**Variables:**
- Constants use `SCREAMING_SNAKE_CASE` for fixed policy/config values: `DomainErrorCode` values in `backend/src/modules/shared/contracts/domainErrors.js`, `NON_REFRESHABLE_401_REASONS` in `frontend/src/services/api.js`, `TERMINAL_POLICY_REASON_CODES` in `backend/src/modules/pos/usecases/posUseCases.js`.
- Mutable runtime state uses descriptive camelCase: `isRefreshing`, `failedQueue`, and `iAmRefreshLeader` in `frontend/src/services/api.js`.
- Request-derived values are normalized into local camelCase names before use: `query`, `payload`, `user`, `terminalId` in `backend/src/modules/pos/controllers/posHandlers.js`.
- Test mocks use `mock*` names and are reset in setup hooks: `mockListPosCatalogUseCase` in `backend/tests/posHandlers.transport.test.js`, `mocks.adminServiceMock` in `frontend/src/pages/__tests__/TenantManager.capabilities.integration.test.jsx`.

**Types:**
- This is primarily JavaScript/JSX, not TypeScript. Type contracts are expressed through JSDoc where useful, for example `ApplicationResult<T>` in `backend/src/modules/shared/contracts/applicationResult.js`.
- Domain constants and enum-like sets use `Object.freeze()` or `Set`, for example `DomainErrorCode` in `backend/src/modules/shared/contracts/domainErrors.js`, `ONLINE_FULFILLMENT_TRANSITIONS` in `backend/src/modules/pos/usecases/posUseCases.js`, and mode/capability helpers in `frontend/src/utils/tenantCapabilityMessages.js`.

## Code Style

**Formatting:**
- No Prettier or Biome config is detected. Formatting is enforced mainly by local convention and ESLint.
- Backend files generally use 4-space indentation and semicolons, as in `backend/src/modules/pos/controllers/posHandlers.js` and `backend/src/config/logger.js`.
- Frontend files generally use 2-space indentation and semicolons in app/service/test files, as in `frontend/src/services/api.js` and `frontend/src/components/common/__tests__/NumberStepper.behavior.test.jsx`; some Vite config files omit semicolons, such as `frontend/vite.config.js`.
- Keep comments short and explanatory only for non-obvious behavior. Good examples are the token-refresh mutex notes in `frontend/src/services/api.js` and the deterministic Redis mock note in `backend/tests/setup.js`.

**Linting:**
- Backend ESLint config is `backend/eslint.config.mjs`.
- Backend lint command is `npm --prefix backend run lint`, which runs `eslint src`.
- Backend rules use `@eslint/js` recommended rules, Node globals, `ecmaVersion: 2022`, `sourceType: "module"`, `no-unused-vars: warn`, `no-console: off`, and `no-undef: error`.
- Backend controllers must not directly import models. `backend/eslint.config.mjs` applies `no-restricted-imports` to `src/controllers/**/*.js` and `src/modules/**/controllers/**/*.js`.
- Frontend ESLint config is `frontend/.eslintrc.json`.
- Frontend lint command is `npm --prefix frontend run lint`, which runs `eslint src apps --ext .js,.jsx`.
- Frontend rules extend `eslint:recommended`, `plugin:react/recommended`, and `plugin:react-hooks/recommended`; `react/react-in-jsx-scope` and `react/prop-types` are off, and `no-unused-vars` is a warning.

## Import Organization

**Order:**
1. External packages first: `axios`, `react`, `@testing-library/react`, `@jest/globals`, `vitest`, `sequelize`.
2. Internal module contracts/helpers next: `../../shared/contracts/applicationResult.js`, `../utils/errorHandler.js`, `@/services/adminService`.
3. Local same-feature modules next: `./browserSession.js`, `./sessionCleanup.js`, `../domain/posDiscountCalculator.js`.
4. Side-effect imports are rare and localized, for example CSS stubs/mocks around MapLibre tests in `frontend/src/components/maps/__tests__/MapPinPicker.maplibre.test.jsx`.

**Path Aliases:**
- Frontend alias `@` points to the frontend root in `frontend/vite.config.js` and app-specific configs such as `frontend/apps/skupervisor/vite.config.js`.
- More specific aliases map to existing legacy/current directories: `@/hooks` -> `frontend/src/hooks`, `@/components` -> `frontend/Components`, `@/Pages` -> `frontend/Pages`, `@/Entities` -> `frontend/Entities`, `@/lib` -> `frontend/src/lib`, `@/services` -> `frontend/src/services`.
- Backend imports are relative ESM imports. Preserve `.js` extensions in backend module imports, as in `backend/src/modules/pos/controllers/posHandlers.js`.

## Error Handling

**Patterns:**
- New backend use-cases return `ApplicationResult` envelopes via `ok()` and `fail()` from `backend/src/modules/shared/contracts/applicationResult.js`.
- Domain failures use `DomainError`, `DomainErrorCode`, and `resolveDomainErrorStatus` from `backend/src/modules/shared/contracts/domainErrors.js`.
- Controller responses should use `sendUseCaseResult` from `backend/src/modules/shared/controllers/useCaseResponder.js` and preserve additive API fields like `error_code`, `request_id`, and `timestamp`, as in `backend/src/modules/pos/controllers/posHandlers.js`.
- Unexpected backend errors should be passed to Express middleware with `next(error)` rather than converted ad hoc in controllers.
- Frontend API errors are normalized through `normalizeApiError` in `frontend/src/utils/errorHandler.js`; this supports both `code` and `error_code` for backend compatibility.
- Frontend global error events are emitted through `emitGlobalApiError` in `frontend/src/utils/errorHandler.js`, using `api:error`, `api:server-error`, and `tenant:capability-blocked` events.

## Logging

**Framework:** Winston on the backend; controlled console wrappers on the frontend.

**Patterns:**
- Backend logger configuration lives in `backend/src/config/logger.js`, writes console logs plus `logs/error.log` and `logs/combined.log`, and exposes `logger.stream` for Morgan.
- Backend production combined logs are warn+ to avoid high-frequency disk I/O, configured in `backend/src/config/logger.js`.
- Frontend service logging is gated in `frontend/src/services/api.js` through `logDebug`, `logWarn`, and `logError`, which suppress output in Vite test mode.
- Tests should mock logging where behavior depends on it rather than asserting real console/file output, as seen in `backend/tests/paymongoWebhookSignature.test.js`.

## Comments

**When to Comment:**
- Comment boundary-sensitive or concurrency-sensitive code, such as the single-tab token refresh mutex in `frontend/src/services/api.js`.
- Comment compatibility paths that future agents might otherwise remove, such as legacy event dispatch in `frontend/src/utils/errorHandler.js`.
- Avoid comments that restate obvious assignments. Prefer naming helper functions clearly.

**JSDoc/TSDoc:**
- Use JSDoc for reusable backend contracts in plain JavaScript, as in `backend/src/modules/shared/contracts/applicationResult.js`.
- Use focused file-level comments for complex tests where they clarify coverage intent, as in `frontend/src/services/__tests__/api.interceptor.test.js`.

## Function Design

**Size:** Keep new code smaller than legacy hotspots. Existing large use-case modules such as `backend/src/modules/pos/usecases/posUseCases.js` are policy-dense; prefer adding scoped helpers, domain utilities, or injectable builders rather than expanding monolithic branches.

**Parameters:** Use object parameters for multi-field use-cases and controller calls, for example `{ payload, user }` in `backend/src/modules/pos/controllers/posHandlers.js` and dependency bags in use-case builders like `buildGenerateAlertsUseCase` in `backend/src/modules/alerts/usecases/generateAlertsUseCase.js`.

**Return Values:** Backend use-cases should return `{ success, data, error, message }` envelopes. Frontend helpers should return normalized plain objects, for example `normalizeApiError` in `frontend/src/utils/errorHandler.js`.

## Module Design

**Exports:** Backend modules expose public use-cases/controllers through `index.js` files, for example `backend/src/modules/pos/index.js` and `backend/src/modules/dgfy/index.js`. New backend code should land under `backend/src/modules/<domain>/` and export through the module index when cross-file access is needed.

**Barrel Files:** Use module-level barrel exports for backend domain boundaries. Do not bypass repositories by importing models into controllers; this is blocked by `backend/eslint.config.mjs`, `backend/scripts/check-controller-boundaries.js`, and the architecture docs.

## Architecture-Sensitive Quality Rules

- Authoritative docs require the backend flow `routes -> controllers -> usecases -> repositories -> models` (`docs/architecture/ARCHITECTURE_BOUNDARIES.md`, last reviewed 2026-03-06; `docs/architecture/ARCHITECTURE_GOVERNANCE.md`, last reviewed 2026-05-21).
- ADR 0001 requires new backend code to land in `backend/src/modules/<domain>/...` and to use parity tests during migration (`docs/architecture/adr/0001-modular-monolith-boundaries.md`).
- ADR 0002 requires new use-cases to use explicit success/failure envelopes and shared domain error contracts (`docs/architecture/adr/0002-error-contract-unification.md`).
- ADR 0004 requires architecture compliance automation and PR evidence for guardrail checks (`docs/architecture/adr/0004-architecture-compliance-automation.md`).
- The local repo skill `.codex/skills/web-performance-qa/SKILL.md` defines local-only Playwright, Lighthouse, k6, and security testing constraints for POS, Skupervisor, Storefront, cross-app communication, and multi-tenancy checks.

---

*Convention analysis: 2026-07-10*
