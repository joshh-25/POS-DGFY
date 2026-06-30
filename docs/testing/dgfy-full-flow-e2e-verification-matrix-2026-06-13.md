---
status: reference
authority_level: reference
owner: qa
last_reviewed: 2026-06-30
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
| C2 | Guest checkout | Guest users can add items to cart, preserve and restore a same-store session checkout draft, select only a backend-supported payment method, check out, and receive a trackable order without auto-linking to a new DGFY account by email or phone alone. | `tests/storeHandlers.transport.test.js`, `tests/storeUsecases.applicationResult.test.js`, `tests/storefrontCatalogUseCases.test.js`, `tests/customerActivityRecorder.test.js` | `apps/store/src/__tests__/checkoutRules.test.js`, `apps/store/src/__tests__/customerAccess.test.js`, `apps/store/src/__tests__/guestCheckoutDraft.test.js`, `apps/store/src/__tests__/storefrontErrorMessages.test.js`, `apps/store/src/__tests__/fnbStorefront.contract.test.js` | Local tenant store fixture can add to cart and reach checkout/tracking, or blocker is recorded. | Production SHA and Storefront asset parity proved deployment at `bf982d4e78f52e67c6575dd2a77037232a6ab4e9`; complete behavior still requires an approved disposable QA store/order mutation. | PASS automated and deployed assets; live order UAT pending | Focused guest-checkout tests passed `30/30`, the Storefront build passed, and production assets contain the draft restore and payment validation contract. Accuracy state remains `deployed_but_behavior_not_proven` until controlled guest-order mutation UAT. |
| C3 | DGFY account checkout | Signed-in DGFY customers checkout with explicit account ownership, profile/address prefill, and `dgfy_account_id` activity linkage. | `tests/customerActivityRecorder.test.js`, `tests/dgfyCustomerUseCases.test.js`, `tests/storeHandlers.transport.test.js` | `apps/store/src/__tests__/checkoutRules.test.js`, `apps/store/src/__tests__/profileLauncher.integration.test.jsx` | Local signed-in fixture shows prefilled customer context and account-linked checkout path. | Requires approved QA account and QA store/order. | PASS automated; live account checkout UAT pending | No automated blocker remains. |
| D1 | POS order approval and status transitions | Storefront checkout appears in POS, can be accepted, and transitions through accepted/preparing/ready/delivered according to POS contracts. | `tests/posHandlers.transport.test.js`, `tests/posCheckout.db.integration.test.js`, `tests/posUsecases.applicationResult.test.js`, `tests/posValidator.transactionsQuery.test.js` | `src/features/pos/__tests__/terminalViewModeContracts.test.js`, `src/features/pos/__tests__/receiptContractConformance.contract.test.js` | POS terminal route renders and can inspect order/status controls with local fixture data. | Requires approved QA POS user and QA order. | PASS automated; live POS UAT pending | POS transport mock and terminal UI contracts restored. |
| D2 | Customer tracking after POS updates | Customer tracking/account activity reflects POS order status changes and references remain account-linked only when explicit DGFY ownership exists. | `tests/customerActivityRecorder.test.js`, `tests/dgfyCustomerUseCases.test.js`, `tests/posSalesReconciliation.db.integration.test.js` | `apps/store/src/__tests__/profileLauncher.integration.test.jsx`, `apps/store/src/__tests__/checkoutRules.test.js` | Local tracking/account page updates after POS status fixture, or blocker recorded. | Requires approved QA order lifecycle. | PASS automated; live order lifecycle UAT pending | No automated blocker remains. |
| D3 | Inventory movement and records | Fulfilled or accepted checkout changes stock or creates a durable movement/sales record according to current POS/inventory contract. | `tests/posCheckout.db.integration.test.js`, `tests/posRepository.locationStockFallback.test.js`, `tests/posSalesReconciliation.db.integration.test.js`, `tests/inventoryItemRepository.test.js` | `src/features/inventory/__tests__/itemProductWizard.contract.test.js`, `src/features/pos/__tests__/terminalLocationScope.integration.test.jsx` | IMS inventory/POS screens show expected stock or sales record after local QA order fixture. | Requires approved QA inventory item and cleanup/signoff. | PASS automated; live inventory UAT pending | Scanner-wedge submission and terminal location contracts restored. |
| E1 | Production-safe public route health | Public deployed routes load current assets without blank page or framework overlay. | Health endpoints and deploy summaries only. | Built asset parity and route smoke. | Not applicable. | `https://skupervisor.dgfy.ph/dgfy/auth`, `https://skupervisor.dgfy.ph/dgfy/reset-password`, `https://skupervisor.dgfy.ph/register-company`, `https://dgfy.ph/map-dgfy`, `https://dgfy.ph/map-dgfy/account`, `https://pos.dgfy.ph` read-only smoke. | PASS read-only | Current deployed SHA `f6532baf0a41114ad8dc4f40e3ddf3c53039c321` matches local `master`, `origin/master`, remote `HEAD`, and `.deploy-state/last_deployed_commit`. Public routes return `200`. Guest/locked pages still emit expected unauthenticated API responses. |
| E2 | Controlled production UAT | Full live DGFY signup, business registration, onboarding, store checkout, POS fulfillment, and inventory evidence pass with approved QA data. | Production logs plus backend records for the QA entities. | Browser screenshots and operator screenshots. | Not applicable. | `npm run uat:production:dgfy` used a disposable QA inbox and retained QA records for audit. | PASS | Fresh production QA account received OTP, registered, auto-activated a company, entered IMS, completed onboarding through item creation, completed DGFY-authenticated checkout, fulfilled the order in POS, decremented stock from `10` to `9`, and showed the completed order in the DGFY customer account. |

