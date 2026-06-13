---
status: reference
authority_level: reference
owner: qa
last_reviewed: 2026-06-13
applies_to: dgfy_account, business_registration, onboarding, storefront_checkout, pos_fulfillment, inventory_records
topic: dgfy_full_flow_e2e_verification
---

# DGFY Full-Flow End-to-End Verification Matrix

## Objective

Verify the current DGFY account, business registration, onboarding, Storefront checkout, POS fulfillment, and inventory-record flows from both backend and frontend evidence. This matrix is the working QA plan for local validation and production-safe verification before any broader production confidence claim.

## Authoritative Inputs

1. `docs/START_HERE.md`
2. `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
3. `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
4. `docs/architecture/adr/0023-front-facing-dgfy-customer-account.md`
5. `docs/features/DGFY_CUSTOMER_ACCOUNT.md`
6. `docs/testing/README.md`
7. `docs/testing/manual-qa-readiness-runbook-pos-ims-store.md`
8. `docs/testing/pos-e2e-uat-checklist.md`
9. `docs/testing/release-go-no-go-checklist.md`

## Finding Policy

1. Fix blockers immediately when they prevent the next required verification step from running or when they invalidate the product contract under test.
2. Record non-blocking defects in the matrix and continue to the next independent verification area.
3. Keep production checks read-only unless a designated QA account, QA tenant, QA store, and QA order path are approved for live mutation.
4. Do not use production customer data for destructive or state-changing QA.
5. Do not claim production completion from local evidence alone.

## Evidence Classes

| Evidence type | Required use | Limit |
|---|---|---|
| Backend automated tests | Use-case, transport, repository, DB transition proof | Does not prove rendered UX or production configuration |
| Frontend automated tests | Component, service, route, and interaction contracts | Does not prove real browser production assets |
| Local rendered smoke | Nonblank pages, route health, console health, basic interactions | Depends on local seed data and auth fixtures |
| Production-safe smoke | Public route, asset, health, and read-only endpoint proof | Does not prove mutation flows without QA data |
| Controlled production UAT | Live account, tenant, order, POS, and inventory proof | Requires approved QA data and cleanup/signoff |

## Formal Verification Matrix

