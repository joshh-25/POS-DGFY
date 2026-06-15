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

## What you must change first

Update [AppConfig.kt](./app/src/main/java/com/dgfy/iminwrapper/AppConfig.kt):

```kotlin
const val HOSTED_POS_URL = "https://pos.example.com"
val ALLOWED_HOSTS = setOf("pos.example.com")
```

Replace:

- the hosted POS URL
- the allowed host list

## What you need to do next

1. Open `android/imin-wrapper` in Android Studio.
2. Let Android Studio create Gradle wrapper files if prompted.
3. Set your final package name if you do not want `com.dgfy.iminwrapper`.
4. Replace the drawer stub in [DrawerController.kt](./app/src/main/java/com/dgfy/iminwrapper/DrawerController.kt) with the real iMin SDK call for your device model.
5. Build and install the APK on the iMin device.

## Frontend bridge call

Your web app should use a guarded call after successful checkout:

```js
window.iMinBridge?.openCashDrawer?.();
```

Do not call this in the browser-only path without the wrapper.

## Recommended implementation order

1. Confirm the hosted POS URL works on the device network.
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
