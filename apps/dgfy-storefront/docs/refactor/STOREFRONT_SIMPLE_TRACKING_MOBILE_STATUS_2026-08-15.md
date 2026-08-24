# Simple MSME Tracking Mobile Status Layout

Date: 2026-08-15
Status: Implemented locally; not committed or pushed

## Issue

On narrow mobile screens, the Simple MSME pickup tracking view used an oversized status-icon panel. The five-step pickup progress row was wider than the viewport, which clipped the final `Picked up` step.

## Change

- Reduced the mobile status-icon panel to a compact 64px square while keeping the desktop presentation intact.
- Changed the progress row to a responsive equal-column layout based on the actual tracking flow length.
- Allowed the mobile labels to wrap within their step cells so all pickup states remain visible:
  `Order confirmed`, `Confirmed by store`, `Preparing`, `Ready for pickup`, and `Picked up`.
- Kept the Simple MSME green and cream presentation palette.

## Scope

Only the Simple MSME tracking presentation was changed. The tracking adapter, status identifiers, API behavior, Retail tracking, F&B tracking, and backend were not changed.

## Validation

- Simple tracking and route contract tests passed: 9 tests.
- ESLint passed for the changed component and test.
- `git diff --check` passed for the changed files.
- Storefront production build remains required after the local dev server is available for rendered verification.

## Limitation

Rendered browser verification was blocked during this change because the local storefront host returned a temporary rate-limit response, and the localhost fallback did not complete navigation. Recheck the pickup tracking route at a mobile viewport after the local service is available.
