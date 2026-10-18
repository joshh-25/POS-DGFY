---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-10-19
related_adr: 0097-outbound-push-notification-delivery-contract.md
declaration_id: 2026-10-19-push-diagnostics-backend
classification: regulatory
surfaces: settings,compliance,privacy,pos
reason_codes_impacted: NONE
policy_version: 2026.10.19
verification_evidence: focused API Jest suites for diagnostics use cases, dispatch-event recording, redaction, route contract, migration and enrollment repository; Platform Admin component tests and build; check:architecture, lint:docs, check:compliance and app-version checks
rollback_note: Remove the push-diagnostics admin and enrollment routes and the dispatch-event recorder; the additive migration can be rolled back (it drops only the three new tables) and no existing push, order, or tenant data needs repair. Revoking the admin.push_diagnostics grant or leaving no enrolled device already disables the page and test sends.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-18T17:16:54.283Z
preflight_request_ref: PREFLIGHT-39148362837-2026-10-19-PUSH-DIAGNOSTICS-BACKEND
---

# Platform Admin Push Diagnostics

## Compliance Impact Classification

Regulatory. The change adds a Platform Admin route family and page grant in the authentication
middleware, persists operator-enrolled device tokens, and adds an operator view of push registration
and delivery metadata. Device tokens and their association with accounts, guest orders, and tenant
staff are personal data under the
[Data Privacy Act of 2012 (Republic Act No. 10173)](https://officialgazette.gov.ph/2012/08/15/republic-act-no-10173/).

## Affected Surfaces

- `apps/dgfy-api/src/middleware/auth.js` and `modules/platformAdmin/constants/permissions.js`: the new
  `admin.push_diagnostics` route classification and page grant (`settings`).
- `apps/dgfy-api/src/modules/pushDiagnostics/`, `routes/adminPushDiagnostics.js`, and
  `routes/pushDiagnosticsEnrollment.js`: read-only diagnostics, enrollment codes, test send (`privacy`).
- `apps/dgfy-api/src/modules/pushDelivery/`: best-effort recording of dispatch decisions for order
  status and POS staff new-online-order pushes (`pos`); delivery behavior is unchanged.
- `apps/dgfy-admin/Pages/PushDiagnostics.jsx`, the `/admin/push-diagnostics` route, navigation, and
  `apps/dgfy-admin/src/services/adminService.js`: Platform Admin read and controlled diagnostic-device
  actions (`settings`, `compliance`, and privacy-sensitive operational metadata).
- Landlord database: `push_dispatch_events`, `push_diagnostic_devices`, and
  `push_diagnostic_enrollment_codes` (additive migration).

## Compliance Preconditions

The diagnostics API returns no raw push token, secret value, tenant or owner identifier, tracking PIN,
order id, or provider ticket id. Registrations are identified by a pseudonymous ref (a prefix of the
keyed token hash already stored in delivery logs) and an owner *type*; orders are identified only by a
one-way keyed correlation ref. Configuration is reported as presence-only booleans. Delivery states
describe provider acceptance and receipt and never claim display on a device.

Dispatch events store a fixed reason code, optional tenant and public order reference, and a count;
they hold no token, hash, owner id, or message content, follow the 30-day push log retention, and are
written best-effort so recording failure cannot fail checkout or a status transition. Diagnostic
devices are enrolled only through a single-use, 10-minute code issued by a Platform Admin (stored as a
keyed hash); a test send accepts no body, targets only an enrolled diagnostic device, sends fixed
generic copy, is rate limited per admin and per device, and cannot reach a customer or staff
registration. Opening the overview, issuing a code, enrolling, revoking, and every test send are
audited in `platform_admin_audit_logs` without tokens, codes, or raw IP/user-agent values; the
overview fails closed if its audit row cannot be written.

The page grant is delegated only by the Platform Master. Staging and production each show only their
own database; the label comes from `DEPLOY_ENV_LABEL`. The provider stays `unconfigured` by default and
this change adds no credentials. The Platform Admin UI is included in PR #2580; no mobile client is
changed here.

No live request-time compliance preflight was executed in this local session. The
`NOT-EXECUTED-2579-2026-10-19` reference is the expected PR-open placeholder; the automatic sweep
will reconcile it after the declaration lands on `develop`.

## Verification Evidence

Focused Jest suites and repository checks are listed in the front matter and the PR's Testing
Evidence. No provider, production environment, or real device was exercised; real-device enrollment and
a live test send are post-merge verification.
