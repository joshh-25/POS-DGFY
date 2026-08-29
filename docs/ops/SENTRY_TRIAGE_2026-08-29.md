---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-08-29
applies_to: deploy_operations
topic: sentry_triage_2026_08_29
---

# Sentry Triage — 2026-08-29

Org `ch-temp` | region `https://de.sentry.io` | period 7d | **9 unresolved at sweep start**
(`is:unresolved`), down from 12 on 2026-08-27. (The Buckets table below lists 10 rows, not 9: it
also includes `DGFY-STORE-6`, which was *resolved* at sweep start — so excluded from the 9 — and
reopened as a correction during this run; see "Two Sentry-status corrections" below.)

Sixth Observer pass. No new issue *types* appeared this run — every bucket below is a continuation
of a disposition already made on 2026-08-27 or earlier; the "improvement" this run found is in
correcting two stale Sentry statuses (one wrongly left resolved, one that should have been) rather
than in new filings. Previous pass: [2026-08-27](./SENTRY_TRIAGE_2026-08-27.md).

## Release timeline

| Environment | Release(s) in 7d events | Notes |
|---|---|---|
| PROD (frontend) | `cabad60d`, `e7394f51`, `a818d442`, `b5639cd5`, `1425ccbd`, `11bc5b0e`, `d1e7697a` | `11bc5b0e` = PR #1070 (2026-08-26 merge to `main`) is the newest sampled PROD release. `origin/main`'s actual current head is `7a343fcbb` (`release/2026-08-29-3`, today) — PROD findings above `11bc5b0e` are **not yet confirmed against the current build**; nothing in this window post-dates it though, so no finding is stale as a result. `d1e7697a` is the same 2026-08-04 bundle flagged stale on 2026-08-27 (`DGFY-STORE-6`) — still being served, 25 days later. |
| DEV (frontend) | `8a1da7cf`, `c362108b` | **Unchanged from 2026-08-27** — not because DEV is quiet, but because DEV hasn't been redeployed: `gh run list --workflow=deploy.yml` shows the last `develop`-branch dispatch was 2026-08-24T16:18:37Z; every dispatch since (10+) targeted `staging`. Consistent with ADR 0074 (2026-08-25) making `develop → main` the default promotion path — DEV may simply be getting deprioritized as a deploy target now. Flagged as a process observation, not a Sentry defect; out of this role's scope to fix. |
| backend (all envs) | *(null)* | Still unstamped. Re-verification #1 (below) **FAIL** again — escalated to #633/#401, not re-diagnosed. |

