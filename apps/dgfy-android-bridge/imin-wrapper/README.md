# iMin Android Wrapper for DGFY POS

This is a minimal Android WebView wrapper for running the hosted DGFY POS URL on iMin hardware.

## What this wrapper already does

- Loads a hosted POS URL in a full-screen `WebView`
- Restricts navigation to allowed hosts
- Exposes a JavaScript bridge to the web app:
  - `window.iMinBridge.isIminWrapper()`
  - `window.iMinBridge.getDeviceInfo()`
  - `window.iMinBridge.openCashDrawer()`
  - `window.iMinBridge.printReceipt(...)` and `printReceiptWithLogo(...)` for compatibility
  - `window.iMinBridge.printReceiptWithLogoAsync(...)` for non-blocking branded receipts
  - `window.iMinBridge.printReceiptAsync(...)` for non-blocking text reports/order tickets
  - `window.iMinBridge.openCashDrawerAsync(...)` for non-blocking drawer commands
- Provides a stub `DrawerController` where the iMin SDK call will go

## Current live routing

The wrapper has three product flavors (`app/build.gradle.kts`, `environment` dimension), one per platform GitHub Environment (`infrastructure/docker/SENTRY.md`), so a build for any of them comes out of the same project without hand-editing source. (A fourth, `beta`, was removed 2026-08-23 (#329/#897) — beta.dgfy.ph now redirects to prod, and a WebView origin allowlist doesn't follow a cross-origin redirect, so a beta-flavored build would ship broken.)

| Flavor | Live origin | Allowed in-wrapper hosts | applicationId | App label |
| --- | --- | --- | --- | --- |
| `prod` | `https://pos.dgfy.ph` | `pos.dgfy.ph`, `skupervisor.dgfy.ph` | `com.dgfy.iminwrapper` | DGFY iMin POS |
| `staging` | `https://pos.stage.dgfy.ph` | `pos.stage.dgfy.ph`, `skupervisor.stage.dgfy.ph` | `com.dgfy.iminwrapper.stage` | DGFY iMin POS (Staging) |
| `dev` | `https://pos.dev.dgfy.ph` | `pos.dev.dgfy.ph`, `skupervisor.dev.dgfy.ph` | `com.dgfy.iminwrapper.dev` | DGFY iMin POS (Dev) |

Each flavor supplies its origin/host pair as `BuildConfig` fields (`LIVE_POS_ORIGIN`, `LIVE_POS_HOST`, `SKUPERVISOR_HOST`), which `AppConfig.kt` reads at runtime. `LIVE_POS_HOST` is derived from `LIVE_POS_ORIGIN` in `build.gradle.kts` (never typed twice), so origin and allowed-host can't drift apart. The non-`prod` flavors' `applicationIdSuffix`/`versionNameSuffix` let all three builds install side-by-side on the same device without overwriting each other, and each flavor's `app/src/<flavor>/res/values/strings.xml` overrides `app_name` so the icons stay distinguishable on the home screen.

Every origin is overridable at build time, without editing this file, via a Gradle property (or the equivalent flag on `scripts/build-android-release.sh`):

```bash
./gradlew assembleDevRelease -Pdgfy.dev.posOrigin=https://pos.example.ph
bash scripts/build-android-release.sh dev --pos-origin https://pos.example.ph
```

This matters most for `dev`/`staging`, where `pos.dev.dgfy.ph` / `pos.stage.dgfy.ph` follow the platform's subdomain convention but weren't independently confirmed live when these flavors were added — the override is a build flag, not a code change, if that assumption turns out wrong for either.

**TLS fallback (`dev`/`staging` only):** release builds default to `usesCleartextTraffic="false"` (see `buildTypes.release` in `build.gradle.kts`). `dev` and `staging` each carry their own `network_security_config.xml` (`app/src/dev/`, `app/src/staging/`) that additionally permits cleartext for that flavor's own domain plus loopback/emulator/LAN hosts — a defensive fallback in case that environment's TLS isn't set up yet, not the expected path. `prod` carries no such config and stays strictly HTTPS-only, unchanged.

Release physical-device builds route to (per flavor):

- `https://pos.<env>.dgfy.ph/?apk_build=<timestamp>#/terminal`
- `https://pos.<env>.dgfy.ph/api/v1`

The Android emulator path still uses the local development host through `10.0.2.2`, regardless of flavor.

### Building a release APK

From the repo root:

```bash
bash scripts/build-android-release.sh <dev|staging|prod> [--clean] [--pos-origin URL]
```

Copies the signed APK + `.sha256` checksum into `releases/android/`.

Or from the Actions tab: **Build Android Release (manual)** (`.github/workflows/build-android-manual.yml`) — pick `flavor`, optionally `clean` and `pos_origin`. Because it's `workflow_dispatch`, you also pick the **ref** the run builds from — including an unmerged feature branch — which is how a `dev` or `staging` APK gets verified on a real iMin device before that branch reaches `main` (`prod` only routes there today).

### Rolling back an on-device test build

Each flavor is a distinct `applicationId`, so installing a `dev` or `staging` APK never touches the `prod` app already on the device — rollback is just uninstalling that one package:

```bash
adb uninstall com.dgfy.iminwrapper.dev
adb uninstall com.dgfy.iminwrapper.stage
```

### What you need to do next

1. Open `apps/dgfy-android-bridge/imin-wrapper` in Android Studio.
2. Let Android Studio sync Gradle if prompted.
3. In the Build Variants panel (or `./gradlew assemble<Flavor>Debug`), pick the flavor for the build you want.
4. Set your final package name if you do not want `com.dgfy.iminwrapper`.
5. Build and install the APK on the iMin device.
6. Validate login, catalog, checkout, receipt/history, and stock deduction against the target tenant before treating the APK as ready for that environment.

## Frontend bridge call

Your web app should use a guarded call after successful checkout:

```js
window.iMinBridge?.openCashDrawer?.();
```

Do not call this in the browser-only path without the wrapper.

Hardware calls are feature-detected by the shared POS frontend. New wrapper builds use the
asynchronous receipt, text-print, and drawer methods and receive completion through the
`dgfy:imin-command-result` window event, keeping printer-service and Bluetooth waits off the WebView thread.
Older installed APKs remain compatible through `printReceiptWithLogo(...)` or
`printReceipt(...)`, but those legacy calls are synchronous.

On iMin hardware, the built-in printer service is attempted first. Only a confirmed pre-send
failure falls back to a paired printer-like Bluetooth device. Native callbacks and Bluetooth
connections are deadline-bounded so an uncertain result is reported without repeating the
receipt or drawer pulse.

## Recommended implementation order

1. Confirm `https://pos.dgfy.ph` works on the device network.
2. Install the wrapper APK on the iMin terminal.
3. Verify the WebView loads the POS.
4. Integrate the real iMin SDK drawer call.
5. Add the frontend `openCashDrawer()` call after successful checkout.

## Important limitation

This scaffold does **not** include the real iMin SDK dependency yet because that depends on:

- your exact iMin model
- the SDK package/version you will use
- the cash drawer connection path on that device

The current drawer implementation is a stub by design.