| ID | Flow | Contract that must hold | Backend evidence | Frontend evidence | Local rendered evidence | Production evidence | Result | Findings |
|---|---|---|---|---|---|---|---|---|
| A1 | DGFY account signup and email OTP | `/dgfy/auth` requests a global `dgfy_account_verification` OTP without a company token, accepts the latest valid 6-digit code once, creates a landlord DGFY account, and sets DGFY session state. | `tests/dgfyAuthUseCases.test.js`, `tests/authEmailOtpTenantScope.test.js`, `tests/tenantHandler.emailOtp.test.js`, `tests/emailOtpService.test.js` | `Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx`, `src/services/__tests__/dgfyAuthService.cookieSession.test.js`, `src/services/__tests__/browserTokenStorage.guard.test.js` | `/dgfy/auth` create-account OTP request and verification page render nonblank with no framework overlay. | Public route smoke only unless an approved QA email is used. | PASS automated; rendered/prod mutation pending | Public/auth request refresh bug fixed so missing company token no longer masks DGFY auth errors. |
| A2 | DGFY login and account dashboard | Signed-in customers load `/map-dgfy/account` and tenant account routes as account state, not guest state; a cookie-backed session can rehydrate through `/api/v1/dgfy/auth/me`. | `tests/dgfyCustomerUseCases.test.js`, `tests/dgfyCustomerHandlers.transport.test.js`, `tests/customerActivityRecorder.test.js` | `apps/store/src/__tests__/discoveryHeaderAccount.integration.test.jsx`, `apps/store/src/__tests__/profileLauncher.integration.test.jsx` | `/map-dgfy/account` desktop and mobile account dashboard render with expected dashboard shell, back action, sign-out behavior, and no horizontal overflow. | Read-only route smoke for `dgfy.ph/map-dgfy/account`; authenticated production proof requires QA credentials. | PASS automated; rendered/authenticated prod pending | Browser-readable privileged token storage bug fixed. |
| A3 | DGFY account actions | Account-linked activities only come from explicit `dgfy_account_id`; cancel/reorder/saved-address actions are shown only when allowed by backend contracts. | `tests/dgfyCustomerUseCases.test.js`, `tests/dgfyCustomerHandlers.transport.test.js`, `tests/customerActivityRecorder.test.js` | `apps/store/src/__tests__/profileLauncher.integration.test.jsx`, `apps/store/src/__tests__/checkoutRules.test.js`, `apps/store/src/__tests__/customerAccess.test.js` | Account dashboard sections render activity, bookings, and address affordances without opening as a modal. | Requires QA account with linked activity; otherwise record as not exercised. | PASS automated; live activity UAT pending | No automated blocker remains. |
| B1 | Business registration from DGFY account | `Register Your Business` starts from DGFY account auth, exchanges handoff token on `/register-company`, auto-approves active tenant provisioning, and does not require platform-admin approval. | `tests/registerCompanyRequestUseCase.autoApproval.test.js`, `tests/tenantProvisioning.test.js`, `tests/dgfyTenantSession.transport.test.js` | `Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx` | `/register-company?source=dgfy#business-registration` renders authenticated company form and focuses business registration area. | Live tenant creation requires approved QA tenant naming and cleanup plan. | PASS automated; live tenant UAT pending | No automated blocker remains. |
| B2 | Automatic IMS login after company creation | After active tenant provisioning, `/api/v1/dgfy/auth/tenant-session` issues the normal SKUpervisor tenant session and redirects the founder into IMS/onboarding without asking for separate SKUpervisor credentials. | `tests/dgfyTenantSession.transport.test.js`, `tests/browserSessionCookies.test.js`, `tests/authUsecases.applicationResult.test.js` | `Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx`, `src/services/__tests__/api.interceptor.test.js` | A local successful registration fixture reaches IMS/onboarding with tenant session cookies or records the environment blocker. | Requires approved QA tenant mutation. | PASS automated; rendered/live handoff pending | Browser session refresh path fixed to use cookie-backed helpers. |
| B3 | Onboarding through item creation | New company onboarding can complete required setup and proceed through adding the first item/product without blocked future steps or invalid payload cleanup. | `tests/onboardingHandlers.transport.test.js`, `tests/onboardingUsecases.applicationResult.test.js`, `tests/onboardingRepository.schemaCompatibility.test.js`, `tests/itemHandlers.transport.test.js`, `tests/inventoryItemRepository.test.js` | `src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx`, `src/features/inventory/__tests__/ProductCreateWizard.behavior.test.jsx`, `src/features/inventory/__tests__/itemProductWizard.contract.test.js` | IMS onboarding and item/product wizard render in authenticated local shell when fixture access exists. | Requires approved QA tenant; production read-only checks are insufficient. | PASS automated; rendered/live onboarding pending | Item wizard sizing contract restored. |
| C1 | Discovery search and store open | Discovery uses `/map-dgfy`, stable map/search state, canonical clean store handles, and Storefront access-mode rules. | `tests/storefrontDiscoveryRepository.test.js`, `tests/storefrontDiscoveryMapPins.usecase.test.js`, `tests/storefrontCatalogUseCases.test.js`, `tests/customerAccessPolicy.test.js` | `apps/store/src/__tests__/discoveryFlow.integration.test.jsx`, `apps/store/src/__tests__/customerAccess.test.js`, `apps/store/src/__tests__/storefrontErrorMessages.test.js` | `/map-dgfy` search controls, map region, store cards/pins render and a store can be opened in local data. | Read-only public route smoke for `https://dgfy.ph/map-dgfy`. | PASS automated; rendered/prod public smoke pending | No automated blocker remains. |
| C2 | Guest checkout | Guest users can add items to cart, check out, and receive a trackable order without auto-linking to a new DGFY account by email or phone alone. | `tests/storeHandlers.transport.test.js`, `tests/storeUsecases.applicationResult.test.js`, `tests/storefrontCatalogUseCases.test.js`, `tests/customerActivityRecorder.test.js` | `apps/store/src/__tests__/checkoutRules.test.js`, `apps/store/src/__tests__/customerAccess.test.js` | Local tenant store fixture can add to cart and reach checkout/tracking, or blocker is recorded. | Requires approved QA store/order mutation. | PASS automated; live order UAT pending | No automated blocker remains. |
| C3 | DGFY account checkout | Signed-in DGFY customers checkout with explicit account ownership, profile/address prefill, and `dgfy_account_id` activity linkage. | `tests/customerActivityRecorder.test.js`, `tests/dgfyCustomerUseCases.test.js`, `tests/storeHandlers.transport.test.js` | `apps/store/src/__tests__/checkoutRules.test.js`, `apps/store/src/__tests__/profileLauncher.integration.test.jsx` | Local signed-in fixture shows prefilled customer context and account-linked checkout path. | Requires approved QA account and QA store/order. | PASS automated; live account checkout UAT pending | No automated blocker remains. |
| D1 | POS order approval and status transitions | Storefront checkout appears in POS, can be accepted, and transitions through accepted/preparing/ready/delivered according to POS contracts. | `tests/posHandlers.transport.test.js`, `tests/posCheckout.db.integration.test.js`, `tests/posUsecases.applicationResult.test.js`, `tests/posValidator.transactionsQuery.test.js` | `src/features/pos/__tests__/terminalViewModeContracts.test.js`, `src/features/pos/__tests__/receiptContractConformance.contract.test.js` | POS terminal route renders and can inspect order/status controls with local fixture data. | Requires approved QA POS user and QA order. | PASS automated; live POS UAT pending | POS transport mock and terminal UI contracts restored. |
| D2 | Customer tracking after POS updates | Customer tracking/account activity reflects POS order status changes and references remain account-linked only when explicit DGFY ownership exists. | `tests/customerActivityRecorder.test.js`, `tests/dgfyCustomerUseCases.test.js`, `tests/posSalesReconciliation.db.integration.test.js` | `apps/store/src/__tests__/profileLauncher.integration.test.jsx`, `apps/store/src/__tests__/checkoutRules.test.js` | Local tracking/account page updates after POS status fixture, or blocker recorded. | Requires approved QA order lifecycle. | PASS automated; live order lifecycle UAT pending | No automated blocker remains. |
| D3 | Inventory movement and records | Fulfilled or accepted checkout changes stock or creates a durable movement/sales record according to current POS/inventory contract. | `tests/posCheckout.db.integration.test.js`, `tests/posRepository.locationStockFallback.test.js`, `tests/posSalesReconciliation.db.integration.test.js`, `tests/inventoryItemRepository.test.js` | `src/features/inventory/__tests__/itemProductWizard.contract.test.js`, `src/features/pos/__tests__/terminalLocationScope.integration.test.jsx` | IMS inventory/POS screens show expected stock or sales record after local QA order fixture. | Requires approved QA inventory item and cleanup/signoff. | PASS automated; live inventory UAT pending | Scanner-wedge submission and terminal location contracts restored. |
| E1 | Production-safe public route health | Public deployed routes load current assets without blank page or framework overlay. | Health endpoints and deploy summaries only. | Built asset parity and route smoke. | Not applicable. | `https://skupervisor.dgfy.ph/dgfy/auth`, `https://skupervisor.dgfy.ph/register-company`, `https://dgfy.ph/map-dgfy`, `https://pos.dgfy.ph` read-only smoke. | PARTIAL FAIL | SKUpervisor DGFY auth, register-company, and Storefront discovery render in production; production POS renders an error boundary and must be redeployed/rechecked after the local POS fixes. |
| E2 | Controlled production UAT | Full live DGFY signup, business registration, onboarding, store checkout, POS fulfillment, and inventory evidence pass with approved QA data. | Production logs plus backend records for the QA entities. | Browser screenshots and operator screenshots. | Not applicable. | Requires approved QA email, QA tenant/company name, QA store, QA POS user, QA item, and cleanup/signoff plan. | Not started | Needs explicit QA data approval |

