---
status: reference
owner: engineering
last_reviewed: 2026-08-30
related_adr: 0053-pluggable-pos-hardware-device-drivers.md
declaration_id: 2026-08-30-imin-receipt-logo-relative-url
classification: major
surfaces: pos,terminal
reason_codes_impacted: N/A
policy_version: 2026.08.30
verification_evidence: targeted iMin receipt/logo Vitest suite (49 tests),dgfy-pos production build,dgfy-ims (skupervisor) production build,npm run check:architecture,npm run check:compliance
rollback_note: Revert the absolutizeLogoSource helper, its wiring into resolveReceiptLogoSource, the three replaced/added tests, the Dockerfile ARG/ENV lines, the deploy-frontend.yml build-arg threading, and this declaration together. No payment, tax, discount, transaction, audit, API, or migration behavior changes; the LAN/USB bridge print path is unaffected (it has no bundled fallback logo).
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-30T23:00:00+08:00
preflight_request_ref: NOT-EXECUTED-321-IMIN-RECEIPT-LOGO
---

# iMin Receipt Logo Relative URL Resolution

## Compliance Impact Classification

Major. The changed files are under `packages/web-core/src/features/pos/`, whose
classification floor is `major` for the `pos,terminal` surfaces. The runtime change
absolutizes a root-relative tenant company-icon path before handing it to the native
iMin print bridge, so the physical receipt shows the tenant's configured icon instead
of silently falling back to the bundled DGFY drawable. It does not change payment
capture, fiscal calculations, transaction persistence, authorization, audit payloads,
API contracts, or database schema.

## Affected Surfaces

- `pos`, `terminal` — the native iMin receipt/order-ticket print path
  (`packages/web-core/src/features/pos/utils/iminHardwareBridge.js`).
- Non-runtime, no-op-by-default deployment knob: `infrastructure/docker/dgfy-pos/Dockerfile`
  and `.github/workflows/deploy-frontend.yml` gain an optional `VITE_ASSET_BASE_URL` build
  arg, left empty by default (existing behavior unchanged unless an operator sets it).

## Compliance Preconditions

- The tenant company-icon path resolved for the native print bridge must be a
  fetchable `http(s):` URL or a `data:` URI, matching the existing
  `isNativeFetchableLogoSource` gate — unchanged and applied last, after
  absolutization.
- An unconfigured icon, a `blob:` (page-scoped) source, or an origin that cannot be
  determined (e.g. a `file://`-equivalent opaque origin) must still resolve to `''`
  and fall back to the bundled DGFY drawable, exactly as before this change.
- An already-absolute icon URL (e.g. from a configured CDN/asset origin) must pass
  through byte-identical, with no round-trip escaping, trailing-slash, host-casing,
  or default-port changes. (`resolveReceiptLogoSource` now skips `resolveAssetUrl`
  entirely for anything already `http(s):`/`data:`, rather than relying on
  `absolutizeLogoSource` to leave it untouched — `resolveAssetUrl` itself
  round-trips its input through `new URL(...).toString()`, which would otherwise
  silently canonicalize it, e.g. lowercase an uppercase host or drop an explicit
  `:443`. Fixed per pr-reviewer finding RF-1 on this PR.)
- Receipt preview (browser) and physical print (native) must resolve the same
  `businessSettings` icon field to the same absolute asset when one is configured.
- No payment, tax, discount, inventory, transaction, audit, API, or migration
  behavior changes.

## Verification Evidence

- Targeted Vitest suite passed: 5 test files, 49 tests (48 original + 1 RF-1
  regression case) — `iminHardwareBridge.orderTicket.test.js`,
  `iminHardwareBridge.printFailure.test.js`,
  `receiptContractConformance.contract.test.js`, `iminNativeDriver.test.js`,
  `assetUrl.test.js` (run via `apps/dgfy-ims`'s Vitest config, which executes
  `packages/web-core`'s test suite). The new case asserts an already-absolute URL
  with an uppercase host and an explicit default port (`:443`) forwards to native
  byte-identical, not normalized.
- Production builds passed for `apps/dgfy-pos` and `apps/dgfy-ims` (skupervisor) —
  both consume `packages/web-core` as their shared trunk.
- `npm run check:architecture` passed.
- `npm run check:compliance` passed once this declaration was added.
- Physical-printer verification is deferred: this bug is only conclusively provable
  on real iMin hardware (an on-device WebView with a real network origin), which no
  automated test can exercise. The linked issue (#321) stays open through merge
  (`Refs #321`, not `Closes #321`) specifically so a device verification pass can
  run before it closes.

## Preflight Reconciliation

No live environment preflight was executed for this local, develop-targeted change.
`preflight_request_ref: NOT-EXECUTED-321-IMIN-RECEIPT-LOGO` explicitly records that
production verification has not been claimed. The normal promotion-time compliance
preflight remains required.

## Deployment And Rollback

No database migration or deployment sequencing is required. The new
`VITE_ASSET_BASE_URL` build arg defaults to an empty string in both the Dockerfile
and the deploy workflow, so no deployed behavior changes unless an operator
explicitly sets the corresponding repo/environment variable. Roll back by reverting
the JS fix, the three test-file changes, the Dockerfile/workflow additions, and this
declaration together.
