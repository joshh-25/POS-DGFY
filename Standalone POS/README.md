# Standalone POS Android Studio Project

This folder is now the dedicated Android Studio and React Native host project for the standalone hardware POS track.

## Open in Android Studio

Open this folder directly:

`C:\xampp\htdocs\POS-DGFY\Standalone POS`

Android Studio should detect it as a Gradle Android application project.

## What this project is

- a real Android Studio project you can open and sync
- a React Native Android host for the standalone POS app layer
- separate from the existing `android/imin-wrapper` project

## Bound app layer

The Android host bootstraps from:

`Standalone POS/index.js`

That entry loads the actual standalone POS app from:

`../mobile/hardware-pos/src/app/App.tsx`

## Current runtime status

- boots the shared React Native cashier app from `mobile/hardware-pos`
- includes native module boundaries for SQLite, printer, drawer, diagnostics, and sync worker
- keeps the Android host thin so most UI and flow edits happen in the shared app workspace

## Current standalone POS UI source

The actual standalone POS UI/code we already built is here:

`C:\xampp\htdocs\POS-DGFY\mobile\hardware-pos`

Key files:

- [App.tsx](C:/xampp/htdocs/POS-DGFY/mobile/hardware-pos/src/app/App.tsx)
- [store.ts](C:/xampp/htdocs/POS-DGFY/mobile/hardware-pos/src/app/store.ts)
- [screens](C:/xampp/htdocs/POS-DGFY/mobile/hardware-pos/src/app/screens)
- [components](C:/xampp/htdocs/POS-DGFY/mobile/hardware-pos/src/app/components)

## Next step after you confirm this folder opens

1. install Node dependencies in this folder
2. let Android Studio sync the React Native Gradle plugin
3. run the app against the native modules and confirm device permissions/runtime setup
4. continue UI and flow edits in `mobile/hardware-pos`
