# Runtime Page Convention

`apps/dgfy-ims/Pages` contains public/authentication, platform-admin, and the still-retained
settings support page that have not yet moved into a feature module.

- New domain pages belong under `packages/web-core/src/features/<feature>/pages`.
- `apps/dgfy-ims/src/main.jsx` owns route composition and should import feature-owned pages directly.
- A root-level facade is allowed only while an external consumer still imports it. The facade must be removed once repository search confirms no runtime dependency.
- Tests for a page should be colocated with its feature or under the existing page test folder until that page is migrated.

Merchant workspaces now route through the POS Back Office. The former IMS implementations for
catalog, dashboard, assistant, dispatch, receiving, procurement, reports, stock movements, and
suppliers have no runtime consumers and were removed after the POS replacements were verified.
`Settings.jsx` remains intentionally because compliance, fiscal, and subscription contracts still
depend on that implementation; it is not safe to remove until those owners are explicitly moved.
