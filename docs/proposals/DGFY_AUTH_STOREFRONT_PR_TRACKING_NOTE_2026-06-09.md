# DGFY Auth + Storefront PR Tracking Note

Date: June 9, 2026

Purpose:
- Track the overall DGFY auth, storefront customer account, and business-registration work completed from June 8 to June 9.
- Give the main developer one merge-oriented note that separates the scoped DGFY publishable work from broader branch history, POS-later work, and local-only work.
- Capture the current customer registration and email-verification OTP flow end to end.

Branch and review context:
- Target branch pushed: `origin/codex/storefront-merged-pilot`
- This branch already contains older work beyond the June 8-9 DGFY scope.
- For review, treat the files listed under `Publishable Files For This PR` as the source-of-truth scope for this DGFY/customer/business-registration pass.
- Treat the files listed under `POS Files Changed But Excluded From This PR` and `Local-Only / Do Not Include In PR` as intentionally out of scope.

Primary scoped commits pushed for this pass:
- `7de1376` `checkpoint: preserve dgfy auth, customer dashboard, and business registration flow`
- `95a5599` `chore(frontend): add lottie player dependency for dgfy auth hero`

Scope rule for the next PR:
- Include the DGFY auth, storefront, business-registration, backend customer-account, and related docs/tests work.
- Do not include POS-related changes in this PR.
- Do not include local-only test/runtime artifacts in this PR.

## PR Scope Summary

Primary functional outcome:
- DGFY customer auth is being centralized into a dedicated auth route.
- Storefront customer auth is being simplified into a launcher/handoff model.
- Business registration is being moved into an authenticated DGFY-account-first flow.
- Customer dashboard is being converted into a fuller storefront account surface.
- Customer activity is being tightened so only account-owned activity is shown.
- Signup email verification now follows the current OTP contract more clearly in the UI.

## Publishable Files For This PR

### Backend

`backend/src/modules/dgfy/usecases/dgfyCustomerUseCases.js`
- Updates DGFY customer-account behavior and dashboard/use-case logic.
- Supports stricter account-owned activity handling and customer dashboard flow changes.

`backend/src/modules/dgfy/utils/customerActivityRecorder.js`
- Removes unsafe auto-link behavior that could attach customer activity by loose email/phone matching.
- Keeps customer activity ownership aligned to the DGFY account model.

`backend/tests/dgfyCustomerUseCases.test.js`
- Adds/updates regression coverage for DGFY customer-account behavior.

`backend/tests/customerActivityRecorder.test.js`
- Adds focused tests for strict activity ownership behavior.

### Frontend Pages and Shared Routing

`frontend/Pages/DgfyAuthPage.jsx`
- New canonical DGFY auth page.
- Owns sign-in, create-account, email verification, and post-auth redirect handling.
- Preserves create-account state when users open legal terms and return.

`frontend/Pages/DgfyResetPasswordPage.jsx`
- New dedicated DGFY password-reset page.
- Separates password reset from the main auth page.

`frontend/Pages/RegisterCompany.jsx`
- Refactors company registration into a DGFY-authenticated business-registration-first experience.
- Uses the signed-in DGFY account as the identity source.

`frontend/Pages/LegalDocument.jsx`
- Legal pages now return users to the correct originating registration/auth flow instead of hardcoding `/register-company`.
- Preserves DGFY auth return state.

`frontend/Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx`
- Covers auth routing, company-registration handoff, password reset, OTP verification, and legal-page return behavior.

`frontend/src/features/dgfyRouteHelpers.js`
- Centralizes DGFY auth/reset/business routing helpers.
- Standardizes `intent`, `mode`, `return_to`, and account/dashboard redirect handling.

`frontend/src/services/dgfyAuthService.js`
- DGFY auth service changes for centralized auth flow, session handling, verification, password reset, and handoff logic.

`frontend/src/services/publicRoutePolicy.js`
- Marks new DGFY auth/reset routes as public.

`frontend/src/main.jsx`
- Registers the new DGFY auth/reset/legal route usage in the root frontend app.

`frontend/package.json`
- Package updates needed by the new auth/shared UI work.
- Adds the Lottie player dependency used by the branded DGFY hero.

`frontend/package-lock.json`
- Lockfile update for frontend dependency alignment.
- Captures the Lottie player install for reproducible frontend builds.

### Frontend DGFY Shared UI

`frontend/src/features/dgfy/components/DgfyAuthHero.jsx`
- Shared branded left-side auth/registration hero.
- Reused across DGFY auth and business-registration entry surfaces.

`frontend/src/features/dgfy/components/DgfyLegalAcknowledgementBox.jsx`
- Shared legal acknowledgement component.
- Now preserves auth form context when opening legal documents.

`frontend/src/features/dgfy/components/DgfyPasswordInput.jsx`
- Shared password input for DGFY auth/reset forms.

