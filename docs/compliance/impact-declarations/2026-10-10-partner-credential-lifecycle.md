---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-10
declaration_id: 2026-10-10-partner-credential-lifecycle
classification: major
surfaces: api,authentication,authorization,credentials,tenant-isolation,database,platform-admin,merchant-admin,pos,settings
reason_codes_impacted: ALLOWED,CLIENT_NOT_ACTIVE,ATTACHMENT_REQUIRED,AMBIGUOUS_ATTACHMENT,SCOPE_DENIED,ATTACHMENT_NOT_ACTIVE
policy_version: 2026.10.10
verification_evidence: 'Phase 493 implementation validation: 7 focused Jest suites / 35 tests passed; disposable MySQL 8.0.46 migration up-twice/down check passed; API syntax and ESLint passed; architecture, ADR, docs, compliance, and compatibility-seam checks passed; app version gate passed on staged changes.'
rollback_note: Revert the partner lifecycle API and disable its routes; retain existing #2311 registry tables and preserve audit records. Do not drop applied credential or attachment tables without an operator-reviewed data-retention plan.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-10T00:00:00Z
preflight_request_ref: NOT-EXECUTED-2026-10-10-PARTNER-CREDENTIAL-LIFECYCLE
---

# Partner Credential Lifecycle (#801, Phase 493)

## Compliance Impact Classification

Major. This change adds server-side OAuth client credential issuance and verification, rotation,
revocation, Platform Admin permission enforcement, merchant consent to tenant/location access, and
tenant-context resolution for machine-authenticated requests. It changes authentication and
authorization boundaries but does not change fiscal calculation, tax classification, payment
capture, or settlement behavior.

## Affected Surfaces

- Landlord App/client/credential/attachment identity records and tenant model-clone exclusions.
- Platform Admin approval, client activation/suspension, credential issue/rotation/revocation, and
  entitlement administration behind the live `admin.partner_integrations` grant.
- Tenant owner/admin consent, scope changes, attachment suspension/reactivation/disconnection, and
  tenant-scoped attachment audit.
- OAuth client-credentials token lookup, credential-version checks, active attachment scope and
  location checks, and server-derived tenant context.
- Existing DGLaundry OIDC adapter and env-backed fallback compatibility.

## Compliance Preconditions

- App IDs, client credentials, attachments, tenant selectors, and tenant staff identity remain
  separate. A caller-supplied App ID, tenant selector, or company-token header grants no access.
- Client and attachment lifecycle states are checked on every partner request. Revoked credentials,
  suspended clients/apps, and inactive attachments deny newly attempted authorization.
- Plaintext browser secrets are shown only in the issue/rotation response. Hashes, public keys,
  bearer tokens, raw IP addresses, and user-agent values are excluded from lifecycle audit payloads.
- A Platform Admin page grant cannot consent for a merchant or set tenant attachment scopes.
  Merchant consent cannot assign entitlements or engine authority.
- Queued/offline work is not deleted or released here. #803 owns reconciliation and quarantine
  behavior; no fiscal, payment, or staff-permission change is authorized by this implementation.

## Verification Evidence

Syntax checks and ESLint passed for changed API JavaScript. Architecture boundaries, ADR validation,
documentation lint, compliance classification, and compatibility-seam checks passed. Seven focused
Jest suites passed (35 tests), covering lifecycle use cases, OIDC provider behavior, and DGLaundry
compatibility. The migration passed an up-twice/down check against disposable MySQL 8.0.46; the
credential and attachment tables were created with the active-pair unique index and removed cleanly.
The staged app-version gate passed. Live request-time preflight has not been executed;
`NOT-EXECUTED-*` is the normal PR-open placeholder and must be reconciled by the governed sweep.