## Execution Log - 2026-06-13

### Automated and Static Results

| Area | Command | Result | Evidence summary |
|---|---|---|---|
| Architecture guardrails | `npm run check:architecture` | PASS | Checked 35 backend modules, 313 code files, and 69 controller files with no unauthorized model imports. |
| Documentation lint | `npm run lint:docs` | PASS | Validated 15 governed docs. |
| Compliance impact | `npm run check:compliance` | PASS | Sensitive frontend POS/session files are covered by `docs/compliance/impact-declarations/2026-06-13-dgfy-full-flow-pos-session-qa.md`; API contract checks passed. |
| Whitespace safety | `git diff --check` | PASS | No whitespace errors in the pending diff. |
| Backend DGFY account, OTP, business registration, tenant session, admin, commerce payment | `npm --prefix backend test -- --runTestsByPath tests/dgfyAuthUseCases.test.js tests/dgfyCustomerUseCases.test.js tests/dgfyAdminAccountRoutes.contract.test.js tests/dgfyAdminAccountHandlers.transport.test.js tests/dgfyAdminAccountUseCases.test.js tests/adminTenantCapabilities.transport.test.js tests/adminTenantHandlers.transport.test.js tests/listTenantCapabilityAuditLogs.usecase.test.js tests/commercePaymentValidator.test.js tests/commercePaymentSettlement.usecases.test.js tests/commercePaymentRefunds.usecases.test.js tests/commercePaymentReadiness.usecases.test.js tests/commercePaymentRouteMount.contract.test.js` | PASS | 13 suites and 82 tests passed. This covers DGFY auth/customer/admin contracts, tenant capability admin transport/use cases, commerce payment validation/refund/settlement/readiness behavior, and the `/api/v1/commerce-payments` route mount. |
| Backend onboarding, inventory, Storefront, POS | `npm --prefix backend test -- --runTestsByPath tests/onboardingHandlers.transport.test.js tests/onboardingUsecases.applicationResult.test.js tests/onboardingRepository.schemaCompatibility.test.js tests/itemHandlers.transport.test.js tests/inventoryItemRepository.test.js tests/storefrontCatalogUseCases.test.js tests/storefrontDiscoveryRepository.test.js tests/storefrontDiscoveryMapPins.usecase.test.js tests/customerAccessPolicy.test.js tests/storeHandlers.transport.test.js tests/storeUsecases.applicationResult.test.js tests/posHandlers.transport.test.js tests/posCheckout.db.integration.test.js tests/posRepository.locationStockFallback.test.js tests/posSalesReconciliation.db.integration.test.js` | PASS | 15 suites and 179 tests passed. This covers onboarding transport/use cases, item and inventory repository behavior, discovery/catalog access rules, Storefront order use cases, POS transport, POS checkout DB transitions, stock fallback, and sales reconciliation. |
| Frontend DGFY account, admin services, customer account, session, POS session | `npm --prefix frontend test -- --run src/services/__tests__/adminService.adminOperations.contract.test.js src/services/__tests__/browserTokenStorage.guard.test.js src/features/pos/__tests__/terminalSessionSource.contract.test.js src/pages/__tests__/DgfyAccountManager.integration.test.jsx src/pages/__tests__/TenantManager.capabilities.integration.test.jsx apps/store/src/__tests__/discoveryFlow.integration.test.jsx apps/store/src/__tests__/profileLauncher.integration.test.jsx --testTimeout 20000` | PASS | 7 test files and 60 tests passed. This covers DGFY account manager, tenant capability admin calls, admin service method/path/auth contracts, Storefront discovery/account launcher behavior, broadened privileged-token storage guardrails, and the POS browser-session source contract. |
| SKUpervisor build | `npm --prefix frontend run build:skupervisor` | PASS | Build completed with no `IMPORT_IS_UNDEFINED` warnings. Remaining warnings were chunk-size/plugin-timing warnings only. |
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
8. SKUpervisor build previously emitted `IMPORT_IS_UNDEFINED` warnings for DGFY account admin, tenant capability, and commerce payment admin methods. `adminService` now exports those wrappers, `backend/src/server.js` mounts commerce payment routes at `/api/v1/commerce-payments`, and the focused admin service contract test passes.
9. POS terminal session state previously read privileged `authToken` and `companyToken` values directly from `localStorage`. `TerminalPage` now hydrates through `browserSession` helpers and cookie refresh, with a POS-specific source contract plus the broadened token-storage guard.
10. Production deployment initially exposed deterministic install/build blockers that local dirty `node_modules` had masked: `backend/package-lock.json` was out of sync with `backend/package.json`, `scripts/deploy-remote.sh` changed the tracked mode of `scripts/deploy.sh` before the remote clean-tree gate, and `frontend/src/hooks/useFuzzySearch.js` imported undeclared `fuse.js`. The backend lockfile, deploy wrapper, and frontend dependency declaration now match the production install/build contract.

