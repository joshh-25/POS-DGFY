---
status: reference
authority_level: reference
owner: product
last_reviewed: 2026-05-17
applies_to: sku_pervisor_settings_surface
topic: settings_information_architecture
---

# Settings Information Architecture

## Source Documents

Planning and validation for this Settings structure must start with:

1. `docs/START_HERE.md`
2. `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
3. `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
4. ADRs:
   - `docs/architecture/adr/0007-dual-mode-pos-compliance-program.md`
   - `docs/architecture/adr/0008-tenant-workflow-mode-msme-simplification.md`
   - `docs/architecture/adr/0012-dgfy-global-convenience-fee-and-ui-brand-separation.md`
   - `docs/architecture/adr/0013-tenant-first-login-onboarding-and-storefront-readiness-contract.md`
   - `docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md`
5. Domain references:
   - `docs/features/DGFY_UNIFIED_ONBOARDING_PLAN.md`
   - `docs/features/POS_STOREFRONT_SOURCE_SEPARATION_CONTRACT.md`
   - `docs/features/TENANT_MANAGEMENT.md`

## Current Tab Contract

Settings is the tenant/admin source-of-truth surface for workspace identity, operational setup, storefront readiness, POS behavior, compliance lifecycle, and system-level controls.

Current top-level tabs:

| Tab | Purpose | Examples |
|---|---|---|
| Profile | Current user's personal account details | Name, email, phone number, profile-level preferences, password change |
| Company | Tenant identity, team, and business mode | Company details, user management, workflow/business mode selector with legacy manufacturing alias hidden from new choices |
| Storefront | Public DGFY storefront operations and presentation | Storefront slug, open status, business hours, fulfillment toggles, locations, primary pin, inactive-pin permanent delete, logo/cover, customer access mode, inventory display, customer-facing content |
| POS Setup | DGFY POS terminal, receipt, fiscal metadata, and cashier closeout behavior | Legal receipt metadata, TIN/PTU/MIN/accreditation, petty cash, terminal policy, DGFY fee policy, POS discounts |
| Compliance | Compliance lifecycle, documentary readiness, artifacts, and final review | Mode readiness, final review uploads/URLs, compliance sign-off |
| System | Technical and administrative system settings | Non-domain operational settings |

## Sectioning Rules

1. Storefront controls belong in `Storefront` unless they change POS terminal behavior or fiscal receipt output.
2. POS receipt metadata belongs in `POS Setup`, even when the same legal business fields are visible to customers.
3. DGFY fee policy belongs in `POS Setup` because ADR 0012 defines one cross-surface fee engine while removing settings-level fee customization.
4. Workflow/business mode belongs in `Company` because ADR 0008 defines it as tenant-wide and independent from compliance state.
5. Compliance lifecycle and documentary readiness belong in `Compliance`; these controls must not be mixed with Storefront media or general Company identity.
6. User and invitation management belong in `Company` because they affect tenant administration, not POS/storefront runtime behavior directly.
7. Customer Access Mode and Inventory Display belong in `Storefront` because they control public customer behavior and public stock presentation. They must not mutate workflow mode or compliance lifecycle state.
8. Tenant location pin management belongs in `Storefront` because it changes public map/profile location state and fulfillment/location selection. Permanent delete is exposed only for inactive unused pins; active pins stay on the deactivate/reactivate path first.
9. Storefront business hours belong in `Storefront` because they are both customer-facing content and checkout availability controls. The Settings editor must write the same `storefront_hours` weekly schedule used by onboarding, discovery/profile display, and Storefront checkout gating.
10. Item-level `Show in Storefront` and storefront item images belong on inventory item setup surfaces because they are per-item catalog membership/media controls. They must not be modeled as tenant-wide Settings controls and must not mutate `Show in POS`.
11. Storefront item controls are edit-gated. Inventory users without `items:edit` must not see disabled Storefront switches or image controls backed by inferred defaults, because the Storefront override read endpoint is also edit-gated.
12. User phone number management belongs in `Profile` because it is an account-level contact field. Existing users may add or change it there after login; company/user registration and invitation acceptance require it at account creation. Saving profile identity changes must not clear the resulting phone number.
13. Accepted-user phone visibility belongs in `Company -> Manage Users` because admins need to identify legacy accepted users missing the new required contact field. Pending invitation rows do not collect phone numbers until acceptance.
14. Authenticated password changes belong in `Profile` because they update the current user's account credential. The current password-change UI validates only current password presence, new password minimum length of 8 characters, and confirmation match before calling `PUT /users/me/password`; the optional generator fills the new and confirmation fields with a readable 16-character password.

## Deep-Link Contract

Settings remediation links are normalized through `frontend/src/features/settings/settingsDeepLink.js`.

Current static tab anchors include:

1. `#tab-profile`
2. `#tab-company`
3. `#tab-storefront`
4. `#tab-pos`
5. `#tab-compliance`
6. `#tab-system`

Current Storefront section anchors include:

1. `#storefront-operations-settings`
2. `#storefront-locations-settings`
3. `#storefront-branding-settings`
4. `#storefront-content-settings`
5. `#storefront-access-settings`

Dynamic final-review anchors remain supported by the compliance contract:

1. `#final-review-doc-*`

## PWA Layout Expectations

Settings must remain usable in both browser and installed PWA modes:

1. Top tabs must be horizontally scrollable on narrow mobile widths.
2. The tab strip must remain reachable while scrolling long settings forms.
3. Desktop actions can remain in the header, but mobile must keep save/revert actions reachable near the bottom safe area.
4. File upload controls and destructive media actions must stack on mobile instead of crowding into a single row.
5. Long section titles must wrap without overlapping icons, tabs, form fields, or mobile action controls.

## Architecture Impact

Current sectioning classification: `no-architecture-impact`.

The Settings sectioning contract is frontend information architecture plus test/deep-link alignment. Customer Access Mode, Inventory Display, and item-level storefront catalog separation are governed by ADR 0017. No architecture allowlist exception is required for keeping per-item storefront visibility on inventory item setup surfaces.