## Execution Log - 2026-06-13

### Automated and Static Results

| Area | Command | Result | Evidence summary |
|---|---|---|---|
| Architecture guardrails | `npm run check:architecture` | PASS | Checked 35 backend modules, 313 code files, and 69 controller files with no unauthorized model imports. |
| Documentation lint | `npm run lint:docs` | PASS | Validated 15 governed docs. |
| Compliance impact | `npm run check:compliance` | PASS | Sensitive frontend POS/session files are covered by `docs/compliance/impact-declarations/2026-06-13-dgfy-full-flow-pos-session-qa.md`; API contract checks passed. |
| Whitespace safety | `git diff --check` | PASS | No whitespace errors in the pending diff. |
| Backend DGFY account, OTP, business registration, tenant session | `npm --prefix backend test -- --runTestsByPath tests/dgfyAuthUseCases.test.js tests/authEmailOtpTenantScope.test.js tests/tenantHandler.emailOtp.test.js tests/emailOtpService.test.js tests/dgfyTenantSession.transport.test.js tests/registerCompanyRequestUseCase.autoApproval.test.js tests/dgfyCustomerUseCases.test.js tests/dgfyCustomerHandlers.transport.test.js tests/customerActivityRecorder.test.js tests/browserSessionCookies.test.js` | PASS | 10 suites and 67 tests passed. This covers global DGFY OTP without company token, OTP lifecycle, DGFY account creation, legal fail-closed handling, automatic company provisioning, tenant-session handoff, and account activity ownership. |
| Backend onboarding, inventory, Storefront, POS | `npm --prefix backend test -- --runTestsByPath tests/onboardingHandlers.transport.test.js tests/onboardingUsecases.applicationResult.test.js tests/onboardingRepository.schemaCompatibility.test.js tests/itemHandlers.transport.test.js tests/inventoryItemRepository.test.js tests/storefrontCatalogUseCases.test.js tests/storefrontDiscoveryRepository.test.js tests/storefrontDiscoveryMapPins.usecase.test.js tests/customerAccessPolicy.test.js tests/storeHandlers.transport.test.js tests/storeUsecases.applicationResult.test.js tests/posHandlers.transport.test.js tests/posCheckout.db.integration.test.js tests/posRepository.locationStockFallback.test.js tests/posSalesReconciliation.db.integration.test.js` | PASS | 15 suites and 179 tests passed. This covers onboarding transport/use cases, item and inventory repository behavior, discovery/catalog access rules, Storefront order use cases, POS transport, POS checkout DB transitions, stock fallback, and sales reconciliation. |
| Frontend DGFY account, registration, customer account, session | `npm --prefix frontend test -- Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx apps/store/src/__tests__/discoveryHeaderAccount.integration.test.jsx apps/store/src/__tests__/profileLauncher.integration.test.jsx src/services/__tests__/dgfyAuthService.cookieSession.test.js src/services/__tests__/browserTokenStorage.guard.test.js src/services/__tests__/api.interceptor.test.js --testTimeout 20000` | PASS | 6 test files and 38 tests passed. This covers account registration handoff, discovery/account launcher contracts, cookie-backed DGFY auth, privileged-token storage guardrails, and browser session refresh behavior. |
| Frontend discovery, checkout, onboarding, inventory, POS | `npm --prefix frontend test -- apps/store/src/__tests__/discoveryFlow.integration.test.jsx apps/store/src/__tests__/checkoutRules.test.js apps/store/src/__tests__/customerAccess.test.js apps/store/src/__tests__/storefrontErrorMessages.test.js src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx src/features/inventory/__tests__/ProductCreateWizard.behavior.test.jsx src/features/inventory/__tests__/itemProductWizard.contract.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/pos/__tests__/receiptContractConformance.contract.test.js src/features/pos/__tests__/terminalLocationScope.integration.test.jsx --testTimeout 20000` | PASS | 10 test files and 114 tests passed. This covers discovery routing, checkout rules, customer access, Storefront error copy, onboarding modal behavior, item/product wizard contracts, POS terminal contracts, receipt conformance, and terminal location scope. |
| SKUpervisor build | `npm --prefix frontend run build:skupervisor` | PASS with warnings | Build completed. Warnings remain for admin/payment and tenant capability service imports in `PaymentOperations.jsx` and `TenantManager.jsx`; they are outside this DGFY account/POS flow pass and are tracked as a follow-up finding below. |
| POS build | `npm --prefix frontend run build:pos` | PASS | Build completed. |
| Store build | `npm --prefix frontend run build:store` | PASS | Build completed. |

