---
status: reference
owner: frontend
last_reviewed: 2026-08-12
applies_to: dgfy_customer_dashboard_frontend
---

# Customer Dashboard Frontend Changes and Backend Support Note

## Purpose

This note records the customer-dashboard frontend work prepared on
`feat/customer-dashboard-frontend-audit` and identifies which behaviors already
use backend contracts versus which behaviors are intentionally frontend-only.
It is a handoff for backend planning and must not be read as a claim that the
frontend-only states are persisted or verified by the server.

## Scope and route surface

The change is limited to the DGFY customer dashboard frontend under
`apps/dgfy-web/apps/store/src/customer-dashboard` and its focused tests.

The supported account entry points remain:

- `/map-dgfy/account` for the global DGFY customer account.
- `/:store_tenant_slug/account` for a tenant storefront account.
- `/tenant-store/account` for the existing tenant-store account route family.

Signed-out account entry points continue to use the canonical customer
authentication route and preserve the account return target. No backend route
or database migration is included in this change.

## Frontend changes

### Overview

- Removed the old overview business-growth panel and added a responsive
  discovery CTA that routes the customer to discovery.
- Removed the Past Orders and Loyalty overview containers.
- Added responsive KPI behavior so overview metrics can open their relevant
  dashboard page on mobile.
- Added the profile setup score and verification badge to the customer profile
  presentation.
- Added the incomplete-verification login reminder with the remaining
  requirements.
- Kept page headings, typography, spacing, and dashboard controls aligned
  across mobile and desktop layouts.

### Orders and bookings

- Added underlined, horizontally scrollable tabs for Active Orders, Past
  Orders, and Reviews where applicable.
- Added booking tabs for Active Bookings, Past Bookings, and Reviews.
- Booking active/past grouping is currently a frontend presentation rule over
  the activity payload; the backend remains the source of booking records and
  statuses.

### Business page

- Removed the Premium banner.
- Shows `Register Your Business` only when the customer has no existing
  business.
- Renamed the existing-business action to `Add Business` and added the plus
  icon.
- Added industry tabs only for industries represented by the customer's
  businesses, with horizontal scrolling on narrow screens.
- Uses a four-column desktop business grid and compact mobile business rows.
- Uses `Owner` on mobile, active/inactive status dots, business profile images,
  and compact action rows.
- Places `Day Close` and `Go to POS` side-by-side on desktop and mobile.

### Account Settings

- Added the compact profile overview and profile setup score presentation.
- Added responsive account-detail rows for email, phone, Valid ID, and
  password.
- Added non-dismissable Change Email, Change Phone Number, and Change Password
  modal shells with mobile vertical centering and balanced action widths.
- Added the frontend profile-edit modal for name and profile-photo preview.
- Added the frontend Valid ID panel with front/back preview, flip/view-back
  interaction, ID type, upload date, expiry date, and verification state.
- The profile photo preview uses contained sizing so the uploaded image is not
  forcibly cropped.

### Addresses

- Enlarged and balanced the Add/Edit Address modal for desktop.
- Uses a taller mobile layout, responsive field stacking, compact actions, and
  a primary Save Address action.
- Keeps the location pin, current-location action, map controls, default
  address notice, and address fields.
- Shows the map pin by default and provides the pin-positioning instruction.

## Backend support matrix

| Area | Current frontend behavior | Current backend support | Backend work still needed |
| --- | --- | --- | --- |
| Customer identity and dashboard data | Loads profile, dashboard, activities, companies, notifications, addresses, and affiliate data | Supported through the existing DGFY customer/account APIs, including `/api/v1/dgfy/auth/me`, `/api/v1/dgfy/customer/dashboard`, `/api/v1/dgfy/customer/activities`, `/api/v1/dgfy/account/companies`, `/api/v1/dgfy/customer/notifications`, and `/api/v1/dgfy/customer/addresses` | Preserve additive response fields for verification and identity-document metadata when those contracts are introduced |
| Password change | Change Password calls the existing authenticated password-change service | Supported by `POST /api/v1/dgfy/auth/password/change` | Keep current validation, re-authentication/session policy, audit logging, and error contract stable |
| Email change | Modal is present, but submit currently reports frontend readiness only | Not wired by this frontend slice | Add request-code, verify-code, and update-email operations; define OTP expiry, retry limits, current-session behavior, email uniqueness, and verification status refresh |
| Phone change and verification | Modal is present, but submit currently reports frontend readiness only | No customer phone-verification contract is used by this frontend | Add phone-change and OTP verification operations; define country-code normalization, expiry, retry/rate limits, uniqueness, audit logging, and `phone_verified` response fields |
| Profile name/photo edit | Modal updates an in-memory frontend override for the current dashboard session | No persistence call is used | Add authenticated profile update and profile-image upload/delete contracts, validation, size/type limits, safe image URL handling, and response fields consumed by `/dgfy/auth/me` |
| Valid ID upload | Front/back file selection, preview, flip interaction, ID metadata, and status are frontend-only | No identity-document upload or review API is used | Add multipart upload, document metadata, secure private storage, review status, rejection reason, expiry handling, front/back association, access-control rules, and a read contract for `/dgfy/auth/me` or a dedicated identity endpoint |
| Profile setup score | Calculates Email + assumed Phone + Valid ID in the frontend | Email verification is read from the existing account payload; phone is intentionally assumed verified because no API exists; ID status is read only when present in the payload | Return authoritative email/phone/ID verification state and timestamps; define whether score is computed server-side or from a documented additive contract |
| Saved addresses | Add/Edit/Delete/Default actions use the customer dashboard address action bindings | Supported by the existing DGFY customer-address flow | Ensure coordinates, normalized address, label, default uniqueness, validation, and tenant/customer ownership rules are documented and returned consistently |
| Orders, activities, and bookings | Tabs and active/past filtering present returned records | Existing DGFY dashboard/activity and storefront booking/order APIs provide the source records | Provide stable status/date/reference fields if the frontend grouping rules are to become authoritative; add a global review read/write contract if reviews must be complete across stores |
| Business list and invitations | Displays companies, industry grouping, owner/member role, status, invitation actions, and Add Business CTA | Existing company, invitation, business step-up, and registration flows are used | Add explicit industry/status/logo fields if current company payloads do not guarantee them; keep invitation and ownership authorization server-side |
| Day Close and POS launch | Opens Day Close PIN setup or creates a POS handoff | Existing business access and POS handoff contracts are used, including the Day Close PIN flow | No new support requested; maintain authorization, tenant scoping, one-time handoff, and audit behavior |
| Login reminder | Shows remaining verification requirements after account load/login | Uses existing account payload; reminder itself is frontend-only | No new endpoint required if authoritative verification fields are added to the existing account response |

