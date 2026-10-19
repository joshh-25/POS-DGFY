---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-19
related_adr: docs/architecture/adr/0097-outbound-push-notification-delivery-contract.md
declaration_id: 2026-10-19-push-diagnostics-visibility
classification: regulatory
surfaces: settings,compliance
reason_codes_impacted: NONE
policy_version: 2026.10.19
verification_evidence: 5 focused backend Jest suites (91 tests), 2 Platform Admin Vitest suites (58 tests), admin production build, architecture and ADR checks, docs lint, compliance gate, changed-file syntax checks, develop-base version-floor audit, and rendered desktop/mobile UI evidence with mocked API data
rollback_note: Revert the visibility routes, availability read, Platform Admin controls, focused tests, docs, and this declaration together; the additive migration down drops only push_diagnostics_app_settings and does not touch existing diagnostic devices, enrollment codes, push logs, or dispatch events.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-19T11:34:52.000Z
preflight_request_ref: NOT-EXECUTED-2602-2026-10-19
---

# Push diagnostics per-app visibility (#2602, Phase 518)

## Compliance Impact Classification

Regulatory. The Platform Admin service path is classified at the `settings,compliance` regulatory
floor. This change adds guarded operator controls and a landlord setting, plus a session-less mobile
read that exposes only one boolean for one of three fixed app names. It does not expose a token,
identity, customer record, diagnostic-device detail, or provider information, and the availability
value controls screen visibility only rather than authorizing enrollment or test sends.

## Affected Surfaces

- Platform Admin page and service: confirmed on/off controls for `storefront`, `pos`, and `fiscalpos`
  behind the existing `admin.push_diagnostics` grant.
- Landlord data: `push_diagnostics_app_settings` records the app, boolean value, timestamps, and
  nullable updating admin reference; changed values and audit rows are transactional.
- Mobile availability: a session-less, per-IP-limited endpoint returns only `{enabled}`. It requires
  a supported app and a present, well-formed client-supplied brand label; the brand does not select a
  separate setting. Invalid input returns `{enabled:false}`, and a storage error returns a generic
  `503` with `Cache-Control: no-store`.

## Compliance Preconditions

The switch changes diagnostics-screen visibility only. It does not change enrollment, outstanding
code validity, device revocation, test-send targeting, or customer/staff push delivery. A missing
setting defaults off. Turning visibility off may take up to the documented 30-second cache lifetime
to reach a device. No mobile client implementation or production migration is part of this PR.

**Live request-time compliance preflight was not executed in this local session.** The
`NOT-EXECUTED-2602-2026-10-19` reference is the expected develop-PR placeholder; the governed sweep
reconciles it before promotion. The front matter records the declaration's placeholder status and is
not runtime evidence.

## Verification Evidence

Focused tests, repository checks, build output, and rendered UI evidence are listed in Phase 518 and
the implementation PR's Testing Evidence. No provider, production environment, migration deployment,
or real device was exercised.