### Fixed Blockers During This Pass

1. `backend/tests/posHandlers.transport.test.js` used a stale `../index.js` mock that did not export POS device use cases now imported by `posHandlers.js`. The mock now includes device status, receipt print, and drawer-open use cases, and the POS transport suite passes.
2. Frontend auth/session code still read or wrote privileged access/company tokens through browser `localStorage` in `authService.js`, `api.js`, and `main.jsx`. The browser session path now uses the cookie-backed in-memory session helpers, and the storage guard test passes.
3. The API interceptor attempted tenant-session refresh for public/auth requests, which could turn DGFY public auth failures into misleading company-token errors. Public/auth requests now skip protected-session preflight and protected 401 refresh.
4. POS contract drift blocked frontend verification: scanner-wedge Enter submission, wizard sizing, shift controls heading, scroll-zone badge, receipt labels, and active terminal ID normalization were restored to match the current POS tests.
5. Local rendered smoke found `/dgfy/auth` referenced but not mounted in the SKUpervisor router. The existing `DgfyAuthPage` and `DgfyResetPasswordPage` are now mounted on `/dgfy/auth` and `/dgfy/reset-password`.
6. Local rendered smoke found the standalone POS app mounted `PermissionProvider` above `HashRouter`, which caused `useLocation()` to fail at runtime. `HashRouter` now wraps the POS providers.
7. Local rendered smoke found `POSCheckoutTerminal` referenced `loadHistory` before the callback declaration. `loadHistory` is now declared before callbacks that depend on it.

