# POS Sentry-Independent Debug Runbook

Status: authoritative
Owner: engineering
Last reviewed: 2026-08-07

Use this runbook whenever a POS terminal (especially an iMin device) shows a failure and Sentry shows nothing. Sentry only ever sees what `apps/dgfy-web/src/services/api.js`'s axios interceptors hand it -- a request that never leaves the device, or a failure that's a locally-thrown error upstream of axios entirely, is invisible to Sentry by construction. Every channel below is independent of it.

This runbook exists because of [DGFY-283](https://github.com/Sieitzz/dgfy-platform/issues/283): an iMin dev terminal showed "Unable to reach the POS backend" with nothing in Sentry, and the actual cause (a 31-day-old stale shift blocking Open Shift on COUNTER-01) was found entirely through the channels below, without Sentry ever entering the picture.

## 1. Start with the access log

The single most useful artifact. Every request that left the device, succeeded or not, is here -- regardless of whether the client-side code that triggered it was instrumented at all.

```bash
ssh sieitz-dgfy-remote          # -> vm-sieitzstaging, no sudo needed (adm group)
tail -f /var/log/nginx/access.log | grep -i "DGFY-iMin-WebView"
```

Look for:

- **The request sequence stopping partway through a known flow.** DGFY-283's flow was `pos-session → users/me → settings → shifts/current → users/me → shifts/current?terminal_id=…` and then *nothing* -- `shifts/open` never appears. That absence, not an error status, was the tell: the client threw before ever calling the endpoint.
- **Every status is 200/304.** If nothing 4xx/5xx/network-shaped shows up, the backend did its job; the bug is client-side logic, not connectivity. Go to §4.
- **User-Agent.** Confirms which physical device class actually made the request -- don't assume the newest Sentry event is the same device that's broken. In DGFY-283, several UAs shared the log (Windows Chrome 151 desktop, an Android emulator on Chrome 91, and the real iMin on Chrome 80.0.3987.132) and only the last is the field unit.
- **`okhttp/…` User-Agent.** This is React Native's HTTP stack (`Standalone POS/`, `mobile/hardware-pos/`), not the iMin -- the iMin wrapper (`apps/dgfy-android-bridge/imin-wrapper/`) uses `java.net.HttpURLConnection` and has no okhttp dependency at all. Don't attribute okhttp traffic to an iMin device.

Once `infrastructure/nginx-host/dev.dgfy.ph.conf`'s `dgfy_dev_debug` log format is applied (`nginx -t && systemctl reload nginx` after copying it to `/etc/nginx/sites-available/dgfy-dev-staging` -- see that file's header for the full procedure), every line also carries `terminal=` and `ref=` fields sourced from `X-POS-Terminal-Id`/`X-POS-Error-Ref` (sent by `apps/dgfy-web/src/services/api.js` on the POS surface only). A cashier can read a reference code off the on-screen failure panel and you can find that exact request by `grep ref=<code>`, with no Sentry lookup at all.

## 2. Check the dev stack itself is healthy

```bash
ssh sieitz-dgfy-remote
cd /opt/dgfy-dev
docker compose ps                              # all four services should be "healthy"
curl -s http://127.0.0.1:5000/api/v1/health | head -c 1000   # database/redis/runtimeSchema
```

If this is unhealthy, that *is* the incident -- stop here and fix it rather than chasing the client.

## 3. adb logcat -- works even with zero network

```bash
adb logcat -s WebPosActivity:V chromium:V
```

`WebPosActivity.onConsoleMessage` (`apps/dgfy-android-bridge/imin-wrapper/app/src/main/java/com/dgfy/iminwrapper/WebPosActivity.kt`) routes every WebView console message into Logcat, and the activity itself logs page lifecycle (`onPageStarted`, the resolved load URL, the resolved origin). This is available on any build variant, requires only a USB connection, and would have shown the DGFY-283 failure immediately (a local `throw new Error(...)` still writes an uncaught-exception line to the console, which Logcat catches even though Sentry -- at the time -- did not).

## 4. chrome://inspect -- full Network + Console tabs, real device