### Local Rendered Smoke Results

Browser plugin note: the in-app Browser plugin was available and used for this remediation pass. Its own telemetry endpoint was blocked by Cloudflare, but local route navigation, DOM checks, console checks, viewport changes, screenshots, and interactions completed.

| Route | Result | Evidence | Notes |
|---|---|---|---|
| `http://127.0.0.1:5176/dgfy/auth?intent=register-business&mode=create-account` | PASS | `C:\Users\Cider\AppData\Local\Temp\sku-remediation-auth-desktop.png`, `C:\Users\Cider\AppData\Local\Temp\sku-remediation-auth-mobile.png` | Rendered `Create your DGFY Account` without framework overlay. Harmless interaction proof clicked the `Sign in` mode toggle and observed sign-in copy. |
| `http://127.0.0.1:5176/dgfy/reset-password` | PASS | `C:\Users\Cider\AppData\Local\Temp\sku-remediation-reset-desktop.png` | Rendered `Forgot Password` route without framework overlay. |
| `http://127.0.0.1:5176/register-company?source=dgfy&auth=login#business-registration` | PASS | `C:\Users\Cider\AppData\Local\Temp\sku-remediation-register-company-desktop.png` | Rendered business registration handoff content without framework overlay. Backend API proxy returned local bad-gateway copy because this was a frontend preview without the backend server. |
| `http://127.0.0.1:5177/map-dgfy` | PASS | `C:\Users\Cider\AppData\Local\Temp\sku-remediation-discovery-desktop.png`, `C:\Users\Cider\AppData\Local\Temp\sku-remediation-discovery-mobile.png` | Rendered discovery/search/map shell. Harmless interaction proof filled the search box with `coffee` and observed the input value. |
| `http://127.0.0.1:5177/map-dgfy/account` | PASS | `C:\Users\Cider\AppData\Local\Temp\sku-remediation-account-desktop.png`, `C:\Users\Cider\AppData\Local\Temp\sku-remediation-account-mobile.png` | Rendered standalone account dashboard shell with `My Account`, `Back to Discovery`, guest/customer state, refresh, and business registration affordance. |
| `http://127.0.0.1:5178/` | PASS | `C:\Users\Cider\AppData\Local\Temp\sku-remediation-pos-desktop.png`, `C:\Users\Cider\AppData\Local\Temp\sku-remediation-pos-mobile.png` | Rendered standalone POS terminal shell without error boundary overlay. Transactional POS data was not exercised in this render-only pass. |