`origin/main` holds 2 commits absent from `origin/develop` (`git rev-list --left-right --count
origin/main...origin/develop` → `2 25`). Checked the content this time (wasn't done on 08-27): both
are `release/<label>`/`to-staging/<label>` promotion merge commits carrying no unique source changes
of their own — the expected shape of the branch-per-promotion mechanism (`promoter`'s SKILL.md), not
a repeat of the 08-27 "back-merge gap" concern. Not flagged as a risk this run.

## Two Sentry-status corrections made this run

### 1. `DGFY-STORE-6` was reopened — it never should have stayed resolved

Resolved in Sentry on 2026-08-27 as "regression from stale bundle, #276." A fresh event fired
2026-08-27T10:20:53Z, on the same stale `d1e7697a` (2026-08-04) release bundle — and Sentry did
**not** auto-reopen it (confirmed: `is:resolved` search still showed it resolved, `last seen 2 days
ago`). The 08-27 doc's own assumption — "auto-reopen on regression is the safety net" — does not
hold for this issue's disposition. #276 (the actual fix, PWA auto-update toast) is still open, so
the underlying cause is not fixed; resolving it was premature and made a live, recurring issue
invisible to the default `is:unresolved` view. Reopened, with a comment explaining why.

### 2. `DGFY-POS-R` resolved — genuinely dead, previously left open by mistake

Tracked under #474 since the 2026-08-15 pass ("dedupe candidate, already tracked"), left unresolved
through 08-22 ("pending a fresh DEV deploy"), then silently dropped from the 08-27 doc's table
entirely — an omission, not a resolution. #474 has since closed. `DGFY-POS-R`'s last event was
2026-08-13, 16 days ago, zero events in the last two 7d windows. Resolved this run as
fixed-unconfirmed, with a re-verification query.

## Buckets

| Issue | Env | Events/7d | Bucket | Action taken |
|---|---|---|---|---|
| `DGFY-STORE-T` | PROD 10 + DEV 1 | 11 | structural noise — #509 open | none |
| `DGFY-POS-C` | DEV 9 + PROD 3 | 12 | residual connectivity — #474 closed | none — reopen threshold (`timeout of 20000ms` >2×/release) not met, max 1/release |
| `DGFY-STORE-Y` | PROD 4 | 4 | structural noise — #509 | none |
| `DGFY-POS-Z` | PROD 3 | 3 | transient 502, method-keyed — #643/#987 | none — already commented on #643 |
| `DGFY-POS-D` | DEV 3 | 3 | DEV connectivity — #643 family | none |
| `DGFY-BACKEND-6` | DEV 1 + STAGING 1 | 2 | already filed — #1091 | none — same 2 events as 08-27 (both 2026-08-23T05:11:49Z), no new occurrence, about to roll off the 7d window |
| `DGFY-POS-11` | PROD 1 | 1 | by-design POST-method fingerprint split, #646 closed/working | none |
| `DGFY-STORE-6` | PROD 1 | 1 | recurring stale-bundle client, #276 open | **reopened in Sentry** (correction — see above) |
| `DGFY-POS-10` | — | 0 (last 08-22, at window edge) | instrumentation gap, below floor, already commented | none — #1074 open |
| `DGFY-POS-R` | — | 0 (last 08-13) | fixed-unconfirmed, #474 closed | **resolved in Sentry** (correction — see above) |

**Filed this run:** none (cap 3, 0 candidates — every live issue is already tracked by an open
GitHub issue or already filed).
**Resolved in Sentry:** `DGFY-POS-R` (1).
**Reopened in Sentry:** `DGFY-STORE-6` (1) — correction to a premature 08-27 resolution.

## Dedupe checks run (all confirmed still accurate)

`gh api repos/Sieitzz/dgfy-platform/issues/<N>` on #1091, #509, #643, #987, #646, #276, #633, #401,
#474, #1074 — all states as expected (see per-bucket notes above); no stale reference found.

## Re-verification carried from 2026-08-27

| # | Condition | Result |
|---|---|---|
| 1 | backend `release` non-null | **FAIL** — escalate #633/#401, don't re-diagnose |
| 2 | `DGFY-BACKEND-6` new occurrence beyond the two already filed under #1091 | **Not met** — same 2 events, no new evidence this run |
| 3 | #474 reopen only on `timeout of 20000ms` >2×/release | **Not met** — max observed 1/release (11bc5b0e, b5639cd5, cabad60d each 1). #474 stays closed |
| 4 | No POS fingerprint regression (`DGFY-POS-11` vs `DGFY-POS-Z`) | **PASS** — still one PROD event, still by-design |
| 5 | DEV frontend release advances | **Not met — explained, not a failure.** DEV hasn't been redeployed since 08-24 (see Release timeline); not evidence of quiet DEV traffic |

**Re-verification for next run:** carry conditions #1, #2, #3, #5 forward unchanged (all still open
or not-yet-met, per the table above); condition #4 stays a standing check, not a one-time pass. Add
a new condition once DEV redeploys or #633/#401 lands, whichever comes first.

## Open, not addressed this run

- **#633 / #401** — backend release stamping still needs an SSH read of the live compose, a
  checkpoint for every role in this roster, not attempted.
- **DEV deploy cadence** — `deploy.yml` hasn't targeted `develop` since 2026-08-24; worth a PM/
  Promoter conversation about whether DEV is still meant to be kept current post-ADR-0074, since a
  stale DEV silently degrades this role's DEV-side findings (see Release timeline). Flagged, not
  actioned — outside this role's scope.
- **Stale PROD client** still on the 08-04 bundle 25 days later (`DGFY-STORE-6`, #276) — now
  correctly showing as unresolved again after this run's correction.
- **`DGFY-POS-10` / #1074** — still below the 3/7d `handled:yes` filing floor; no new events since
  08-22, un-changed from last run's assessment.