`frontend/src/features/dgfy/assets/dgfyHeroMotion.json`
- Branded motion payload for the DGFY auth hero.

`frontend/src/features/dgfy/assets/dgfy-ecosystem.png`
- Decorative DGFY ecosystem illustration fallback/supporting asset for the auth surface.

`frontend/src/assets/dgfy/dgfy-logo.png`
- Bundled DGFY logo asset used by the new auth flow.

`frontend/src/assets/dgfy/bg-modals.png`
- Bundled branded auth hero background used by the new auth flow.

### Storefront App

`frontend/apps/store/src/StorefrontApp.jsx`
- Main storefront integration for DGFY auth/account flow.
- Handles canonical auth redirects, DGFY session bootstrap after refresh, customer dashboard loading, business registration routing, and CSRF-safe/cookie-aware request handling.

`frontend/apps/store/src/router.jsx`
- Route changes supporting the current storefront account/auth flow.

`frontend/apps/store/src/businessRegistrationUrl.js`
- Normalizes storefront-to-auth and storefront-to-business-registration URLs.

`frontend/apps/store/src/Components/store/DiscoveryResponsiveLayout.jsx`
- Discovery/header layout updates for the current storefront auth/account UX.

`frontend/apps/store/src/Components/storefront/pages/DgfyCustomerAuthModal.jsx`
- Simplifies the old customer auth modal toward launcher/handoff behavior.

`frontend/apps/store/src/Components/storefront/pages/DgfyCustomerAccountPage.jsx`
- Major customer dashboard redesign and account-surface updates.
- Includes overview/account modules and current dashboard UI changes.
- Recent patch also fixes overview phone/email rendering to use signed-in account data and Lucide icons.

`frontend/apps/store/src/Components/storefront/pages/SolutionsPage.jsx`
- Updates business CTA routing into the DGFY auth/business-registration flow.

`frontend/apps/store/src/__tests__/discoveryFlow.integration.test.jsx`
- Integration coverage for storefront discovery/auth flow behavior.

`frontend/apps/store/src/__tests__/profileLauncher.integration.test.jsx`
- Integration coverage for customer launcher/profile entry flow.

`docs/proposals/DGFY_AUTH_STOREFRONT_PR_TRACKING_NOTE_2026-06-09.md`
- Review and handoff note for this PR scope.
- Lists the intended publishable files, exclusions, and the current auth/business flow.

### Documentation

`docs/architecture/adr/0023-front-facing-dgfy-customer-account.md`
- Updates the governed customer-account/frontend ownership note to reflect the current direction and constraints.

`docs/features/DGFY_CUSTOMER_ACCOUNT.md`
- Updates feature documentation for DGFY customer account behavior and ownership rules.

`docs/features/TENANT_MANAGEMENT.md`
- Updates related tenant/business registration flow documentation.

## POS Files Changed But Excluded From This PR

These should be handled in a later POS-specific PR.

`frontend/apps/pos/vite.config.js`
- POS build/runtime changes.

`frontend/src/features/pos/components/POSBarcodeScanner.jsx`
- POS scanner cleanup/update.

`frontend/src/features/pos/components/POSCheckoutTerminal.jsx`
- POS checkout terminal cleanup/refactor.

`frontend/src/features/pos/components/ReceiptPrintView.jsx`
- Receipt print rendering update.

`frontend/src/features/pos/components/SkupervisorPOSCheckoutTerminal.jsx`
- SKUpervisor POS checkout cleanup/refactor.

`frontend/src/features/pos/components/TerminalOperationsWorkspace.jsx`
- POS workspace updates.

`frontend/src/features/pos/components/TerminalPageLayout.jsx`
- POS page layout updates.

`frontend/src/features/pos/components/TerminalWorkspaceSidebar.jsx`
- POS sidebar cleanup/update.

`frontend/src/features/pos/pages/TerminalPage.jsx`
- POS page integration changes.

`frontend/src/features/pos/services/posService.js`
- POS service cleanup plus compatibility restoration.

## Local-Only / Do Not Include In PR

These are local runtime, QA, or temporary files and should stay out of the remote PR.

`.codex-local/`
- Local MailDev/test runner and helper artifacts for this machine/session only.

`frontend/test-results/`
- Local test output only.

`frontend/tmp_qa/`
- Local QA artifacts only.

`tmp_qa/`
- Local QA artifacts only.

`tmp_catalog_response.json`
- Local API/debug snapshot only.

`tmp_discovery.json`
- Local API/debug snapshot only.

`tmp_spacebar_catalog.json`
- Local API/debug snapshot only.

`tmp_spacebar_catalog_after_fix.json`
- Local API/debug snapshot only.

`tmp_spacebar_catalog_after_restart.json`
- Local API/debug snapshot only.

Potentially local-only config/runtime changes that should be reviewed before publish:

