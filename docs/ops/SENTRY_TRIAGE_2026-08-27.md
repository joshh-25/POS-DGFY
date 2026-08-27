---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-08-27
applies_to: deploy_operations
topic: sentry_triage_2026_08_27
---

# Sentry Triage — 2026-08-27

Org `ch-temp` | region `https://de.sentry.io` | period 7d | **12 unresolved at sweep start**, down
from 26 on 2026-08-22 — last run's cleanup held.

Fifth Observer pass. Filing went live 2026-08-15; this run is not report-only. Previous pass:
[2026-08-22](./SENTRY_TRIAGE_2026-08-22.md).

## Release timeline

| Environment | Release(s) in 7d events | Notes |
|---|---|---|
| PROD (frontend) | `3cf0f525`, `e7394f51`, `cabad60d`, `1425ccbd`, `a818d442`, `b5639cd5` | `b5639cd5` corresponds to PR #1054 and was `origin/main`'s head at the time events were sampled — PROD findings **are** current-code findings. (`main` has since advanced further via PR #1070's promotion; `b5639cd5` remains an ancestor.) |
| DEV (frontend) | `c362108b`, `8a1da7cf` | Advanced past the 08-22 pass's stale `30d4159c`. Re-verification #5 (below) **PASS**. |
| backend (all envs) | *(null)* | Still unstamped. Re-verification #1 (below) **FAIL** — escalated to #633/#401, not re-diagnosed this run. |

Backend `environment` now resolves correctly (DEV/STAGING distinguishable) — closes the 2026-08-08
`"unknown"` caveat. Only `release` is still null.

`origin/main` holds 4 commits absent from `origin/develop` (`git rev-list --left-right --count
origin/main...origin/develop` → `4 15`, widened from `3 51` on 08-22 — the shrink in develop's count
reflects staging/main promotions landing since, not a shrinking gap). Back-merge gap, flagged not
fixed.

## Two determinations that drove this run

### 1. `DGFY-POS-11` is not a fingerprint regression — #646 still works

It appeared 08-24 on a post-#646 release, 36 seconds after two `DGFY-POS-Z` events, same URL, same
release, same message — on its face exactly the regression the 2026-08-22 pass's re-verification #4
was watching for. Tags settle it: `DGFY-POS-Z` is `request_method: GET`, `DGFY-POS-11` is `POST`.
`packages/web-core/src/observability/sentryClient.js:616-620` fingerprints transient failures as
`['api', normalizedMethod, 'transient', String(status)]` — method is deliberately part of the key, so
a GET 502 and a POST 502 are *supposed* to be two separate issues. No action needed; re-verification
#4 **PASS**.

### 2. The standard sweep query has a blind spot — `event.type:error` excludes operational alerts

