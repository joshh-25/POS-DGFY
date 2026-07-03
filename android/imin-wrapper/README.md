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

Release physical-device builds route to:

- `https://pos.dgfy.ph/?apk_build=<timestamp>#/terminal`
- `https://pos.dgfy.ph/api/v1`

Allowed in-wrapper production hosts are:

- `pos.dgfy.ph`
- `skupervisor.dgfy.ph`

The Android emulator path still uses the local development host through `10.0.2.2`.
Debug APK builds for physical devices use the local LAN host `10.123.37.45` and enable cleartext traffic so they can connect to the local POS/backend stack.

## What you need to do next

1. Open `android/imin-wrapper` in Android Studio.
2. Let Android Studio sync Gradle if prompted.
3. Set your final package name if you do not want `com.dgfy.iminwrapper`.
4. Build and install the APK on the iMin device.
5. Validate login, catalog, checkout, receipt/history, and stock deduction against the production tenant before treating the APK as live-ready.

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
