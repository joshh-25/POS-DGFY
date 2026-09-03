# Quality-Gate Runner Diagnostic Runbook

Status: reference
Owner: operations
Last reviewed: 2026-08-29

Use this runbook to diagnose why `dgfy-api-quality` (in `.github/workflows/promotion-quality-gate.yml`)
keeps dying on the self-hosted runner shortly after its test-matrix step completes — issue #1168
(Phase 192 in `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`).

**This runbook cannot be executed by any AI agent role in this repo's current roster.** Every
step below needs SSH/log access to `vm-sieitzstaging`, which `incident-responder`'s own SKILL.md
already names as a gap no role holds ("no live-server observability capability exists"). It exists
so Pat (or whoever holds that access) has a concrete, copy-pasteable starting point instead of an
open-ended "go debug the runner."

## What's already known (don't re-derive this)

From #1168's own investigation (`.github/workflows/promotion-quality-gate.yml`'s
`dgfy-api-quality` job, 3 of the last 4 real invocations, all on `vm-sieitzstaging`):

- Every step through **"Run dgfy-api test matrix"** completes successfully (2-5 min, well under
  its own 35-minute step timeout).
- The job envelope itself terminates before the *next* step ("Run F&B contracts") ever starts —
  every subsequent step shows `conclusion: null` in the GitHub Jobs API.
- The runner's own job log is lost in every failing case (`gh run view --job <id> --log` returns
  "log not found").
- The exact same code, run locally on the same commit, passes the fast tier clean in 1.5-2.5 min
  — this points at the runner box or its Docker daemon, not the test code.
