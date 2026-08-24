# Runtime Page Convention

`apps/dgfy-ims/Pages` contains legacy top-level route entries and public/admin shell pages that have not yet moved into a feature module.

- New domain pages belong under `packages/web-core/src/features/<feature>/pages`.
- `apps/dgfy-ims/src/main.jsx` owns route composition and should import feature-owned pages directly.
- A root-level facade is allowed only while an external consumer still imports it. The facade must be removed once repository search confirms no runtime dependency.
- Tests for a page should be colocated with its feature or under the existing page test folder until that page is migrated.

Items and Job Orders now route directly to feature-owned pages. Stock Movements retains its facade temporarily because its migration is outside this cleanup scope.
