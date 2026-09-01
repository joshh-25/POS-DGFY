---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-08-30
applies_to: deploy_operations
topic: sentry_triage_2026_08_30
---

# Sentry Triage — 2026-08-30

Org `ch-temp` | region `https://de.sentry.io` | period 7d | **10 unresolved** across all 4 projects
at sweep start (see "Methodology note" below on why a single org-wide query undercounts).
Seventh Observer pass. Previous pass: [2026-08-29](./SENTRY_TRIAGE_2026-08-29.md).

One new issue this run — `DGFY-POS-12` (`UnknownError: setPhotoOptions failed`) — everything else is
a continuation of a disposition already made in a prior pass, all confirmed unchanged.

## Methodology note — org-wide `is:unresolved` with `period:7d` undercounts

The standing single-call org-wide `search_issues(query="is:unresolved", period="7d")` returned only
**8** issues this run, silently omitting `DGFY-BACKEND-6` (last seen 7 days ago) and `DGFY-POS-10`
(last seen 8 days ago) — both genuinely still `unresolved`, just outside the 7d **activity** window
that call implicitly applies on top of the status filter. Confirmed by re-running per-project with
`period:14d` (`projectSlugOrId: dgfy-backend` / `dgfy-pos` / `dgfy-store` / `dgfy-skupervisor`),
which surfaced both. This is a real trap, same class as the two already logged in
`references/sentry-target.md` (the `event.type:error` blind spot, the `SENTRY_ENVIRONMENT: unknown`
gap) — **future runs should scan is:unresolved per-project at period:14d, not rely on one org-wide
7d call**, or the true unresolved count will keep reading low by 1–2. Not fixing the reference file
in this pass (out of scope for a triage run to edit procedure docs on its own judgment) — flagging
for the next run/maintainer to fold in.

## Release timeline

| Environment | Release(s) in 7d events | Notes |
|---|---|---|
| PROD (frontend) | `cabad60d`, `e7394f51`, `a818d442`, `b5639cd5`, `1425ccbd`, `11bc5b0e`, `d1e7697a`, `7a343fcbb` | `7a343fcbb` = `release/2026-08-29-3` (PR #1164, 2026-08-29 merge) is both the newest sampled PROD release **and** `origin/main`'s actual current head — PROD findings are now confirmed current, unlike the trailing-edge gap noted on 08-29. `d1e7697a` (2026-08-04 bundle, `DGFY-STORE-6`) is still being served 26 days later. |
| DEV (frontend) | *(no DEV events in this window's aggregate — same releases as 08-29, `8a1da7cf`/`c362108b`, previously seen but not refreshed in this run's sample)* | Not independently re-verified this pass; carrying forward 08-29's finding that `deploy.yml` hasn't targeted `develop` since 2026-08-24 — still a process observation, not a defect, out of this role's scope. |
| backend (all envs) | *(null / unstamped)* | Re-verification #1 (carried) **FAIL** again — escalated to #633/#401, not re-diagnosed this run. |

## Buckets

| Issue | Env | Events (window) | Bucket | Action taken |
|---|---|---|---|---|
| `DGFY-STORE-T` | PROD 10 + DEV 1 (lifetime 28) | 11 (7d) | structural noise — #509 open | none |
| `DGFY-POS-C` | DEV 9 + PROD 3 (lifetime 25) | 12 (7d) | residual connectivity — #474 closed | none — reopen threshold (`timeout of 20000ms` >2×/release) not met, max ~2/release (`8a1da7cf`) |
| `DGFY-STORE-Y` | PROD 4 (lifetime 6) | 4 (7d) | structural noise — #509 | none |
| `DGFY-POS-Z` | PROD 3 (lifetime 4) | 3 (7d) | transient 502, method-keyed — #643/#987 | none — already commented on #643 |
| `DGFY-POS-D` | DEV 3 (lifetime 4) | 3 (7d) | DEV connectivity — #643 family | none |
| `DGFY-POS-12` | PROD 1 | 1 (7d), **new** | camera/`ImageCapture` `UnknownError`, `handled:no`, correlated to #739's scanner code path but not root-caused yet | **commented on #739** with the correlated signal — not filed as a new issue (single event, no stack trace visible via the available MCP surface, message doesn't exactly match #739's own symptom) |
| `DGFY-POS-11` | PROD 1 (lifetime 1) | 1 (7d) | by-design POST-method fingerprint split, #646 closed/working | none |
| `DGFY-STORE-6` | PROD 1 (lifetime 1) | 1 (7d) | recurring stale-bundle client, #276 open | none — stays correctly unresolved after 08-29's correction |
| `DGFY-POS-10` | — (lifetime 1, "8 days ago") | 0 (7d, rolling off) | matches #1074's own scenario verbatim ("Terminal ... already in use by another cashier ... Supervisor assistance is required") — already tracked, open | none |
| `DGFY-BACKEND-6` | — (lifetime 5, last 7 days ago) | 0 (7d, rolling off) | already filed — #1091 | none — no new occurrence since 2026-08-23; about to fully roll off the window |

**Filed this run:** none (cap 3, 0 candidates filed — the one novel signal, `DGFY-POS-12`, is
single-event and not yet root-caused; handled via a correlated comment on #739 instead of a new
ticket).
**Resolved in Sentry:** none.
**Reopened in Sentry:** none.

## Dedupe checks run (all confirmed still accurate)

`gh issue view` on #1091, #509, #643, #987, #646, #276, #633, #401, #474, #1074, #739 — all states
as expected (see per-bucket notes above); no stale reference found. `gh issue list --search
"setPhotoOptions"` / `"photo capture pos"` / `"camera error"` / `"webcam POS"` — no existing ticket
for `DGFY-POS-12`'s exact symptom; closest adjacent match is #739 (open, same camera-scanner
component family), not a duplicate.

## Re-verification carried from 2026-08-29

| # | Condition | Result |
|---|---|---|
| 1 | backend `release` non-null | **FAIL** — escalate #633/#401, don't re-diagnose |
| 2 | `DGFY-BACKEND-6` new occurrence beyond the two already filed under #1091 | **Not met** — zero new events this run; window rolling off |
| 3 | #474 reopen only on `timeout of 20000ms` >2×/release | **Not met** — max observed ~2/release (`8a1da7cf`, DEV). #474 stays closed |
| 4 | No POS fingerprint regression (`DGFY-POS-11` vs `DGFY-POS-Z`) | **PASS** — still one PROD event, still by-design |
| 5 | DEV frontend release advances | Not independently re-checked this run (see Release timeline) |

**New re-verification for next run:** does `DGFY-POS-12` recur — same or higher frequency, ideally
with a stack trace available — in a way that would either confirm/refute the #739 correlation, or
justify filing it as its own ticket if it turns out unrelated. Pass condition for "still just
noise": zero or one more occurrence, still single-digit lifetime count.

## Open, not addressed this run

- **#633 / #401** — backend release stamping still needs an SSH read of the live compose, a
  checkpoint for every role in this roster, not attempted.
- **DEV deploy cadence** — unchanged process observation from 08-29, not independently re-verified
  this pass.
- **Stale PROD client** still on the 08-04 bundle 26 days later (`DGFY-STORE-6`, #276) — unchanged.
- **Methodology note above** — per-project/14d unresolved scanning should replace the single
  org-wide 7d call in a future pass; flagged, not fixed here.