`WebView.setWebContentsDebuggingEnabled(true)` is already called in `WebPosActivity.kt`, but gated on the manifest's `FLAG_DEBUGGABLE` so it can never be live in a release APK. **The APKs produced by `scripts/build-android-release.sh` are release builds**, so this is off by default on a normal test unit.

To use it: install the `devDebug` build variant instead (distinct application id `com.dgfy.iminwrapper.dev`, so it can sit side-by-side with whatever release build is already on the device):

```bash
cd apps/dgfy-android-bridge/imin-wrapper
./gradlew assembleDevDebug
adb install -r app/build/outputs/apk/dev/debug/app-dev-debug.apk
```

Then, on a desktop Chrome with the device connected over USB, open `chrome://inspect`, find the WebView, and click **inspect**. You get the real Network tab (request/response bodies, timing, headers) and Console against the actual Chrome 80 WebView -- not a proxy or a guess from a parsed User-Agent string.

**Recommendation:** keep one iMin permanently on the `devDebug` variant as the standing diagnostic unit, separate from whatever the team actually transacts on.

## 5. The in-app diagnostics panel and ring buffer

`apps/dgfy-web/src/services/api.js` exports `getRecentApiOutcomes()` -- an in-memory ring buffer of the last ~10 API outcomes (success and failure alike) captured directly off axios's own request/response lifecycle, independent of Sentry. `onApiOutcome(callback)` lets a component subscribe to outcomes live; it's what drives the terminal's Online/Offline indicator off real reachability instead of `navigator.onLine` alone (which on Android is true whenever *any* network interface exists, even one that can't reach `pos.dev.dgfy.ph`).

The Open Shift dialogs (`apps/dgfy-web/src/features/pos/pages/TerminalPage.jsx`) show a persistent inline failure panel with a short reference code (`reportTerminalFailure`) instead of relying on the auto-dismissing top-right toast that made DGFY-283 unreadable on-device. That same code is what `X-POS-Error-Ref` carries into the access log (§1) and what `captureTerminalFlowFailure` tags Sentry events with, when Sentry does have something to say.

## 6. Prove Sentry delivery works from a specific device

Sentry's silence during an incident does not by itself mean Sentry is broken -- it may simply never have been wired to catch that failure (exactly DGFY-283's case). To settle whether delivery itself works from a given device/WebView version:

```js
window.__sentryTestError()
```

Run this from the `chrome://inspect` console (§4). It's registered by `apps/dgfy-web/src/observability/sentryClient.js` whenever the resolved Sentry environment is not `PROD` (previously gated on `import.meta.env.DEV`, a Vite build-mode flag that is false on every deployed build including DEV/STAGING/BETA -- so it never actually existed outside a local `vite dev` server until this was fixed). Confirm the resulting event lands in the `dgfy-pos` project tagged with the right `webview_chrome_major`.

## 7. Server-side occupancy logging

If the failure is specifically "Open Shift" being blocked, `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`'s `buildGetCurrentTerminalShiftUseCase` logs one line (`logger.info`, tag `[POS][TerminalOccupancy]`) whenever it returns a non-free `terminal_occupancy` -- terminal, location, requesting user, occupying shift id, occupying user, and how long the occupying shift has been open. Visible via:

```bash
ssh sieitz-dgfy-remote
cd /opt/dgfy-dev
docker compose logs backend --since 1h | grep TerminalOccupancy
```

A large `occupied_age_hours` is the DGFY-283 pattern: not a genuine concurrent-cashier conflict, but a shift nobody closed.

## Reference: dev environment topology

- Host: `ssh sieitz-dgfy-remote` (resolves to `vm-sieitzstaging`)
- Compose dir: `/opt/dgfy-dev` (services: `mysql`, `redis`, `backend`, `frontend`; no containerized nginx -- see `infrastructure/nginx-host/dev.dgfy.ph.conf`)
- Backend: `127.0.0.1:5000`; frontend surfaces: `:8081` (skupervisor), `:8082` (pos), `:8083` (store)
- TLS terminates upstream of the host nginx; every vhost block is plain `listen 80`