Holding `release` constant to isolate the variable: `event.type:error` returns 10 aggregate rows with
`DGFY-BACKEND-6` **absent entirely**; the unfiltered query returns 12 rows with it present (DEV 4,
STAGING 1). `raiseOperationalAlert` (`apps/dgfy-api/src/services/operationalAlertService.js`) emits
**message-type**, not error-type, Sentry events — so `event.type:error` excludes the entire backend
operational-alert class, money-path guards included. Every prior sweep used exactly this query
(`.agents/skills/observer/references/sentry-target.md`'s documented call shape) — that's why backend
has looked quieter than it actually is. Fixed in this PR; see the diff to `sentry-target.md`.

## Buckets

| Issue | Env | Events/7d | Bucket | Action taken |
|---|---|---|---|---|
| `DGFY-STORE-T` | PROD 12 + DEV 1 | 13 | structural noise — #509 open | none |
| `DGFY-POS-C` | DEV 5 + PROD 3 | 8 | residual connectivity | none — #474 stays closed |
| `DGFY-BACKEND-6` | DEV 4 + STAGING 1 | 5 | genuine defect, clears floor, no open duplicate | **filed #1091** |
| `DGFY-STORE-Y` | PROD 4 | 4 | structural noise — #509 | none |
| `DGFY-POS-Z` | PROD 4 | 4 | transient 502, method-keyed — #643/#987 | commented #643 |
| `DGFY-POS-D` | DEV 3 | 3 | DEV connectivity — #643 family | none |
| `DGFY-POS-11` | PROD 1 | 1 | by-design POST-method fingerprint split, #646 working | none — see determination 1 |
| `DGFY-POS-10` | PROD 1 | 1 | instrumentation gap, below floor | commented #1074 |
| `DGFY-STORE-6` | PROD 1 | 1 | regression from stale 08-04 bundle — #276 | **resolved in Sentry** |
| `DGFY-POS-3` | — | 0 (last 08-18) | superseded by POS-Z/11 | **resolved in Sentry** |
| `DGFY-BACKEND-5` | — | 0 (last 08-16) | fixed-unconfirmed (#634) | **resolved in Sentry** |
| `DGFY-STORE-Z` | — | 0 (last 08-16) | fixed-unconfirmed (#634) | **resolved in Sentry** |

**Filed this run:** #1091 (cap 3, not reached — 1 candidate).
**Resolved in Sentry:** `DGFY-STORE-6`, `DGFY-POS-3`, `DGFY-BACKEND-5`, `DGFY-STORE-Z` (4). Each
carries a Sentry activity comment stating why; auto-reopen on regression is the safety net for the
two #634 items (`DGFY-BACKEND-5`, `DGFY-STORE-Z`) whose `.env` provisioning this role cannot verify
directly — that needs an SSH read, a checkpoint for every role here, so it was not attempted.
**Commented, not filed:** #643 (fresh `DGFY-POS-Z` evidence + an unexplained PROD blip), #1074
(`DGFY-POS-10` instrumentation gap) — both below the 3/7d `handled:yes` filing floor.

## #1091 — the one filing candidate

`PayMongo reported a paid payment for an unknown commerce payment session`, on
`POST /api/v1/commerce-payments/paymongo/webhook`
(`apps/dgfy-api/src/modules/commercePayments/usecases/handlePayMongoCommerceWebhookUseCase.js:388-405`).
5 events/7d — clears the floor, correctly deferred at 2 events on the 08-22 pass.

New evidence changes the analysis: two events share the identical timestamp
`2026-08-23T05:11:49Z`, one `DEV`, one `STAGING`. PayMongo webhooks are account-scoped, not
environment-scoped, so one real checkout fans out to every configured endpoint — every environment
that doesn't own the session raises a paid-but-unknown alert. The defect isn't the alert itself, it's
that the guard can't distinguish "this environment doesn't own this session" (routine, ~N-1 times per
checkout) from "a real payment was lost" (rare, the actual target) — by construction the noise risks
masking the one case #476 built this guard to catch. Dedupe (≥2 framings): #476 closed and adjacent
(event-level idempotency); #477/#785/#242 unrelated, no open duplicate. Filed as #1091.

## Re-verification carried from 2026-08-22

| # | Condition | Result |
|---|---|---|
| 1 | backend `release` non-null | **FAIL** — escalate #633/#401, don't re-diagnose |
| 2 | `DGFY-BACKEND-6` classified | Clears floor → filed #1091 |
| 3 | #474 reopen only on `timeout of 20000ms` >2×/release | **Not met** — max observed 1/release. #474 stays closed |
| 4 | No POS fingerprint regression | **PASS** — see determination 1 |
| 5 | DEV frontend release advances | **PASS** — now `8a1da7cf` |

## Open, not addressed this run

- **#633 / #401** — backend release stamping needs an SSH read of the live compose
  (`grep -n 'SENTRY_RELEASE' /opt/dgfy-platform/docker-compose.yml` on the DEV host) — a checkpoint
  for every role in this roster, not attempted.
- **Unexplained PROD 502 blip, `2026-08-24T07:26:00Z`** (~40s, 3 events, 2 clients). The 08-22 and
  08-25 bursts sit minutes after a `deploy-main` run — the 08-25 one right after a **failed** run
  (`32814450276`) — but this one has no deploy dispatch near it. Watch item under #643, not filed at
  3 events.
- **Stale PROD client** still on the 08-04 bundle 23 days later (`DGFY-STORE-6`), related #276.
- **Back-merge gap** widened to 4 commits (`origin/main` ahead of `origin/develop`) — flagged, not
  fixed; outside this role's scope.