### Production-Safe Read-Only Results

Production deploy completed on June 13, 2026 for runtime code SHA `b40f2d96e513a1a259d423df91d0ccf406521c6c`. Remote `HEAD`, `.deploy-state/last_deployed_commit`, and `origin/master` matched this SHA after deploy. Deployment summary: `/var/www/skupervisor/logs/deploy/deploy_20260613_162435.summary.txt`.

Documentation and release evidence were later deployed on June 13, 2026 at SHA `f6532baf0a41114ad8dc4f40e3ddf3c53039c321`. The current production UAT gate verified local `master`, `origin/master`, remote `HEAD`, and `.deploy-state/last_deployed_commit` all match `f6532baf0a41114ad8dc4f40e3ddf3c53039c321`.

The final deployment for this evidence set completed at SHA `1850188b9063ef80db27b488f6204d0b7261e01c` with deploy summary `/var/www/skupervisor/logs/deploy/deploy_20260613_213041.summary.txt`. Local `master`, `origin/master`, production remote `HEAD`, and `.deploy-state/last_deployed_commit` matched this SHA at proof time. The release used the documented emergency no-staging bypass because stale QA deployed-head evidence was the only no-staging gate failure. QA smoke, QA rollback drill, QA restore drill, documentation lint, architecture checks, production deterministic installs, production builds, tenant schema sync, tenant schema regression gate, tenant index headroom, permission backfill, Storefront discovery reconciliation, PM2 reload, public endpoint checks, and frontend asset parity passed.

No production mutation was performed for this read-only route-smoke section. These checks only verified public route HTTP status, first static assets, and rendered browser health; the controlled mutation evidence is recorded separately in the production UAT rating gate below.

| Route | HTTP/assets | Rendered result | Evidence | Notes |
|---|---|---|---|---|
| `https://skupervisor.dgfy.ph/dgfy/auth` | PASS | PASS | `C:\Users\Cider\AppData\Local\Temp\sku-prod-ims-auth-desktop.png`, `C:\Users\Cider\AppData\Local\Temp\sku-prod-ims-auth-mobile.png` | Returned `200` and rendered DGFY auth content without framework overlay. Guest load emitted expected unauthenticated `401` for `/dgfy/auth/me`. |
| `https://skupervisor.dgfy.ph/dgfy/reset-password` | PASS | PASS | `C:\Users\Cider\AppData\Local\Temp\sku-prod-ims-reset-desktop.png` | Returned `200` and rendered reset-password content without framework overlay. |
| `https://skupervisor.dgfy.ph/register-company` | PASS | PASS | `C:\Users\Cider\AppData\Local\Temp\sku-prod-ims-register-company-desktop.png` | Returned `200` and rendered business-registration entry content without framework overlay. |
| `https://dgfy.ph/map-dgfy` | PASS | PASS | `C:\Users\Cider\AppData\Local\Temp\sku-prod-store-discovery-desktop.png`, `C:\Users\Cider\AppData\Local\Temp\sku-prod-store-discovery-mobile.png` | Returned `200` and rendered discovery/search/map shell. Guest load emitted expected unauthenticated `401` probes; mobile smoke had aborted third-party tile requests but no app error or overlay. |
| `https://dgfy.ph/map-dgfy/account` | PASS | PASS | `C:\Users\Cider\AppData\Local\Temp\sku-prod-store-account-desktop.png`, `C:\Users\Cider\AppData\Local\Temp\sku-prod-store-account-mobile.png` | Returned `200` and rendered `My Account` content without framework overlay. Guest load emitted expected unauthenticated `401` probes. |
| `https://pos.dgfy.ph/` | PASS | PASS | `C:\Users\Cider\AppData\Local\Temp\sku-prod-pos-desktop.png`, `C:\Users\Cider\AppData\Local\Temp\sku-prod-pos-mobile.png` | Returned `200` and rendered POS terminal content without framework overlay. Locked/guest load emitted an expected `400` bootstrap response until a valid terminal/session is present. |

