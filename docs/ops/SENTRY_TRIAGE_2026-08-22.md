---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-08-22
applies_to: deploy_operations
topic: sentry_triage_2026_08_22
---

# Sentry Triage — 2026-08-22

Org `ch-temp` | region `https://de.sentry.io` | period 7d | **26 unresolved at sweep start**

Fourth Observer pass. Filing went live for this role on 2026-08-15; this run is not report-only.
Previous pass: [2026-08-15](./SENTRY_TRIAGE_2026-08-15.md).

> **Missing predecessor.** A 2026-08-18 pass ran and filed #632/#633/#634, but
> `docs/ops/SENTRY_TRIAGE_2026-08-18.md` was never committed and **no longer exists in the working
> tree**. Its findings survive only in those three issues. Not reconstructed here — this doc does not
> guess at what it said.

## Release timeline

| Environment | Release in events | Notes |
|---|---|---|
| PROD | `e7394f51` | PR #858, `release/2026-08-22`, deployed via `deploy-main.yml` run `32551754474` (04:27Z). Live events carry it — PROD reports correctly. |
| DEV (frontend) | `30d4159c` | **Stale.** Dated 08-18 against a `develop` head of `6a6ada4a7`. DEV frontend findings are not current-code findings. |
| DEV/PROD (backend) | *(null)* | Still unstamped — see #633 below. |

`origin/main` holds 3 commits absent from `develop` (`git rev-list --left-right --count
origin/main...origin/develop` → `3 51`): merges of PRs #858, #780, #779. Back-merge gap, flagged not
fixed.

## Two determinations that drove this run

### 1. #646's fingerprint collapse works — which is what made the cleanup safe

Every 502/504 fan-out issue fired on a **pre-#646** release. PR #646 merged `2026-08-18T05:06:16Z`;
the `DGFY-STORE-1x` cluster is stamped `2026-08-18T04:35Z`, ~30 minutes earlier. The only 502 on a
post-fix release (`DGFY-POS-Z`) is a **single collapsed issue** — the intended behaviour, and the
positive control for the fix.

Without that check this cluster reads as a live 13-issue incident. It is the opposite: it is the
last cohort of the bug #646 fixed.

### 2. One of the 08-18 pass's re-verification conditions failed — #633

Backend release stamping is still broken **after** its fix merged and shipped. Full diagnosis in
[#633](https://github.com/Sieitzz/dgfy-platform/issues/633), reopened this run. Summary:

- PR #792 merged `2026-08-21T06:50:51Z`; DEV redeployed three times after it (runs `32476735355`,
  `32492559411`, `32504485490`, all `success`).
- `DGFY-BACKEND-6`'s two events on 2026-08-22 still carry no `release`.
- **The CI half is correct.** `deploy.yml` → `deployment-orchestrator.yml:111` →
  `publish-platform.yml:103` sets `SENTRY_RELEASE: ${{ github.sha }}`. The repo compose declares the
  passthrough (`infrastructure/docker/docker-compose.yml:122`) and the app reads it
  (`apps/dgfy-api/src/config/sentry.js:63`).
- **A bare `grep SENTRY .github/workflows/deploy.yml` returns 0 and is misleading** — it misses the
  reusable-workflow call chain. Recorded here because it produced a wrong root cause earlier in this
  same run.
- Remaining suspect is **#401**: the live server's hand-maintained
  `/opt/dgfy-platform/docker-compose.yml` is missing the `SENTRY_RELEASE` passthrough, so the value
  the workflow exports is silently dropped. #401 was diagnosed against PROD; these events are DEV, so
  **whether DEV's compose has the same gap is unverified** — it needs an SSH read, a checkpoint for
  every role here.

## Buckets

