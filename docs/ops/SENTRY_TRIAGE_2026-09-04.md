---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-04
applies_to: deploy_operations
topic: sentry_triage_2026_09_04
---

# Sentry Triage — 2026-09-04

Org `ch-temp` | region `https://de.sentry.io` | period 7d (issues scanned per-project at 14d, per
the 08-30 methodology note) | **34 unresolved** across all 4 projects
(`dgfy-backend`: 4, `dgfy-pos`: 7, `dgfy-skupervisor`: 1, `dgfy-store`: 22).
Eighth Observer pass. Previous pass: [2026-08-30](./SENTRY_TRIAGE_2026-08-30.md).

Five new-since-last-pass root causes this run, one of them genuinely novel and filed
(`a-c-innovative-solutions`'s missing `service_booking_line_options` table); two others are a
`main`-boot crash (`DGFY-BACKEND-8`) and a frontend `ReferenceError` (`DGFY-SKUPERVISOR-1`) whose
fixes are both confirmed ancestors of the *current* PROD/`main` head — genuinely fixed, not yet
window-clean. One (`DGFY-STORE-1M`) correlates to an already-open SMTP-misconfig issue and was
commented there instead of filed. Everything else is a continuation of a disposition already made
in a prior pass.

## Release timeline

| Environment | Release(s) in 7d events | Notes |
|---|---|---|
| PROD (`main`) | `214a56a458d` (current head, PR #1547 `release/2026-09-04`, merged 2026-09-04T02:39 +08), `568bbe5f88b`, `9fa1717cffd`, `025e70df20b`, `7a343fcbb41`, `fe242fac075`, `24e00f402cf` (older, DEV-only sample) | `214a56a458d` is confirmed both the newest sampled PROD release **and** `origin/main`'s actual current head — findings sampled against it are current. It already contains the `#1521` route-boot fix (`822df4844`) and the `leadTimeMinRaw` fix (`9886526e4`) — both confirmed via `git merge-base --is-ancestor`. |
| STAGING | `103ba378138` (PR #1537 `to-staging/2026-09-04`, pre-fix cut, merged 2026-09-04T00:31 +08), `3b894a5d2`, `1a0c404ca`, `889bc2940` (older, `DGFY-BACKEND-6`) | `origin/staging`'s **current** head is `51bbdfd7abe` (PR #1546 `to-staging/2026-09-04-3`, merged 2026-09-04T02:14 +08) — later than both fix commits above, so STAGING is not currently exposed to the `DGFY-BACKEND-8` boot crash despite the stale `103ba378` sample carrying 74 of its events. |
| DEV (backend) | `null` (unstamped) for most events, `d08b01a834d` for one `DGFY-POS-13` DEV sample | Re-verification #1 (carried) **FAIL** again — `#633`/`#401` still open, not re-diagnosed this run. |
| DEV (frontend) | not independently sampled this pass | Carrying forward the 08-29/08-30 finding that `deploy.yml` hasn't targeted `develop` since 2026-08-24 — process observation, out of scope here. |

## Buckets

| Issue | Env | Events (window) | Bucket | Action taken |
|---|---|---|---|---|
| `DGFY-BACKEND-8` | DEV 153 + STAGING 74 | 227, **new** | Route.get() boot crash, culprit `routes:pos` — matches `#1521` (closed 2026-09-03) verbatim | **already fixed, unconfirmed** — fix `822df4844` confirmed ancestor of current `origin/main` (`214a56a4`) and current `origin/staging` (`51bbdfd7`); the sampled STAGING release (`103ba378`) is a pre-fix cut since superseded. No filing — none needed |
| `DGFY-STORE-1S/1R/1Q/1P/1N` | PROD (current release `214a56a4`) | 5 (1 each), **new** | one root cause, 5 fingerprints: tenant `a-c-innovative-solutions` missing `service_booking_line_options` (migration is a month old — `20260731000002-create-service-option-tables.cjs`) | **genuine unhandled-looking defect, novel, root-caused** — **filed #1585** |
| `DGFY-STORE-1M` | PROD (current release `214a56a4`) | 5, **new** | `Failed to send guest checkout verification code` — traced to `storeUseCases.js`'s guest-OTP use case throwing `SERVICE_UNAVAILABLE` on a non-`sent` delivery status | dedupe candidate — correlates to open `#177` (SMTP misconfigured) — **commented on #177**, not filed |
| `DGFY-SKUPERVISOR-1` | PROD | 3, **new** | `ReferenceError: leadTimeMinRaw`, `/settings` | **already fixed, unconfirmed** — fix `9886526e4` (2026-09-01) confirmed ancestor of current `origin/main`; sampled release `9fa1717c` predates it. No filing |
| `DGFY-BACKEND-9` | DEV | 2, **new** | `DomainError: Unknown column 'Item.is_active'`, `PUT /fnb/modifier-groups/:id` | below floor (2 < 3, `handled:yes`) — **not filed**, flagged for next-run re-verification (looks like a real query bug, not tenant-specific) |
| `DGFY-BACKEND-7` | STAGING | 1, **new** | `DomainError: Validation error`, `PATCH /pos/catalog-overrides/1` | below floor (1 < 3, `handled:yes`) — no action |
| `DGFY-POS-13` | PROD 1 + DEV 1 | 2, **new** | `AxiosError 500`, `/terminal` | below floor (2 < 3, `handled:yes`) — no action, watch alongside `#1476` (backend-unreachable classifier unification, still open) |
| `DGFY-POS-C` | PROD 3 + DEV 5 (lifetime ~28) | 8 | residual connectivity — `#474` closed | none — reopen threshold (`timeout of 20000ms` > 2×/release) not met this window |
| `DGFY-STORE-T` | PROD (multiple releases incl. current) | ~7 | client-side `TypeError: Load failed`/network noise. Previously cross-linked to `#509`; `#509` **closed** this window (fix was `#976`, the customer-dashboard polling fan-out — unrelated symptom) — the `#509` link in prior passes reads as coincidental, not the real root cause | structural/client-side noise, no open issue actually covers this symptom specifically — no filing this run (floor/impact doesn't justify a fresh ticket for an unroot-causeable client fetch abort); re-flagged for a future pass to file properly if it keeps recurring under floor-clearing counts |
| `DGFY-STORE-Y` | PROD | 0 this window (rolling off) | same client-noise class as `DGFY-STORE-T` | none |
| `DGFY-POS-Z` | PROD | ~6 | transient 502, method-keyed — `#643`/`#987` epic context, `#646` merged (fingerprint collapse) | none |
| `DGFY-POS-D` | PROD 6 + DEV 1 | 7 | DEV/PROD connectivity, `#643` family | none |
| `DGFY-STORE-1J/1K/1H/1G/1F/1E/1D/1C/1B/1A/19/18/17` (13 issues) | PROD, `surebiz-marketing-cd76fa` tenant | 1 each, all last seen 3-4 days ago (rolling off) | one root cause: transient 502s against one tenant, fingerprint-split per URL param, same class as `DGFY-POS-Z`/`#1476` | dedupe candidate, structural noise — none, no new occurrence since 08-30 |
| `DGFY-POS-11` | PROD | 1 (lifetime 2) | by-design POST-method fingerprint split, `#646` (merged) | none |
| `DGFY-STORE-6` | PROD | 1 (lifetime 1) | recurring stale-bundle client, `#276` (open — PWA auto-update toast) | none — stays correctly unresolved |
| `DGFY-POS-12` | PROD | 0 this window (rolling off, lifetime 1, last seen 5 days ago) | camera/`ImageCapture` `UnknownError`, was correlated to `#739` on 08-30; **`#739` merged/closed 2026-08-3x** (barcode scanner re-arm fix) since that comment | no new occurrence since the correlated fix shipped — tentatively **already fixed, unconfirmed**; re-verify next pass |
| `DGFY-POS-10` | — (lifetime 1, 13 days ago, rolling off) | 0 | matches `#1074`'s own scenario, still open | none |
| `DGFY-BACKEND-6` | DEV 3 + STAGING 3 (lifetime 11) | 6 | already filed — `#1091` (open) | none — recurrence continues under `#1091`'s own tracked scope, not a new root cause |

**Filed this run:** #1585 (cap 3, 1 filed — `DGFY-STORE-1S/1R/1Q/1P/1N` tenant-schema gap).
**Resolved in Sentry:** none — no bucket this run cleared the "confirmed-dead" bar (the two
already-fixed findings are still pending a clean window under the current release; the 502-family
and client-noise buckets are ongoing structural noise, not newly-confirmed-dead).
**Correlated via comment, not filed:** `DGFY-STORE-1M` → `#177`.

## Dedupe checks run

`gh issue view` on #1091, #739, #509, #276, #474, #643, #987, #646, #1074, #177, #1476, #633, #401,
#1521 — all states confirmed as noted above (two flips since 08-30: `#739` and `#509` both closed).
`gh issue list --search` (≥2 framings each) for: "route callback undefined", "Item.is_active",
"service_booking_line_options"/"booking line options"/"innovative solutions"/
"sku_tenant_acinnovativesolutions", "leadTimeMinRaw", "guest checkout verification code"/"email OTP
delivery"/"SMTP", "502 surebiz-marketing"/"space-bar-iloilo", "terminal 500 pos" — plus one
`search/issues?...+in:body,comments` pass for `service_booking_line_options`. No stale references
found; no duplicate filed.

## Re-verification carried from 2026-08-30

| # | Condition | Result |
|---|---|---|
| 1 | backend `release` non-null | **FAIL** again — `#633`/`#401` still open, not re-diagnosed |
| 2 | `DGFY-BACKEND-6` new occurrence beyond the two already filed under #1091 | **Met** — 6 new events this window (3 DEV, 3 STAGING); stays under #1091's existing scope, not a new ticket |
| 3 | #474 reopen only on `timeout of 20000ms` >2×/release | **Not met** — no release this window shows >2 |
| 4 | No POS fingerprint regression (`DGFY-POS-11` vs `DGFY-POS-Z`) | **PASS** — unchanged |
| 5 | Does `DGFY-POS-12` recur (from 08-30's flag) | **Not met (in a good way)** — zero new occurrences since the correlated `#739` fix shipped; tentatively fixed, one more clean pass needed to resolve in Sentry |

**New re-verifications for next run:**
- Does `DGFY-BACKEND-8` recur under the current PROD/STAGING heads (both now past the fix)? Pass
  condition: zero new events → resolve in Sentry as confirmed-fixed.
- Does `DGFY-SKUPERVISOR-1` recur under the current PROD head? Same pass condition.
- Does `#1585` (tenant schema gap) get repaired, and does its Sentry fingerprint quintet stop firing
  once fixed?
- Does `DGFY-BACKEND-9` (`Item.is_active`) recur or grow past the floor — currently 2 events, watch
  for ≥3/7d before filing.
- Does `DGFY-POS-13` (`/terminal` 500) recur past the floor.

## Open, not addressed this run

- **#633 / #401** — backend release stamping still needs an SSH read of the live compose, a
  checkpoint for every role in this roster, not attempted.
- **DEV deploy cadence** — unchanged process observation, not independently re-verified this pass.
- **Stale PROD client** still on `#276`'s scope (`DGFY-STORE-6`) — unchanged.
- **`DGFY-STORE-T`/`-Y`'s actual root cause** — the `#509` cross-link from prior passes turned out
  to be coincidental (that issue's real fix, #976, was unrelated); this symptom still has no issue
  of its own. Left unfiled this run for lack of a root cause beyond "client-side fetch abort," not
  because it's confidently structural — worth a proper investigation in a future pass rather than
  continuing to wave it through as noise every time.