### Local Rendered Smoke Results

Browser plugin note: the in-app Browser plugin did not expose a callable navigation/screenshot tool in this thread, so Playwright from the backend workspace was used for rendered proof.

| Route | Result | Evidence | Notes |
|---|---|---|---|
| `http://127.0.0.1:5176/dgfy/auth?intent=register-business&mode=create-account` | PASS | `C:\Users\Cider\AppData\Local\Temp\skupervisor-dgfy-auth-local-smoke.png` | Rendered `Create your DGFY Account` without framework overlay. Backend API proxy returned local `502` because the backend server was not running for this render-only pass. |
| `http://127.0.0.1:5176/register-company?source=dgfy&auth=login#business-registration` | PASS | `C:\Users\Cider\AppData\Local\Temp\skupervisor-register-company-local-smoke.png` | Rendered business registration handoff content without framework overlay. Backend API proxy returned local `502` because the backend server was not running for this render-only pass. |
| `http://127.0.0.1:5177/map-dgfy` | PASS | `C:\Users\Cider\AppData\Local\Temp\store-discovery-local-smoke.png` | Rendered discovery/search/map shell. Backend API calls were refused because this was a frontend render smoke without local backend. |
| `http://127.0.0.1:5177/map-dgfy/account` | PASS | `C:\Users\Cider\AppData\Local\Temp\store-account-local-smoke.png` | Rendered standalone account dashboard shell with `My Account`, `Back to Discovery`, and guest/account state copy. Backend API calls were refused because this was a frontend render smoke without local backend. |
| `http://127.0.0.1:5178/` | PASS | `C:\Users\Cider\AppData\Local\Temp\pos-terminal-local-smoke.png` | Rendered standalone POS terminal shell without error boundary overlay. Local backend API proxy returned `502`, so transactional POS data was not exercised in this rendered smoke. |

### Production-Safe Read-Only Results

No production mutation was performed. These checks only verified public route HTTP status, first static assets, and rendered browser health.

| Route | HTTP/assets | Rendered result | Evidence | Notes |
|---|---|---|---|---|
| `https://skupervisor.dgfy.ph/dgfy/auth?intent=register-business&mode=create-account` | PASS | PASS | `C:\Users\Cider\AppData\Local\Temp\prod-skupervisor-dgfy-auth-smoke.png` | Returned `200`, first JS assets returned `200`, and rendered `Create your DGFY Account`. Console showed an expected unauthenticated `401` probe. |
| `https://skupervisor.dgfy.ph/register-company` | PASS | PASS | `C:\Users\Cider\AppData\Local\Temp\prod-skupervisor-register-company-smoke.png` | Returned `200`, first JS assets returned `200`, and rendered the business-registration entry state. Console showed an expected unauthenticated `401` probe. |
| `https://dgfy.ph/map-dgfy` | PASS | PASS | `C:\Users\Cider\AppData\Local\Temp\prod-store-discovery-smoke.png` | Returned `200`, first JS assets returned `200`, and rendered discovery/search/map shell. Console showed unauthenticated `401` probes and MapLibre/WebGL warnings, but no page error. |
| `https://pos.dgfy.ph/` | PASS | FAIL | `C:\Users\Cider\AppData\Local\Temp\prod-pos-terminal-smoke.png` | Returned `200` and first JS assets returned `200`, but production rendered the error boundary: `Something went wrong`. Local POS route passes after the fixes in this branch, so production is not ready until the current POS bundle is deployed and rechecked. |

### Open Findings and Gated Work

1. `npm --prefix frontend run build:skupervisor` still emits `IMPORT_IS_UNDEFINED` warnings for admin payment, tenant capability, and DGFY account admin service methods used by `Pages/admin/PaymentOperations.jsx`, `Pages/admin/TenantManager.jsx`, and `Pages/admin/DgfyAccountManager.jsx`. This does not block the DGFY customer account/business/POS flow evidence gathered here, but it should be handled in a separate admin services export review before claiming the whole admin surface is warning-free.
2. Production POS public route is not production-ready at the time of this pass. `https://pos.dgfy.ph/` renders the error boundary even though local POS render now passes.
3. Production mutation UAT is not approved or complete. Live account creation, live company creation, live checkout, live POS status transitions, and live inventory movement still require approved QA entities and a cleanup/signoff rule.

