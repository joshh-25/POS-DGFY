# Configurable Discount Management — Phase 4

## Browser/PWA POS Settings editor

Phase 4 exposes the configurable discount-rule API through the shared browser/PWA POS Settings workspace. It is available from the existing **POS configuration** section in Business Admin and from the POS terminal Settings workspace when the user has `settings:view` or `settings:edit`.

## Delivered behavior

- Lists all tenant discount rules, including disabled and unapproved rules.
- Shows the configured rate, Enabled state, Approved state, availability in POS, creation date, and latest update date.
- Allows users with `settings:edit` to add percentage-based discount rules.
- Allows users with `settings:edit` to edit names, percentages, descriptions, Enabled state, and Approved state.
- Requires both Enabled and Approved before the UI reports a rule as available in POS.
- Uses `configuration_version` for optimistic concurrency on edits and refreshes after a conflict.
- Keeps fixed-amount system rules visible while preventing an invalid percentage edit.
- Provides no delete action; administrators disable a rule instead, preserving its configuration and audit history.
- Leaves the existing legacy `pos_discount_profiles` editor and checkout calculation path unchanged in this phase.

## Files

- `packages/web-core/src/features/pos/settings/PosDiscountManagementPane.jsx`
- `packages/web-core/src/features/pos/settings/PosSettingsWorkspace.jsx`
- `packages/web-core/src/services/settingsService.js`
- `apps/dgfy-pos/src/features/businessAdmin/BusinessAdminPage.jsx`

## Validation

- Discount editor behavior tests cover listing, creation, optimistic-concurrency updates, and view-only access.
- Settings service tests cover the list/create/update endpoint contract.
- Existing POS Settings workspace behavior tests remain green.
- The `apps/dgfy-pos` production build completes successfully.

Phase 5 can now integrate the approved/enablement rule set into transaction discount selection while preserving the historical discount snapshot requirements.
