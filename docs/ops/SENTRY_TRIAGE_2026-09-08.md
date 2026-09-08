## Sentry Triage — 2026-09-08

Org: ch-temp | Period: 7d | Triggered by: DGFY-POS-16 report + standing sweep since
`docs/ops/SENTRY_TRIAGE_2026-09-07.md`

Current PROD release: `5dd4097d85fc5ac12b4d3e53ce7c841fbdc8045f` (deploy-main run `34148864309`,
success, 2026-09-07T17:44:53Z — PR #1738). DGFY-POS-16 carries this exact release tag, confirmed
live against the current build, not a stale/superseded one.

| Issue | Env | Count | Bucket | Action |
|---|---|---|---|---|
| DGFY-POS-16 | PROD | 1 | genuine defect, below floor | flagged-not-filed (floor) |
| DGFY-POS-15 | PROD | 2 | genuine defect, below floor | flagged-not-filed (floor) |
| DGFY-POS-13 | PROD | 2 (unchanged since 09-07) | genuine defect, below floor | flagged-not-filed (floor), re-verified unchanged |
| DGFY-POS-14 | PROD | 1 (unchanged since 09-07) | genuine defect, below floor | flagged-not-filed (floor), re-verified unchanged |
| DGFY-BACKEND-9 | **DEV** | 2 | config/environment issue (DEV drift, accepted risk) | none |
| DGFY-STORE-1S/1R/1Q/1P/1N | PROD | 5 (1 each, same root cause) | dedupe candidate | none — already filed, **#1585** |

**Filed this run:** none (cap: 3, not reached — nothing cleared the noise policy)
**Resolved in Sentry:** none

## DGFY-POS-16 — the reported issue, in detail

`NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed is not a child
of this node.` — a React DOM reconciliation crash, `handled:yes` (caught, not a hard app crash),
1 event / 1 user, first seen 2026-09-08T01:51 UTC, on the current PROD release. Componentstack
shows it firing inside `TerminalOperationsWorkspace` → `ResponsiveImage` (a `<picture>`/`<source>`
swap) on the `/terminal` route. The same event also carries a `failed_request` context: a 404 on
`GET /pos/terminal/operator/current` at the same moment — plausibly related (a failed operator
fetch triggering a conditional re-render that races React's own unmount of an image node), but not
confirmed as causal without a live repro.

**Disposition: below the noise-policy floor** (1 occurrence, `handled:yes`, floor is 3/7d) — a
real, reproducible-looking defect, but not yet frequent/impactful enough to file per policy. Not
resolved in Sentry either — left open as a live watch item, same as DGFY-POS-13/14 were treated
last run.

**Not a duplicate of #1698** (the `fetchPosCatalogPage` undefined-identifier outage, already fixed)
— different endpoint (`/pos/terminal/operator/current`, not the catalog path), different failure
shape (a caught React DOM error vs. an uncaught `ReferenceError`).

## The DGFY-POS-13/14/15 pattern — worth naming even though none files individually

Three separate `AxiosError: Request failed with status code 500` issues, each on a different
`failed_request.url` (`/fnb/modifier-groups/1`, `/pos/delivery-runs`, `/pos/transactions`), each a
different tenant, each `handled:yes`, each below the per-issue floor. Per the noise policy these
are correctly kept separate (different endpoint/tenant per this repo's own established dedupe
convention — see the 2026-09-07 doc's DGFY-POS-13/14 finding), not merged into one filing. Flagged
here as a pattern to watch, not a conclusion: three distinct generic-500s on arbitrary POS/FNB
endpoints within a 4-day window, all `request_failure_class:server`, all lacking any first-party
stack frame (axios-internal traces only) — if a fourth appears, worth asking whether this is
symptomatic of something shared (e.g. transient backend/DB pressure) rather than three unrelated
bugs, since the axios-only traces can't distinguish that from here.

## DGFY-STORE-1S/1R/1Q/1P/1N — dedupe confirmed, already tracked

All five: `Error: Table 'sku_tenant_acinnovativesolutions_d406e806.service_booking_line_options'
doesn't exist`, tenant `a-c-innovative-solutions` (`d406e806`), PROD, `handled:yes`, each a single
event on 2026-09-04 (no recurrence since — this tenant hasn't retried in 4 days). Root cause: the
table was added by migration `20260731000002-create-service-option-tables.cjs`, never synced to
this tenant's schema. **Already filed as #1585** (`fix(tenant-provisioning): tenant
a-c-innovative-solutions missing service_booking_line_options table`, open) — confirmed via
`gh issue list --search`, not re-filed. Worth a status check on #1585 given it's been open since
before this triage and the underlying tenant is still presumably broken if unaddressed.

## DGFY-BACKEND-9 — DEV only, accepted risk

`DomainError: Unknown column 'Item.is_active' in 'where clause'` on `PUT
/api/v1/fnb/modifier-groups/:modifier_group_id`, **environment: DEV**, 2 events, 0 users. DEV is
explicitly allowed to lag per this repo's own accepted-risk posture (#982) — not filed. Named here
rather than silently dropped in case it turns out to also affect STAGING/PROD schemas once actually
checked (not verified either way this run).

## Other projects (dgfy-backend, dgfy-store, dgfy-skupervisor beyond the above)

No new `firstSeen:-24h` issues in `dgfy-backend` or `dgfy-skupervisor`. `dgfy-store` had nothing new
in the last 24h beyond the already-covered STORE cluster (which is 4 days old, not new).

**Re-verification query for next run:** re-check DGFY-POS-13/14/15/16 occurrence counts (floor
watch), and re-check #1585's status before assuming the STORE tenant is still broken.

## Open, not addressed this run

- Everything carried over from `docs/ops/SENTRY_TRIAGE_2026-09-07.md`'s own "Open, not addressed"
  section is unchanged and not independently re-verified here.
