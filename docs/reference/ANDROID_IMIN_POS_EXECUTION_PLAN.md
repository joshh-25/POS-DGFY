---
status: reference
authority_level: reference
owner: mobile
last_reviewed: 2026-06-03
applies_to: android_imin_pos_wrapper
topic: android_studio_execution_plan
---

# Android iMin POS Execution Plan

## Source Documents

Authoritative planning inputs:

1. `docs/START_HERE.md`
2. `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
3. `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
4. `docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md`
5. `docs/architecture/adr/0025-pos-application-shells-and-lan-host-runtime.md`
6. `docs/deployment/PWA_SURFACE_CONTRACT.md`

## Goal

Ship the standalone POS to Android-based iMin hardware through Android Studio while keeping:

- backend on the Windows/LAN host
- MySQL on the Windows/LAN host
- printer and drawer orchestration on the Windows host by default

The Android client is a thin app shell around the hosted POS surface.

## Current Repo State

Android wrapper scaffold already exists at:

- `android/imin-wrapper/`

Current wrapper responsibilities:

- full-screen WebView host for the POS URL
- host allowlist
- JavaScript bridge
- drawer controller stub

## Runtime Topology

```text
Production Host
├── Backend behind https://pos.dgfy.ph/api
├── MySQL
├── Device Bridge where configured
└── ESC/POS Printer + Drawer where configured

iMin Android Device
└── Android WebView Wrapper -> https://pos.dgfy.ph/#/terminal
```

The release APK now routes physical iMin devices to the live standalone POS origin by default:

- POS URL: `https://pos.dgfy.ph/?apk_build=<timestamp>#/terminal`
- API base URL: `https://pos.dgfy.ph/api/v1`
- Allowed in-wrapper hosts: `pos.dgfy.ph` and `skupervisor.dgfy.ph`

The emulator path still supports local development through `10.0.2.2` and the existing Vite/backend ports.

## Phase 1: ADR Alignment

ADR 0025 currently establishes Android as a POS client lane. Before release work, update the ADR or add a narrow follow-up note confirming:

- Android iMin delivery uses the existing Android Studio WebView wrapper
- hosted POS remains the UI source
- backend/device ownership stays on the Windows host
- Android drawer integration is optional and deferred until the core wrapper is stable

## Phase 2: Runtime Readiness

For production APK validation, the hosted POS must be reachable from the iMin device over the internet or the store network that can resolve the production domain.

Required production URLs:

- POS frontend: `https://pos.dgfy.ph/`
- backend API through POS origin: `https://pos.dgfy.ph/api/v1`

Local/LAN validation remains available for emulator and development builds only.

Required host URLs:

- POS frontend: `http://<HOST-IP>:5174/`
- backend API: `http://<HOST-IP>:5001/`

Validation:

1. POS loads from the iMin device at `https://pos.dgfy.ph/`
2. login succeeds
3. catalog loads
4. checkout calls reach the backend
5. uploads and product images resolve from the production POS origin

## Phase 3: Android Wrapper Configuration

Files:

- `android/imin-wrapper/app/src/main/java/com/dgfy/iminwrapper/AppConfig.kt`
- `android/imin-wrapper/app/src/main/java/com/dgfy/iminwrapper/MainActivity.kt`

Required configuration:

1. keep release physical-device routing on `https://pos.dgfy.ph`
2. keep `ALLOWED_HOSTS` limited to approved production and development hosts
3. set app label, package name, and launcher assets
4. confirm WebView settings:
   - JavaScript enabled
   - DOM storage enabled
   - safe navigation policy
   - restricted host navigation

## Phase 4: Session And Terminal Bootstrap

The wrapper must preserve the same POS terminal model already used by the web and desktop shells.

Bootstrap requirements:

1. backend host URL is configurable
2. company token is configurable
3. terminal ID is configurable
4. credentials remain user-entered
5. logout and session expiry return cleanly to POS login

## Phase 5: JavaScript Bridge Surface

Current bridge file:

- `android/imin-wrapper/app/src/main/java/com/dgfy/iminwrapper/IminBridge.kt`

Phase 1 bridge scope:

- `isIminWrapper()`
- `getDeviceInfo()`

Deferred bridge scope:

- `openCashDrawer()`

Guardrail:

Do not make Android drawer control the default operational path until the exact iMin SDK and hardware model are proven stable.

## Phase 6: Android Studio Build

Open:

- `android/imin-wrapper`

Build tasks:

1. sync Gradle project
2. generate wrapper files if Android Studio requests them
3. build debug APK
4. define release signing config
5. build release APK for store deployment

Current Android settings:

- `compileSdk = 34`
- `targetSdk = 34`
- `minSdk = 26`
- Kotlin + AndroidX WebKit

## Phase 7: Real Device Validation

Run on the actual iMin device.

Required checks:

1. app launches to POS
2. POS login works against LAN backend
3. catalog and images load
4. cart and checkout work
5. session expiry is recoverable
6. app resumes cleanly after backgrounding
7. network loss and reconnect behavior are acceptable

## Phase 8: Device Capabilities

Only after the wrapper is stable:

1. choose whether drawer open stays host-managed or moves to iMin hardware
2. if using iMin SDK:
   - wire the SDK dependency
   - replace the drawer stub in `DrawerController.kt`
   - expose a guarded frontend call through `window.iMinBridge?.openCashDrawer?.()`

Recommended order:

- keep host-managed drawer first
- add iMin-local drawer later

## Phase 9: Release Hardening

Before rollout:

1. disable unsafe WebView debugging in release
2. lock navigation to approved hosts
3. define versioning policy
4. define APK signing and storage
5. document host-IP change procedure
6. document store deployment and rollback

## Verification Gates

Required before rollout:

1. `npm run build:pos`
2. `npm run check:architecture`
3. Android debug build passes
4. Android release build passes
5. real iMin device smoke test passes
6. rollback path documented
7. production POS route smoke confirms `https://pos.dgfy.ph` renders the terminal shell without a framework overlay

## Recommended Implementation Order

1. update ADR alignment for Android wrapper runtime
2. validate hosted POS on production origin for release APKs, or LAN for development APKs
3. configure `AppConfig.kt`
4. open `android/imin-wrapper` in Android Studio
5. build and install debug APK on iMin
6. validate login/catalog/checkout
7. add drawer integration only after the wrapper path is stable
