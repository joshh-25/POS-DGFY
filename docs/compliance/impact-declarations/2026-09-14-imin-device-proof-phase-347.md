---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-14
declaration_id: 2026-09-14-imin-device-proof-phase-347
classification: major
surfaces: pos,terminal,android,device-enrollment
reason_codes_impacted: POS_DEVICE_ENROLLMENT
policy_version: 2026.09.14
verification_evidence: Android unit tests for all flavors, dev and staging release APK builds with lint-vital, focused diff check
rollback_note: Revert the Phase 347 AndroidX WebKit transport, Keystore identity/signing service, native activation/challenge helpers, backup exclusions, tests, and ledger/declaration together; Phase 346 server enforcement remains unchanged and strict policy remains opt-in.
preflight_result: no_breach
preflight_reason_code: POS_DEVICE_ENROLLMENT
preflight_run_at: 2026-09-14T21:00:00+08:00
preflight_request_ref: PHASE-347-LOCAL-IMPLEMENTATION
---

# iMin device proof transport and Keystore identity

## Compliance Impact Classification

Major because the change introduces a per-install signing identity and an
origin-bound transport used by strict POS device enrollment. The implementation
does not alter the Phase 346 server policy or enable strict enforcement by
default.

## Affected Surfaces

- iMin Android POS WebView origin and main-frame message transport.
- Android Keystore key generation, public enrollment metadata, key-loss recovery,
  and cryptographic request signing.
- Native activation/challenge API payloads and Android backup/data-transfer rules.

## Compliance Preconditions

- The EC P-256 private key remains inside Android Keystore and is never exposed
  to JavaScript, preferences, backup data, logs, or API payloads.
- The proof object is registered only for the flavor's exact live POS origin;
  subframes and local/custom origin overrides cannot access it. Typed requests
  are limited to approved POS/auth paths and canonicalized before signing.
- Key loss or restored metadata creates a new device identity, requires
  reenrollment, and blocks signing until local activation completion is recorded.
  The server remains the authority for enrollment, binding, expiry, and replay.
- Security level and hardware-backed status are reported from `KeyInfo`; the
  implementation explicitly reports attestation as not requested and makes no
  universal hardware-attestation claim.

## Verification Evidence

- `./gradlew.bat test` passed the prod, staging, and dev debug unit-test suites,
  including ES256 interoperability, canonical body/path ordering, tenant and
  challenge binding, malformed request rejection, route restriction, and
  wrong-origin/subframe rejection.
- `./gradlew.bat assembleDevRelease` and `./gradlew.bat assembleStagingRelease`
  passed including lint-vital and produced release APKs. Physical iMin validation remains required for actual
  hardware-backed security level, key-loss recovery, signed-upgrade behavior,
  API replay consumption, tenant switching, and authenticated enrollment.
- No database migration, deployment, or production configuration change was
  executed in this local Phase 347 session.

This declaration covers the authorized local Phase 347 implementation only;
the phase remains in progress pending physical-device acceptance.