| Issue | Env | Ev (7d) | Bucket | Action |
|---|---|---|---|---|
| `DGFY-STORE-10`…`-16` (7) | DEV | 7 | fixed-unconfirmed (#646) | **resolved in Sentry** |
| `DGFY-POS-T/V/W/P/Q/X` (6) | DEV+PROD | 8 | fixed-unconfirmed (#646) | **resolved in Sentry** |
| `DGFY-POS-S` — chunk-load white screen | PROD | 1 | fixed-confirmed (#632 / PR #764) | **resolved in Sentry** |
| `DGFY-BACKEND-3` — cash-drawer DomainError | — | 3 | fixed-confirmed (#508) | **resolved in Sentry** |
| `DGFY-POS-Z` — 502 on post-#646 release | PROD | 1 | positive control | none — evidence, not a defect |
| `DGFY-BACKEND-6` — PayMongo paid webhook, unknown session | DEV | 2 | genuine defect, **below floor** | not filed — see below |
| `DGFY-POS-10` — terminal already in use | PROD | 1 | instrumentation gap, **below floor** | commented on #508 |
| `DGFY-POS-C` — Network Error | DEV+PROD | 13 | residual, #474 closed | commented on #474 |
| `DGFY-STORE-T` / `-Y` | DEV+PROD | 30+4 | structural noise (08-15 reclass) | none — #509 |
| `DGFY-BACKEND-5` / `DGFY-STORE-Z` — route calculator | DEV+PROD | 4+2 | config gap, #634 closed (unconfirmed) | none — see below |
| `DGFY-POS-D` / `DGFY-POS-3` / `DGFY-POS-R` | DEV | 6/6/2 | DEV-only, stale release | none — left unresolved pending a fresh DEV deploy |

**Filed this run: 0** (cap: 3). **Resolved in Sentry: 15.** **Reopened: #633.**

### `DGFY-BACKEND-5` / `DGFY-STORE-Z` — #634 closed, provisioning unconfirmed

`pr-reviewer`'s review of this PR caught that #634 (`provision ROUTE_CALCULATOR_ENDPOINT in DEV and
PROD`) was already `CLOSED` (Pat, `2026-08-22T11:14:02Z`, `stateReason: COMPLETED`) when this doc
first said "open." Corrected above — but **not** promoted to a resolved/fixed-confirmed bucket,
because closing the issue is not the same evidence as the endpoint actually being live: #634's own
last comment (2026-08-17) states the value was confirmed by Pat but explicitly "not yet applied" —
server env changes go through a human checkpoint, not something this triage pass can verify by
itself. `DGFY-BACKEND-5`'s last Sentry event is still 2026-08-16, six days before the close, so
recent silence isn't independent evidence either way (the feature already degrades to 0 user impact
regardless). Left as an open verification item, not asserted either fixed or still-broken.

**Re-verification for the next run:** if `DGFY-BACKEND-5`/`DGFY-STORE-Z` stay silent for a full 7d
window *and* the DEV/PROD `.env` is confirmed to carry `ROUTE_CALCULATOR_ENDPOINT`, mark fixed-
confirmed. Any new event on either issue after 2026-08-22 means the close was premature.

## Why nothing was filed

Both new candidates sit below the noise-policy floor (3 occurrences/7d for `handled: yes`), and the
policy exists precisely to stop a sweep converting low-count signals into backlog.

### `DGFY-BACKEND-6` — the money-path guard firing, not a crash

`apps/dgfy-api/src/modules/commercePayments/usecases/handlePayMongoCommerceWebhookUseCase.js:388-403`
— #476's deliberate `raiseOperationalAlert` on a paid PayMongo webhook with no matching session.

The blocker is not the count, it is that **Sentry cannot distinguish the benign case from the real
one**. PayMongo webhooks are account-scoped, not environment-scoped: a checkout started on localhost
delivers to `dev.dgfy.ph`, which legitimately has no matching session row. A genuinely lost PROD
payment produces an identical signal.

Dedupe done (2 framings): nearest is **#476, closed** — adjacent, not a duplicate.

**Cheapest disambiguation, before any filing:** read `commerce_payment_webhook_audit` for the two
`provider_event_id`s at `2026-08-22T03:45:51Z` and `09:50:49Z`. An outcome of `ignored` /
`session_not_found` settles it as a config artefact. That is a DB read on a deployed host — outside
Observer's scope, and a Worker task.

### `DGFY-POS-10` — the frontend half of #508

`#508`'s backend fix is verified working (`shouldReportErrorToSentry` short-circuits on
`isExpectedDomainFailure`, present on `origin/main`; `DGFY-BACKEND-3` silent 9 days). But
`DGFY-POS-10` is captured by the **dgfy-pos frontend**, which has no equivalent filter — so the same
root cause is fixed on one side and open on the other. Recorded on #508 rather than filed at 1 event.

The durable fix is a frontend allowlist mirroring `isExpectedDomainFailure` at the POS Sentry
`beforeSend`, not per-message suppressions.

## A correction this run makes to its own earlier working notes

An intermediate note in this sweep proposed retiring PR #444 as "did not fix #474." **That was
overstated and is withdrawn.** `DGFY-POS-C` PROD events over 30d are exactly 1 per release (3 total),
and the newest is a plain axios `Network Error` with no status code — ordinary POS device
connectivity, not the backend-timeout cluster #474 was filed for. The 20s-timeout signature appears
once in 30d of PROD. #474's close (Pat, 2026-08-22T11:13Z) stands.

## Re-verification queries for the next run

| # | Query | Pass condition |
|---|---|---|
| 1 | `project:dgfy-backend` — inspect `release` | **Non-null.** Still null ⇒ #633/#401 unresolved; escalate, do not re-diagnose from scratch |
| 2 | `issue:DGFY-BACKEND-6` | Audit rows read and classified; file only if a PROD event appears or count clears 3/7d |
| 3 | `issue:DGFY-POS-C environment:PROD` | Reopen #474 only on `timeout of 20000ms exceeded` >2× on one release — **not** on `Network Error` |
| 4 | Any `DGFY-STORE-1x` / `DGFY-POS-[TVWPQX]` regression | Should stay resolved. A reopen on a post-#646 release means the fingerprint fix regressed |
| 5 | DEV frontend `release` | Should advance past `30d4159c`. If not, DEV findings remain non-current and must be labelled so |

## Open, not addressed by this run

- **#401** — server compose drift; now the blocker for #633.
- **Back-merge gap** — 3 commits on `main` absent from `develop`.
- **DEV frontend release staleness** — makes every DEV frontend finding lag `develop`.
