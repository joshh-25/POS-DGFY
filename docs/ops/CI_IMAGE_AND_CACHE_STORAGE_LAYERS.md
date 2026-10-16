---
status: reference
authority_level: reference
owner: infra
last_reviewed: 2026-10-07
applies_to: ci_storage_cleanup
topic: actions_cache_ghcr_runner_image_distinction
---

# CI image and cache storage layers

Issue [#2297](https://github.com/Sieitzz/dgfy-platform/issues/2297) exposed how easy it is to confuse GitHub Actions build cache, workflow artifacts, GHCR images, and Docker data stored on a runner. Identify the layer from the failing job and its runner before deleting anything; a cleanup in one layer does not clean the others or prove that a network problem is resolved.

## The four layers at a glance

| Layer | Lives where | Created by | Who can delete it |
| --- | --- | --- | --- |
| GitHub Actions cache | GitHub Actions cache service, keyed/scoped for a repository | BuildKit cache exporters such as `cache-to: type=gha` | Repository users with Actions cache API permission; delete a specific cache ID |
| Workflow artifacts | GitHub Actions artifact storage, attached to a workflow run | `actions/upload-artifact` | Repository users with Actions artifact permission; delete a specific artifact ID |
| GHCR packages | GitHub Container Registry | Image build/push jobs | Package writers; remove only a confirmed-unreferenced package version |
| Runner-local Docker/build data | The selected runner host and its buildx builder | Docker/buildx builds and pulls | Runner administrator, after confirming the runner is idle |

## GitHub Actions cache (`type=gha`)

The cache itself lives in GitHub's Actions cache service; that does not mean the build job runs on a GitHub-hosted runner. The current API, migration-runner, and frontend build workflows configure `cache-from` and `cache-to` with `type=gha` (`.github/workflows/deploy-api.yml`, `deploy-migration-runner.yml`, and `deploy-frontend.yml`). Check the actual dispatch's `runner_labels_json` before diagnosing throughput. The PROD workflow currently defaults to a self-hosted runner, and the runner migration handoff documents slow cache-service throughput for the self-hosted pool; its measured cache penalty is scoped to the PR build-check workflows, so do not assume every build path has the same behavior. Clearing cache entries cannot by itself establish that a GHCR or general network timeout is fixed.

Inspect cache entries and usage before cleanup, then repeat the usage query afterward to compare bytes:

```bash
gh api --paginate /repos/<owner>/<repo>/actions/caches
gh api /repos/<owner>/<repo>/actions/cache/usage
```

Delete only a specific, inspected numeric cache ID:

```bash
gh api -X DELETE /repos/<owner>/<repo>/actions/caches/<id>
```

Avoid bulk deletion by branch or ref during incident recovery; preserve the before/after usage output in the incident record.

## Workflow artifacts

Artifacts are files uploaded by `actions/upload-artifact` and attached to workflow runs. They are not BuildKit cache entries and are not GHCR packages. Inspect them with:

```bash
gh api --paginate /repos/<owner>/<repo>/actions/artifacts
```

Delete only a specific confirmed artifact ID:

```bash
gh api -X DELETE /repos/<owner>/<repo>/actions/artifacts/<artifact_id>
```

If a required artifact is missing or returns 404, identify and rerun the job that produces it instead of deleting other storage.

The active evidence uploads in `security-scan.yml`, `compliance-preflight-sweep.yml`,
`build-android-manual.yml`, and `promotion-quality-gate.yml` use the S3-compatible storage described
in [CI artifact S3 storage](CI_ARTIFACT_S3_STORAGE.md). After those migrations land,
`gh api .../actions/artifacts` no longer shows evidence produced by those workflow steps; use the
run summary's S3 object URI and the retrieval procedure in that document.

## GHCR packages

Every image build publishes to GHCR regardless of which cache backend BuildKit uses. Before any cleanup, confirm the target digest is not referenced by any candidate manifest's `release_revision.apps["<app>"].digest` and is not the currently deployed alias. ADR 0081's immutable-tag contract applies; cross-check with `scripts/check-tag-immutability.js` and candidate/release evidence before deletion.

Inspect package versions or the exact image tag/digest:

```bash
gh api --paginate /orgs/<org>/packages/container/<app>/versions
docker buildx imagetools inspect ghcr.io/sieitzz/<app>:<tag>
```

Delete only a specific version ID after confirming it is unreferenced. A GHCR push 429 or timeout is a registry/network symptom; cache deletion is not evidence that the registry recovered.

## Runner-local Docker and buildx storage

This is data on a particular runner host: its persistent buildx builder and local Docker image store. It is the layer the operator first reached for during #2297, even though the incident centered on GitHub Actions cache and GHCR/network symptoms. Runner-local cleanup requires box access and must only happen after confirming that runner is idle.

Inspect:

```bash
docker system df
docker buildx du
```

Use age-scoped cleanup, with a duration chosen for the incident and host:

```bash
docker buildx prune --filter until=<duration>
docker image prune -a --filter until=<duration>
```

Do not run unscoped prune commands during an active deployment or while the runner may be building another job.

## Symptom to likely layer

| Symptom | Likely layer | Safe next action |
| --- | --- | --- |
| Cache restore/export timeout on a hosted run | GitHub Actions cache | Inspect cache IDs and usage; consider deleting only a specific stale entry, then observe a new run |
| Slow or timed-out self-hosted build | Check runner-local state and the actual cache/network path | Confirm runner identity and job logs; don't assume cache cleanup or image pruning is the fix |
| GHCR push 429 or timeout | GHCR service or network path | Wait/retry after checking registry reachability; preserve selected candidate scope |
| Runner disk full | Runner-local Docker/buildx storage | Confirm runner idle, inspect disk use, then use age-scoped cleanup |
| Artifact download 404 | Workflow artifact storage or producer job | Inspect the run's artifacts and rerun the producing job if needed |

## Related references

- `docs/ops/CI_RUNNER_MIGRATION_HANDOFF.md` — runner routing and measured cache behavior.
- `docs/ops/CI_RUNNER_WORKSPACE_HYGIENE.md` — persistent self-hosted checkout/workspace state.
- [ADR 0081](../architecture/adr/0081-per-app-container-semantic-versioning.md) — immutable per-app image tag and revision contract.
- Incident record: [#2297](https://github.com/Sieitzz/dgfy-platform/issues/2297).

Neither sibling infra reference, `CI_RUNNER_WORKSPACE_HYGIENE.md` or `CI_RUNNER_MIGRATION_HANDOFF.md`, is currently registered in `docs/_meta/document-registry.json`'s `governed_docs`; this new reference follows that existing registration pattern.