- A related symptom: the `salvage-api-evidence` job (added in Phase 189/#1165) correctly detects
  the dead envelope and attempts to recover test-matrix evidence from a durable,
  job-workspace-external directory, but found that directory already empty on the one run where
  this was tested — either a workspace-cleanup mechanism swept it in the ~21 minutes before
  salvage ran (queued behind other quality jobs on the same single runner), or the two jobs'
  independent `dirname "$RUNNER_WORKSPACE"` computations disagree. Unconfirmed either way.

## Step 1 — identify the runner and confirm it's the one in question

```bash
gh api repos/Sieitzz/dgfy-platform/actions/runners --jq '.runners[] | {name, status, labels: [.labels[].name]}'
```

Confirm which runner actually carries the `sieitz-lg` label (the workflow pins heavy jobs to it,
and it's also the DEV+STAGING server per #1147's own body) — this runbook assumes that's
`vm-sieitzstaging`; re-confirm rather than assuming if the label assignment has changed since.

## Step 2 — OOM killer / kernel-level kill

SSH to the box, then for each failing run's approximate timestamp (from the GitHub Actions run's
own start time + the test-matrix step's reported duration):

```bash
# System-wide OOM kills, most recent first
sudo dmesg -T | grep -i "killed process\|out of memory\|oom" | tail -50

# journalctl equivalent if dmesg has rotated past the window
sudo journalctl -k --since "<run start time>" --until "<run start time + 10min>" | grep -i "oom\|killed process"

# Was the runner's own listener process itself killed?
sudo journalctl -u actions.runner.* --since "<run start time>" --until "<run start time + 10min>"
```

If a real OOM kill shows up in this window, that's the root cause — go to "Once root-caused"
below with `resource_exhaustion` as the finding.

## Step 3 — Docker daemon restart or crash

```bash
# Did dockerd itself restart during the window?
sudo journalctl -u docker --since "<run start time>" --until "<run start time + 10min>"

# Any container (test DB, redis, etc. this job's compose stack spins up) die unexpectedly?
docker events --since "<run start time>" --until "<run start time + 10min>"

# Current resource ceiling docker is configured with, for comparison against what actually got used
docker info | grep -i "memory\|cpus"
```

## Step 4 — scheduled maintenance that could sweep `_work` siblings

The salvage job's own evidence directory
(`$(dirname "$RUNNER_WORKSPACE")/_dgfy_gate_evidence/<run>-<attempt>`) lives as a sibling of the
runner's `_work` directory, not inside it — check for anything that could be cleaning that parent
directory on a schedule:

```bash
# System-wide cron
sudo crontab -l -u <runner-service-user>
sudo cat /etc/cron.d/* 2>/dev/null
sudo ls /etc/cron.daily /etc/cron.hourly

# systemd timers
systemctl list-timers --all

# Disk-space-triggered cleanup (some runner setups run a "clean if disk >N% full" script)
df -h $(dirname "$(find / -maxdepth 4 -type d -name '_work' 2>/dev/null | head -1)")
```

If nothing turns up here, the more likely explanation is the runner's own directory-recycling
behavior between job assignments (a fresh `_work` per job is normal GitHub Actions runner
behavior; whether the *parent* directory the salvage job writes to is included in that recycling
window is the open question) — check the runner's own configured `--work` path and whether it
gets torn down and recreated per job vs. per registration.

## Step 4b — sparse-poisoned workspace

A distinct, confirmed (not merely hypothesized) cause of a job failing on this box while an
identical job succeeds elsewhere: a `sparse-checkout:` left behind by an earlier, unrelated job
poisons `_work` in a way `actions/checkout` cannot self-heal, and `git status` reports the tree
clean while most of it is missing from disk. If the symptom here is a missing file/directory
rather than an OOM signature, check this before continuing down the resource-ceiling path below:

```bash
git -C "$RUNNER_WORKSPACE" config --local --list | grep -icE 'sparse|worktreeconfig'  # >0 = poisoned
git -C "$RUNNER_WORKSPACE" ls-files -v | grep -c '^[Sa-z]'                            # >0 = poisoned
```

Full mechanism, diagnosis signature, and the manual clearing procedure:
`docs/ops/CI_RUNNER_WORKSPACE_HYGIENE.md` (#1528).

## Step 5 — resource ceiling vs. actual usage

```bash
# Was memory or CPU pressure high system-wide during the window, even without a hard OOM kill?
sudo apt install -y sysstat  # if not already present
sar -r -f /var/log/sysstat/sa$(date -d "<run date>" +%d)   # memory
sar -u -f /var/log/sysstat/sa$(date -d "<run date>" +%d)   # CPU

# Or, if sysstat wasn't running at the time, check whatever monitoring this box already has
# (Prometheus node_exporter, a hosting provider's own dashboard, etc.) for the same window.
```

Also worth checking: how many other jobs were running/queued on this same runner concurrently
during the failure window (the workflow already documents this runner as a single-runner
bottleneck for the `sieitz-lg` label — concurrent job pressure is a real candidate, not a stretch).

## Once root-caused

Report the finding as a comment on #1168, using one of these labels (or a new one if none fit):

- `resource_exhaustion` — OOM killer or CPU starvation confirmed in the window.
- `docker_daemon_restart` — dockerd itself restarted or crashed.
- `workspace_cleanup` — a cron/systemd-timer/runner-recycling mechanism confirmed sweeping
  `_work` siblings.
- `unknown_needs_deeper_trace` — none of the above explain it; needs a live reproduction with
  `dmesg -w`/`docker events` actively tailing during a fresh `workflow_dispatch`.

Then, per #1168's own scope:

- If a workspace-cleanup mechanism is confirmed: either exempt `_dgfy_gate_evidence/` from it, or
  redesign the salvage path to upload immediately from *within* `dgfy-api-quality` itself (a step
  that can't be skipped by a later step's crash) instead of a separate job that loses the
  queue-wait race on a single-runner bottleneck.
- If resource exhaustion is confirmed: revisit `dgfy-api-quality`'s resource requests,
  `timeout-minutes`, or whether it needs its own dedicated runner rather than sharing `sieitz-lg`
  with DEV/STAGING deploys.
- Either way, hand the finding back to whichever role picks up #1168 next (Worker, if it's a
  workflow-file fix; Pat directly, if it's runner/infra configuration outside this repo).

## Related

- Issue #1168, Phase 192
- `.github/workflows/promotion-quality-gate.yml` (`dgfy-api-quality`, `salvage-api-evidence` jobs)
- `.agents/skills/incident-responder/SKILL.md` — the existing "no live-server observability
  capability exists" gap this runbook works around by handing the actual execution to a human
