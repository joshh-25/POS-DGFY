---
status: reference
owner: engineering
last_reviewed: 2026-06-04
applies_to: android_imin_pos_wrapper
topic: android_studio_setup_steps
---

# Android Studio Setup Steps For DGFY iMin POS

This guide is for opening, configuring, building, and installing the Android iMin POS wrapper in Android Studio.

Project folder:

- `C:\xampp\htdocs\POS-DGFY\android\imin-wrapper`

Android Studio executable:

- `C:\Program Files\Android\Android Studio\bin\studio64.exe`

## Goal

Run the hosted DGFY POS inside an Android WebView wrapper on your iMin Android device.

## Before You Start

Make sure these are ready first:

1. Android Studio is installed.
2. The hosted POS URL is already working in browser.
3. Your iMin device and your backend host are on the same LAN.
4. USB debugging is enabled on the iMin device.
5. You know the POS URL you want the wrapper to open.

## Step 1: Open The Project In Android Studio

1. Open Android Studio.
2. On the welcome screen, click `Open`.
3. Select this folder:
   - `C:\xampp\htdocs\POS-DGFY\android\imin-wrapper`
4. Wait for Android Studio to load the Gradle project.

## Step 2: Let Gradle Sync Finish

1. If Android Studio asks to trust the project, accept it.
2. If Android Studio asks to sync Gradle, allow it.
3. Wait until the bottom status bar shows that indexing and Gradle sync are finished.
4. If Android Studio asks to install SDK components, install them.

Do not continue until the project loads without Gradle errors.

## Step 3: Configure The Hosted POS URL

Open this file:

- `app/src/main/java/com/dgfy/iminwrapper/AppConfig.kt`

Update these values:

```kotlin
const val HOSTED_POS_URL = "http://YOUR-LAN-IP:5174/terminal"
val ALLOWED_HOSTS = setOf("YOUR-LAN-IP")
```

Example:

```kotlin
const val HOSTED_POS_URL = "http://192.168.1.10:5174/terminal"
val ALLOWED_HOSTS = setOf("192.168.1.10")
```

Rules:

1. Use the real LAN IP of the machine serving the POS.
2. Do not use `localhost` unless the Android device itself is running the POS server.
3. Keep the host in `ALLOWED_HOSTS` aligned with the URL host.

## Step 4: Review The Main Wrapper Files

You do not need to change these yet, but know where they are:

- `app/src/main/java/com/dgfy/iminwrapper/MainActivity.kt`
  - WebView startup and wrapper behavior
- `app/src/main/java/com/dgfy/iminwrapper/IminBridge.kt`
  - JavaScript bridge exposed to the web app
- `app/src/main/java/com/dgfy/iminwrapper/DrawerController.kt`
  - cash drawer stub for future iMin SDK integration

For the first install, leave the drawer stub alone.

## Step 5: Connect The iMin Device

1. Connect the iMin Android device by USB.
2. Enable Developer Options on the device if not already enabled.
3. Enable `USB debugging`.
4. Accept the debugging authorization prompt on the iMin device.
5. In Android Studio, confirm the device appears in the target device list.

If the device does not appear:

1. reconnect the cable
2. confirm USB debugging is enabled
3. accept the RSA prompt on device
4. set USB mode to file transfer if needed

## Step 6: Build The Debug APK

In Android Studio:

1. Click `Build`
2. Click `Make Project`

If build succeeds, create or run the debug app:

1. Choose your connected iMin device in the top device selector
2. Click `Run`

Android Studio will install the debug build automatically.

## Step 7: Launch The App On The Device

After install:

1. Open the app on the iMin device
2. Wait for the WebView to load the hosted POS
3. Confirm the terminal screen appears

You should verify:

1. login screen works
2. terminal page loads
3. catalog loads
4. images load
5. checkout UI renders correctly
6. backend requests succeed over LAN

## Step 8: First Smoke Test Checklist

Test these in order:

1. App opens without crash
2. POS login works
3. terminal screen loads fully
4. catalog search works
5. add item to cart works
6. checkout request reaches backend
7. no white screen
8. no blocked host navigation error

If the app opens but nothing loads:

1. verify the LAN IP in `AppConfig.kt`
2. verify port `5174` is reachable from the iMin device
3. verify backend and frontend are actually running
4. verify device and host are on the same Wi-Fi or LAN

## Step 9: Only After App Stability, Add Hardware Integration

Do not do this first.

After the wrapper is stable:

1. get the exact iMin SDK for your hardware model
2. update `DrawerController.kt`
3. replace the stub with the real iMin cash drawer call
4. expose only guarded hardware actions from the wrapper
5. test cash drawer open after successful checkout only

## Step 10: Build A Release APK Later

Do this only after debug testing is stable.

Later steps:

1. configure signing
2. build release APK
3. install release build on the target iMin hardware

## Recommended Working Order

1. make POS web runtime stable
2. point wrapper to hosted LAN URL
3. install debug app on iMin
4. verify WebView POS flow
5. add drawer SDK integration
6. build signed release APK

## Files You Will Most Likely Edit First

- `app/src/main/java/com/dgfy/iminwrapper/AppConfig.kt`
- `app/src/main/java/com/dgfy/iminwrapper/DrawerController.kt`

## Current Recommended URL Pattern

Use a direct LAN URL such as:

```text
http://192.168.1.10:5174/terminal
```

Do not use:

```text
http://127.0.0.1:5174/terminal
http://localhost:5174/terminal
```

unless the Android device itself is hosting that service, which it is not in your current architecture.