`backend/src/server.js`
- Check whether the current modifications are only for local CORS/testing support.
- If the current diff only contains local 127.0.0.1 / LAN-IP support, keep it out of the PR.

`ecosystem.config.cjs`
- Check whether the current modifications are only local runtime/CORS additions.
- If yes, keep them out of the PR.

`frontend/src/assets/dgfy/bg-modals.png`
- Bundled hero asset is the publish path. Do not add a duplicate root public copy unless a runtime `/bg-modals.png` reference is introduced and covered by tests.

Additional current local exclusions not pushed in this scope:

`frontend/vite.config.js`
- Local root-frontend runtime adjustment still dirty in working tree.
- Keep out of this PR unless it is separately reviewed and intentionally scoped.

## Current Customer Registration Flow

This is the current intended UX/technical flow after the June 8-9 changes.

### 1. Customer enters DGFY auth

Entry points:
- Storefront `Log in / Sign up`
- Storefront customer account launcher
- Business registration redirect for unauthenticated users

Route:
- `/dgfy/auth`

Supported modes:
- `mode=sign-in`
- `mode=create-account`

Supported intents:
- `intent=customer`
- `intent=register-business`

### 2. Customer creates a DGFY account

Create-account form collects:
- Last Name
- First Name
- Middle Name (optional)
- Email
- Contact Number
- Password
- Confirm Password
- Current DGFY account legal acknowledgement

Behavior:
- Account is created through DGFY auth service.
- Current legal versions are submitted with the account registration request.

### 3. Email verification OTP is requested

After account creation:
- The UI immediately requests a 6-digit email verification code.
- The account then enters `verify-email` mode.

Current UX state:
- If code delivery succeeds, the page tells the user a code was sent and registration remains paused until verification completes.
- If code delivery fails, the page still explains that the account was created but verification is blocked until the user resends the code.

### 4. Customer verifies email with OTP

Verification rules:
- User enters the 6-digit OTP.
- Current UI handles:
  - missing code
  - invalid code
  - expired code
  - attempts exceeded
  - resend flow

Important behavior:
- Only the latest code is valid.
- Expired/invalid states are now explained inline, not only through toasts.

### 5. Post-verification sign-in handoff

After successful email verification:
- User is returned to `sign-in` mode.
- Email is prefilled using the email entered during account creation.
- User signs in with the newly verified DGFY account.

### 6. Post-login customer destination

For `intent=customer`:
- User is redirected to the customer dashboard surface:
  - local dev target resolves to storefront account route
  - current target pattern is `/map-dgfy/account`

Dashboard behavior:
- Session should survive refresh through cookie-backed rehydration.
- Dashboard should show only account-owned activity.

### 7. Register Business from customer context

Customer can start business registration from:
- storefront business CTA
- customer dashboard `Register Your Business`

If user is not signed in:
- redirect to `/dgfy/auth?intent=register-business&return_to=/register-company`

If user is signed in:
- continue into business registration flow.

### 8. Business registration flow

Route:
- `/register-company`

Current business registration assumptions:
- DGFY account is the founder identity source.
- Founder identity is derived server-side from the signed-in DGFY account.
- Business registration page should focus only on company/business data.

Current company registration form scope:
- Company Name
- Business Industry
- Current company legal acknowledgement

### 9. Legal-document round trip

Current fixed behavior:
- Opening DGFY legal documents from create-account preserves the filled form values.
- Returning from legal pages should go back to the same DGFY auth create-account flow, not to `/register-company`.

## Merge Notes For Main Dev

Important review instruction:
- Do not review this branch by assuming every file in `origin/master..codex/storefront-merged-pilot` belongs to the DGFY auth/dashboard scope.
- Review this pass against the scoped files above first.
- The branch contains earlier unrelated history, so use this note as the merge filter.

Recommended PR split:

1. PR 1: DGFY auth + storefront + business registration
- Include backend DGFY customer-account ownership fixes
- Include root frontend DGFY auth/reset/legal flow
- Include storefront account/dashboard/auth launcher changes
- Include docs and tests for the DGFY/storefront flow

2. PR 2: POS cleanup/refactor
- Include only POS files listed above

3. Keep local-only artifacts out
- Exclude local MailDev/runtime helpers
- Exclude QA temp files and JSON debug snapshots
- Exclude purely local CORS/runtime config edits if they are not intended for shared environments

Risk points to recheck during merge:
- Route ownership between root frontend auth pages and storefront account route
- Cookie-backed DGFY session rehydration after refresh
- CSRF header behavior on business registration and DGFY cookie-authenticated requests
- Customer dashboard must not show activity belonging to other customers
- Terms/legal round-trip must preserve create-account state
- Root frontend and storefront builds must both stay green

Validation commands already used during this work:
- `npm --prefix frontend run build`
- `npm --prefix frontend run build:store`
- `npm --prefix frontend test -- Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx Pages/__tests__/LegalDocument.test.jsx`
- `npm run check:architecture`