## Required backend contracts for the frontend-only account features

### 1. Profile update

Recommended authenticated contract:

- `PATCH /api/v1/dgfy/account/profile`
- `POST /api/v1/dgfy/account/profile/photo`
- `DELETE /api/v1/dgfy/account/profile/photo`

The response should return the normalized display name, optional middle name,
bio, profile-image URL, updated timestamp, and the account version used for
cache refresh. The server must enforce field length, image MIME/size limits,
private upload handling, and ownership of the authenticated account.

### 2. Email and phone verification

Email and phone changes should not be implemented as client-only updates. The
backend should own OTP creation, delivery, verification, expiry, retry limits,
rate limits, uniqueness checks, audit records, and the final account update.
The frontend needs stable responses for invalid code, expired code, rate limit,
already-used contact value, and successful update.

### 3. Identity document lifecycle

The Valid ID flow needs a dedicated authenticated contract. At minimum it
should support:

- create/upload a document with ID type and front image;
- optionally upload the back image as the same document version;
- read status and metadata without exposing unrestricted private storage;
- return `pending`, `approved`, `rejected`, or `expired` with safe user-facing
  reason data;
- replace or remove a document according to retention and audit policy.

The backend must validate file type and size, scan or quarantine uploads as
required, keep the document private, restrict access to the account and
authorized reviewers, and prevent a client from marking an ID verified.

### 4. Authoritative verification score

The current UI intentionally assumes phone verification is complete. Before
this becomes a trust or access decision, the server must expose authoritative
verification flags and timestamps for email, phone, and identity document.
The frontend should then remove the `phoneVerified: true` assumption and use
the server contract for the score and Verified banner.

## Security and ownership requirements

- Verification, identity-document status, contact uniqueness, and profile
  ownership must be decided server-side.
- Client-side score, badges, previews, and local profile overrides are display
  conveniences only and must not grant access or trust.
- Identity-document URLs must not be public by default; use authenticated or
  short-lived authorized access.
- OTP and contact-change operations must be rate-limited and auditable.
- Account and address mutations must remain scoped to the authenticated DGFY
  account and permitted tenant/company context.

## Non-goals for this frontend change

- No backend route, controller, schema, migration, storage policy, or worker
  was added.
- No claim is made that email, phone, profile photo/name, or Valid ID changes
  persist until the backend contracts above are implemented.
- The existing store-scoped customer constraints and separate tracking flows
  remain in force; this change does not create a new marketplace-wide identity
  or activity aggregation contract.

## Validation evidence

- Focused customer-dashboard Vitest suite: 6 files, 51 tests passed after
  rebasing onto `sieitzz/develop` at `f0066691`.
- Focused customer-dashboard ESLint: passed with no errors or warnings.
- Store production build: passed before the rebase; the focused suite and lint
  were rerun after the rebase.
- No backend files are included in the customer-dashboard implementation
  commits.

## Authoritative references

- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/architecture/adr/0023-front-facing-dgfy-customer-account.md`
- `docs/architecture/adr/0059-frontend-relocation-to-apps-dgfy-web.md`
- `docs/features/DGFY_CUSTOMER_ACCOUNT.md`
- `docs/proposals/STOREFRONT_CUSTOMER_ACCOUNT_UX_BACKEND_NOTE.md`
- `docs/api/README.md`
