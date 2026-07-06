# iMin Android Wrapper for DGFY POS

This is a minimal Android WebView wrapper for running the hosted DGFY POS URL on iMin hardware.

## What this wrapper already does

- Loads a hosted POS URL in a full-screen `WebView`
- Restricts navigation to allowed hosts
- Exposes a JavaScript bridge to the web app:
  - `window.iMinBridge.isIminWrapper()`
  - `window.iMinBridge.getDeviceInfo()`
  - `window.iMinBridge.openCashDrawer()`
- Provides a stub `DrawerController` where the iMin SDK call will go

## Current live routing

The wrapper has two product flavors (`app/build.gradle.kts`, `environment` dimension) so both a production build and a beta build can come out of the same project without hand-editing source:

| Flavor | Live origin | Allowed in-wrapper hosts | applicationId | App label |
| --- | --- | --- | --- | --- |
| `prod` | `https://pos.dgfy.ph` | `pos.dgfy.ph`, `skupervisor.dgfy.ph` | `com.dgfy.iminwrapper` | DGFY iMin POS |
| `beta` | `https://pos.beta.dgfy.ph` | `pos.beta.dgfy.ph`, `skupervisor.beta.dgfy.ph` | `com.dgfy.iminwrapper.beta` | DGFY iMin POS (Beta) |

Each flavor supplies its origin/host pair as `BuildConfig` fields (`LIVE_POS_ORIGIN`, `LIVE_POS_HOST`, `SKUPERVISOR_HOST`), which `AppConfig.kt` reads at runtime. The `beta` flavor's `applicationIdSuffix`/`versionNameSuffix` let a beta build install side-by-side with a prod build on the same device without overwriting it, and `app/src/beta/res/values/strings.xml` overrides `app_name` to "DGFY iMin POS (Beta)" so the two icons are distinguishable on the home screen.

Release physical-device builds route to (per flavor):

- `https://pos.<env>.dgfy.ph/?apk_build=<timestamp>#/terminal`
- `https://pos.<env>.dgfy.ph/api/v1`

The Android emulator path still uses the local development host through `10.0.2.2`, regardless of flavor.

## What you need to do next

1. Open `android/imin-wrapper` in Android Studio.
2. Let Android Studio sync Gradle if prompted.
3. In the Build Variants panel (or `./gradlew assembleBetaDebug` / `assembleProdDebug`), pick the `beta` or `prod` flavor for the build you want.
4. Set your final package name if you do not want `com.dgfy.iminwrapper`.
5. Build and install the APK on the iMin device.
6. Validate login, catalog, checkout, receipt/history, and stock deduction against the target tenant (beta or production) before treating the APK as ready for that environment.

## Frontend bridge call

Your web app should use a guarded call after successful checkout:

```js
window.iMinBridge?.openCashDrawer?.();
```

Do not call this in the browser-only path without the wrapper.

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
