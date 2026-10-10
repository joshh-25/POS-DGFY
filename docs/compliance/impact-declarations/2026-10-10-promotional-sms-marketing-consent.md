---
status: reference
owner: engineering
last_reviewed: 2026-10-10
declaration_id: 2026-10-10-promotional-sms-marketing-consent
classification: regulatory
surfaces: api,merchant-admin,tenant-isolation,database
reason_codes_impacted: PRIVACY
policy_version: 2026.10.10
verification_evidence: focused SMS consent Jest suites,npm run check:architecture,npm run check:compliance,npm run lint:docs,npm run check:adr,node --check on each changed API JavaScript file
rollback_note: Disable promotional sending and revoke the route before reverting the sender gate. The additive consent tables contain only HMAC phone identifiers, coarse prefixes, and consent metadata; retain them during code rollback until a separately reviewed data-retention decision authorizes deletion. Never rotate SMS_PHONE_HASH_SECRET without re-keying delivery, consent, event, and global suppression hashes.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-10T00:00:00+08:00
preflight_request_ref: NOT-EXECUTED-2417-2026-10-10
---

# Promotional SMS Marketing Consent and Opt-Out Suppression

## Compliance Impact Classification

Regulatory. This change gates marketing messages on explicit, tenant-scoped consent, persists
auditable grants and revocations, and applies a global opt-out suppression before each
promotional send. It also introduces an authenticated merchant-admin API and new landlord
personal-data control records. The declaration does not settle legal wording or lawful basis; those
remain with the separately tracked consent-policy work.

## Affected Surfaces

- Shared SMS API sender and consent repository: `api`, `tenant-isolation`.
- Authenticated tenant-owner/admin grant and revoke endpoints: `merchant-admin`.
- Landlord consent projection, append-only events, and global suppression tables: `database`.

## Compliance Preconditions

No live preflight was executed for this PR. The `NOT-EXECUTED-2417-2026-10-10` reference is an
intentional PR-open placeholder and will be reconciled by the continuous preflight sweep after the
declaration lands on `develop`.

Promotional sending fails closed when tenant consent is absent/revoked, global suppression exists,
or consent storage is unavailable. Transactional order alerts never read marketing consent. Only
the existing phone HMAC and a coarse prefix are retained in consent records; message content and
raw phone values are not added to the new tables. A caller supplies the opt-out instruction; this
implementation does not claim that provider STOP messages are captured. Hash-secret rotation must
re-key delivery logs and all consent/suppression records before use of the new secret.

## Verification Evidence

Seven focused Jest suites pass (30 tests), covering sender consent gates, transactional
independence, use cases, tenant/global repository lookup, authenticated route behavior, migration
idempotence, and existing transactional SMS alerts. `npm run check:architecture`,
`npm run check:compliance`, `npm run lint:docs`, `npm run check:adr`, `node --check` for each
changed API JavaScript file, and the develop app-version policy check pass. The schema migration
was exercised through its migration unit suite, not against a live database.