### Production UAT Rating Gate - 2026-06-13

Command:

```bash
npm run uat:production:dgfy
```

Evidence file:

```text
.tmp/production-uat/dgfy-production-uat.json
```

Controlled production mutation result:

| Area | Rating | Status | Basis |
|---|---:|---|---|
| DGFY account UI shell | 9.2 | PASS | Production DGFY auth, reset-password, register-company, Storefront account, discovery, and POS entry routes return `200`; DGFY account order tracking was proven through the live QA checkout. |
| DGFY signup and business registration | 9.2 | PASS | Fresh production DGFY OTP delivery, account registration, company auto-activation, tenant-session handoff, and onboarding item creation passed. |
| E-commerce Storefront checkout | 9.2 | PASS | Fresh production DGFY-authenticated Storefront checkout created a POS-backed order and linked it to the DGFY customer account. |
| POS order and inventory flow | 9.2 | PASS | Fresh production POS lifecycle completed the online order and decremented the QA item stock from `10` to `9`. |
| Admin/payment/capability operations | 9.1 | PASS | Deploy SHA parity and previously passing admin service/backend route gates cover the runtime integration gap. |
| Production readiness | 9.2 | PASS | Local/origin/deploy SHA parity, public route smoke, OTP, account, registration, IMS handoff, onboarding, checkout, POS fulfillment, inventory decrement, and DGFY account order visibility all passed. |

The approved production UAT run generated `.tmp/production-uat/dgfy-production-uat.json` at `2026-06-13T13:15:20.651Z`. The run used dedicated QA data with suffix `iaqzfpb2`, tenant `c3c8be55-cccb-4463-87bf-0666651ad756`, item `1`, location `1`, and tracking PIN `SK-DJCOLC`. The QA email is intentionally masked in evidence and the records are retained for audit cleanup.

Two earlier mutation attempts are intentionally not counted as approval evidence:

1. The first fresh run stopped after proving OTP, DGFY registration, company auto-activation, tenant-session handoff, and registered-access seed because the UAT runner parsed the onboarding bulk response using the wrong field.
2. The next run proved checkout, POS completion, and inventory decrement, then exposed a UAT parser mismatch for the DGFY customer orders endpoint. Production data confirmed the account activity existed; the endpoint returns `activities[]`/`reference`, not `orders[]`/`tracking_pin`.

### Open Findings and Gated Work

1. The no-staging release gate still depended on stale QA deployed-head evidence and required the documented emergency bypass for the final 2026-06-13 deployment. Refresh QA deploy parity evidence before the next production release so `qa.deploy.summary.sha_match` can pass normally.
2. Production QA records from the controlled mutation runs are retained for audit cleanup. They must not be treated as customer/operator data.

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
5. Run `npm run uat:production:dgfy` to generate the read-only production rating evidence. A blocked result is expected until controlled mutation inputs are approved.

## Controlled Production UAT Data Needed

1. QA email inbox that can receive and disclose OTPs.
2. QA DGFY account name and phone number.
3. QA company name and industry.
4. QA tenant/store that can be created or reused.
5. QA item/product with known starting stock.
6. QA POS operator credentials.
7. Cleanup/signoff rule for test tenant, orders, and inventory records.