## Local Automated Command Plan

### Static and Governance

```bash
npm run check:architecture
npm run lint:docs
npm run check:compliance
```

### Backend: DGFY Account, OTP, Business Registration, Tenant Session

```bash
npm --prefix backend test -- --runTestsByPath tests/dgfyAuthUseCases.test.js tests/authEmailOtpTenantScope.test.js tests/tenantHandler.emailOtp.test.js tests/emailOtpService.test.js tests/dgfyTenantSession.transport.test.js tests/registerCompanyRequestUseCase.autoApproval.test.js tests/dgfyCustomerUseCases.test.js tests/dgfyCustomerHandlers.transport.test.js tests/customerActivityRecorder.test.js tests/browserSessionCookies.test.js
```

### Backend: Onboarding, Inventory, Storefront, POS

```bash
npm --prefix backend test -- --runTestsByPath tests/onboardingHandlers.transport.test.js tests/onboardingUsecases.applicationResult.test.js tests/onboardingRepository.schemaCompatibility.test.js tests/itemHandlers.transport.test.js tests/inventoryItemRepository.test.js tests/storefrontCatalogUseCases.test.js tests/storefrontDiscoveryRepository.test.js tests/storefrontDiscoveryMapPins.usecase.test.js tests/customerAccessPolicy.test.js tests/storeHandlers.transport.test.js tests/storeUsecases.applicationResult.test.js tests/posHandlers.transport.test.js tests/posCheckout.db.integration.test.js tests/posRepository.locationStockFallback.test.js tests/posSalesReconciliation.db.integration.test.js
```

### Frontend: DGFY Account, Business Registration, Customer Account

```bash
npm --prefix frontend test -- Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx apps/store/src/__tests__/discoveryHeaderAccount.integration.test.jsx apps/store/src/__tests__/profileLauncher.integration.test.jsx src/services/__tests__/dgfyAuthService.cookieSession.test.js src/services/__tests__/browserTokenStorage.guard.test.js --testTimeout 20000
```

### Frontend: Discovery, Checkout, Onboarding, Inventory, POS

```bash
npm --prefix frontend test -- apps/store/src/__tests__/discoveryFlow.integration.test.jsx apps/store/src/__tests__/checkoutRules.test.js apps/store/src/__tests__/customerAccess.test.js apps/store/src/__tests__/storefrontErrorMessages.test.js src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx src/features/inventory/__tests__/ProductCreateWizard.behavior.test.jsx src/features/inventory/__tests__/itemProductWizard.contract.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/pos/__tests__/receiptContractConformance.contract.test.js src/features/pos/__tests__/terminalLocationScope.integration.test.jsx --testTimeout 20000
```

### Builds

```bash
npm --prefix frontend run build:skupervisor
npm --prefix frontend run build:pos
npm --prefix frontend run build:store
```

## Local Rendered Smoke Plan

1. Start backend and frontend apps with local QA fixtures when available.
2. Verify these routes at desktop and mobile widths:
   - `/dgfy/auth?intent=register-business&mode=create-account`
   - `/register-company?source=dgfy#business-registration`
   - `/map-dgfy`
   - `/map-dgfy/account`
   - POS terminal route
   - IMS onboarding/item creation route
3. For each route record:
   - URL and title
   - Nonblank content
   - No framework overlay
   - Relevant console errors/warnings
   - Screenshot path
   - One primary interaction proof where auth fixtures allow it

## Production-Safe QA Plan

Run only read-only checks until QA mutation data is approved:

1. Compare local `HEAD`, `origin/master`, and any deploy-state/deploy summary when available.
2. Check public route HTTP status and root content:
   - `https://skupervisor.dgfy.ph/dgfy/auth?intent=register-business&mode=create-account`
   - `https://skupervisor.dgfy.ph/register-company`
   - `https://dgfy.ph/map-dgfy`
   - `https://pos.dgfy.ph`
3. Confirm assets referenced by the public pages return `200`.
4. Do not create production DGFY accounts, tenants, checkout orders, POS status updates, or inventory movements without approved QA data.

## Controlled Production UAT Data Needed

1. QA email inbox that can receive and disclose OTPs.
2. QA DGFY account name and phone number.
3. QA company name and industry.
4. QA tenant/store that can be created or reused.
5. QA item/product with known starting stock.
6. QA POS operator credentials.
7. Cleanup/signoff rule for test tenant, orders, and inventory records.
