---
phase: 01-architecture-and-migration-runner-contract
plan: 04
subsystem: infra
tags: [docker, tini, su-exec, non-root, alpine, one-shot-cli]

# Dependency graph
requires:
  - phase: 01-01
    provides: "apps/dgfy-migration-runner standalone package scaffold (package.json)"
  - phase: 01-03
    provides: "src/cli.js Commander program wiring all six RUN-02 subcommands; package.json main/start already pointed at src/cli.js"
provides:
  - "infrastructure/docker/dgfy-migration-runner/Dockerfile — two-stage, non-root, tini-supervised, one-shot image with no EXPOSE/HEALTHCHECK"
  - "infrastructure/docker/dgfy-migration-runner/entrypoint.sh — root-fixup-then-drop-privilege entrypoint for the /reports (REPORT_DIR) bind mount"
  - "Locally built and run verification proving the image is independently buildable/runnable from repo root, with no compose/backend dependency"
affects: [phase-2-schema, phase-3-data-migration, deployment/ci-registry-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-surface Docker packaging (infrastructure/docker/<surface>/Dockerfile+entrypoint.sh) extended to a one-shot CLI surface, mirroring dgfy-api's two-stage/tini/su-exec/non-root shape minus curl/EXPOSE/HEALTHCHECK"
    - "REPORT_DIR bind mount owned by non-root app user at container start (/reports, not /app/logs)"

key-files:
  created:
    - infrastructure/docker/dgfy-migration-runner/Dockerfile
    - infrastructure/docker/dgfy-migration-runner/entrypoint.sh
  modified: []

key-decisions:
  - "Reworded Dockerfile comments to avoid the literal strings 'EXPOSE'/'HEALTHCHECK' (e.g. 'liveness probe', 'container health probe instructions') so the plan's `grep -c \"EXPOSE\\|HEALTHCHECK\"` verify command returns a true 0, not a false-positive match on explanatory comments"
  - "Started the local Lima-backed docker VM (`limactl start docker`) to make the Docker daemon reachable for build/run verification, since it was stopped at session start"

patterns-established:
  - "One-shot CLI containers in this repo omit EXPOSE/HEALTHCHECK entirely (not just leave them unconfigured) — the packaging pattern distinguishes long-running services (dgfy-api) from one-shot tools (migration runner) at the Dockerfile level, not just in deploy scripts"

requirements-completed: [RUN-01]

coverage:
  - id: D1
    description: "Two-stage, non-root, tini-supervised Dockerfile at infrastructure/docker/dgfy-migration-runner/Dockerfile builds successfully as a one-shot image with no EXPOSE/HEALTHCHECK instructions"
    requirement: "RUN-01"
    verification:
      - kind: other
        ref: "docker build -f infrastructure/docker/dgfy-migration-runner/Dockerfile -t dgfy-migration-runner:phase1-test . (exit 0)"
        status: pass
      - kind: other
        ref: "grep -c \"EXPOSE\\|HEALTHCHECK\" infrastructure/docker/dgfy-migration-runner/Dockerfile (returns 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "entrypoint.sh drops the container from root to the non-root app user after fixing /reports (REPORT_DIR) ownership; docker run (no args) exits 0 and lists all six commands; nested subcommand help (schema --help) is reachable inside the built image"
    requirement: "RUN-01"
    verification:
      - kind: other
        ref: "docker run --rm dgfy-migration-runner:phase1-test (exit 0, stdout contains schema/data/verify/status/rollback-plan)"
        status: pass
      - kind: other
        ref: "docker run --rm dgfy-migration-runner:phase1-test node src/cli.js schema --help (stdout contains migrate)"
        status: pass
      - kind: other
        ref: "docker run --rm dgfy-migration-runner:phase1-test node -e \"console.log(process.getuid())\" (prints 100, the non-root app uid)"
        status: pass
    human_judgment: false

duration: 18min
completed: 2026-07-10
status: complete
---

# Phase 01 Plan 04: Migration Runner Docker Packaging Summary

**Two-stage, non-root, tini-supervised Dockerfile + entrypoint.sh packaging the RUN-02 CLI as a one-shot image with no EXPOSE/HEALTHCHECK, built and run independently of the backend/dgfy-api containers to complete RUN-01.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-07-10T11:33:56Z
- **Completed:** 2026-07-10T11:52:00Z
- **Tasks:** 2
- **Files modified:** 2 (both new)

## Accomplishments
- Created `infrastructure/docker/dgfy-migration-runner/Dockerfile` following `infrastructure/docker/dgfy-api/Dockerfile`'s exact two-stage (deps/runtime) shape, adapted for a one-shot CLI: no `curl`, no `EXPOSE`, no `HEALTHCHECK`; writable bind mount is `/reports` (maps to `REPORT_DIR`), not `/app/logs`; `CMD` defaults to `["node", "src/cli.js", "--help"]` so a bare `docker run` is self-documenting
- Created `infrastructure/docker/dgfy-migration-runner/entrypoint.sh` following `dgfy-api/entrypoint.sh`'s root-fixup-then-`su-exec`-then-`exec` structure, scoped to `REPORT_DIR`
- Verified the full packaging end-to-end by actually building and running the image locally: `docker build` exits 0; `docker run --rm dgfy-migration-runner:phase1-test` (no args) exits 0 and lists all six commands; `docker run ... node src/cli.js schema --help` shows the nested `migrate` subcommand; confirmed the process runs as the non-root `app` user (uid 100) once handed off to Node, proving the T-01-11 elevation-of-privilege mitigation

## Task Commits

Each task was committed atomically:

1. **Task 1: Dockerfile — two-stage, non-root, one-shot image** - `d8422c4b` (feat)
2. **Task 2: Entrypoint script + build/run verification of the packaged image** - `125250fa` (feat)

## Files Created/Modified
- `infrastructure/docker/dgfy-migration-runner/Dockerfile` - two-stage (deps/runtime) image, no EXPOSE/HEALTHCHECK, `/reports` writable mount, `CMD ["node", "src/cli.js", "--help"]`
- `infrastructure/docker/dgfy-migration-runner/entrypoint.sh` - root-fixup-then-drop-privilege entrypoint for `REPORT_DIR`

## Decisions Made
- Reworded explanatory Dockerfile comments to avoid the literal substrings `EXPOSE`/`HEALTHCHECK` so the plan's automated verify command (`grep -c "EXPOSE\|HEALTHCHECK"`) genuinely returns `0` rather than false-matching on comment text explaining their intentional absence
- Started the local Lima-backed `docker` VM (it was stopped at session start) via `limactl start docker` to make the Docker daemon reachable for the plan's mandatory build/run verification — no Dockerfile/entrypoint content changed as a result, this was purely a local environment step

## Deviations from Plan

None - plan executed exactly as written. The Dockerfile comment rewording (see Decisions Made) was a wording adjustment to satisfy the plan's own literal verify command, not a change in scope or behavior.

## Issues Encountered
- The local Docker daemon (Lima `docker` VM) was stopped when this plan started, which would have blocked the plan's mandatory `docker build`/`docker run` verification steps. Resolved by running `limactl start docker`, which brought the daemon up within ~15 seconds with no other environment changes needed.

## User Setup Required

None - no external service configuration required. The image was built and run purely for local verification (tag `dgfy-migration-runner:phase1-test`); no registry push or CI wiring is in scope for this plan per RESEARCH.md.

## Next Phase Readiness
- RUN-01 and RUN-02 are both complete: the migration runner is a standalone, independently buildable/runnable one-shot Docker image with all six commands (`schema migrate`, `data dry-run`, `data apply`, `verify`, `status`, `rollback-plan`) reachable inside the built image
- Phase 1 (Architecture and Migration Runner Contract) is now fully executed across all 4 plans — ready for Phase 2 (real `dgfy_*` landlord/tenant schema), which can add real migration files under `src/migrations/schema/` without any changes to the Dockerfile, entrypoint, or CLI wiring
- No blockers.

## Self-Check: PASSED

Both created files verified present on disk; both task commit hashes (`d8422c4b`, `125250fa`) verified in `git log`. `docker build` and `docker run` verification commands from the plan's `<verify>` block were executed directly (not just described) and passed.

---
*Phase: 01-architecture-and-migration-runner-contract*
*Completed: 2026-07-10*
