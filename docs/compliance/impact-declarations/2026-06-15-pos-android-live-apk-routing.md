---
status: reference
owner: engineering
last_reviewed: 2026-06-15
related_adr: docs/architecture/adr/0025-pos-application-shells-and-lan-host-runtime.md
declaration_id: 2026-06-15-pos-android-live-apk-routing
classification: major
surfaces: pos,terminal,android-apk
reason_codes_impacted: ALLOWED,AUTHENTICATION_FAILED,TENANT_CAPABILITY_DISABLED,VALIDATION_FAILED
policy_version: 2026.06.15
verification_evidence: npm run lint:docs,npm run check:architecture,npm run check:compliance,npm --prefix frontend run build:pos,android/imin-wrapper gradlew assembleDebug,git diff --check,production deploy summary /var/www/skupervisor/logs/deploy/deploy_20260615_143449.summary.txt
rollback_note: Revert the Android wrapper live-origin routing and manifest cleartext hardening together if the iMin APK cannot load the production POS origin.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-15T15:00:00+08:00
preflight_request_ref: POS-ANDROID-LIVE-APK-ROUTING-2026-06-15
---

# POS Android Live APK Routing

## Compliance Impact Classification

Major.

This declaration covers routing the iMin Android wrapper to the live standalone POS origin for physical-device builds. The change affects terminal startup and API origin selection, but it does not alter checkout pricing, tax computation, inventory deduction, receipt classification, terminal permissions, tenant capability enforcement, or PayMongo payment readiness.

## Affected Surfaces

1. Physical iMin devices load `https://pos.dgfy.ph/?apk_build=<timestamp>#/terminal` from the WebView wrapper.
2. The native diagnostic/login workspace defaults to `https://pos.dgfy.ph/api/v1`.
3. In-wrapper navigation remains restricted to approved hosts, including `pos.dgfy.ph` and `skupervisor.dgfy.ph`.
4. Release APK traffic no longer permits cleartext HTTP by default.
5. Emulator and development paths can still use local host routing for local validation.

## Compliance Preconditions

1. The APK remains a client shell only; backend sales, inventory, shift, receipt, and permission decisions remain server-owned.
2. POS terminal login must still use the deployed standalone POS authentication contract and must not bypass tenant lookup, tenant capability checks, or cashier permissions.
3. Checkout replay/offline behavior remains governed by ADR 0014 and must not print or open hardware workflows before server-confirmed transaction persistence.
4. Real live QR Ph payment enablement remains governed separately by ADR 0027 and the PayMongo readiness evidence contract.
5. A real iMin device smoke test is required before the APK is treated as operator-ready.

## Verification Evidence

Required validation for this branch:

1. `npm run lint:docs`
2. `npm run check:architecture`
3. `npm run check:compliance`
4. `npm --prefix frontend run build:pos`
5. `cd android/imin-wrapper && .\gradlew.bat assembleDebug`
6. `git diff --check`
7. Production deploy summary `/var/www/skupervisor/logs/deploy/deploy_20260615_143449.summary.txt`
8. Blocked release APK evidence: `cd android/imin-wrapper && .\gradlew.bat --no-daemon assembleRelease` failed in `:app:compileReleaseKotlin` because Gradle/Kotlin could not create or hash an expected cache output under `app/build/kotlin/compileReleaseKotlin`.
9. Real iMin install smoke: launch, login, catalog, checkout, receipt/history, stock deduction, session expiry/recovery, and network reconnect behavior.

## Deployment Note

Production web deployment is already the source of truth for the hosted POS app. The repository state for this APK routing change is production-deployed at SHA `062cd52cfb18854cc50632e29fa895fa0a180a72`. Local debug APK build passes and produced `android/imin-wrapper/app/build/outputs/apk/debug/app-debug.apk`; unsigned release APK build remains blocked by the Gradle/Kotlin cache output error above. Device runtime changes only after the rebuilt APK is installed on the target iMin device and validated against the production tenant.
