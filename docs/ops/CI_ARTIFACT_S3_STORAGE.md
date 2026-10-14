---
status: reference
authority_level: reference
owner: infra
last_reviewed: 2026-10-14
applies_to: ci_artifact_storage
topic: s3_artifact_storage
---

# CI artifact S3 storage

Active workflow evidence uses GitHub Actions Artifacts first, with the configured SeaweedFS S3
bucket as a fallback only when the GitHub upload fails. The shared local composite action
`.github/actions/upload-evidence` owns this policy across the security, compliance, promotion
quality, and Android workflows. It lets each workflow finish its scanner, reconciliation, cleanup,
and reporting steps before a final storage-enforcement step fails the run if both backends failed.

The fallback uses `scripts/ci-s3-upload.sh`, which accepts one file or one directory. A directory
is archived as a `.tar.gz` while preserving its root and relative paths; single-file uploads retain
their original bytes and filename. Missing/unreadable evidence is recorded as `missing` with a
warning and does not count as a backend failure, preserving the uploader's existing contract.

## Configuration and uploader contract

Set these as **repository-level GitHub Actions Variables** so they are available to fallback
uploads and lifecycle jobs without depending on a GitHub Environment:

| GitHub Actions variable | Job environment variable | Purpose |
| --- | --- | --- |
| `ARTIFACT_S3_ENDPOINT` | `ARTIFACT_S3_ENDPOINT` | Absolute HTTPS endpoint URL; current value: `https://s3.patteruel.dev` |
| `ARTIFACT_S3_BUCKET` | `ARTIFACT_S3_BUCKET` | Bucket name; current value: `artifacts` |
| `ARTIFACT_S3_ACCESS_KEY_ID` | `ARTIFACT_S3_ACCESS_KEY_ID` | Access key identifier; configuration, not the credential secret |

Set `ARTIFACT_S3_ACCESS_KEY_SECRET` as a **GitHub Actions Secret**. Workflows map it directly to
`AWS_SECRET_ACCESS_KEY`; never put it in a variable or endpoint URL. The scripts map the access key
ID to `AWS_ACCESS_KEY_ID` for the AWS CLI. The endpoint must be a valid HTTPS URL without embedded
credentials, query tokens, or a fragment. Validation errors do not print the configured URL.

The S3 fallback also requires GitHub run metadata (`GITHUB_REPOSITORY`, `GITHUB_WORKFLOW`,
`GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT`, `GITHUB_JOB`) and the source commit SHA. It uses private
objects, path-style requests, and multipart upload for large files. It verifies a direct download
and a 48-hour presigned readback by SHA-256. Credentials and presigned links are not printed by the
uploader; the presigned link is written to the run summary only after verification.

Large multipart uploads can briefly return 403 during SeaweedFS's post-completion consistency
window. The uploader retries direct readback at 10, 20, 30, and 40 seconds before failing. See the
verified retry run in [#2329](https://github.com/Sieitzz/dgfy-platform/issues/2329) and
[run 37754525806](https://github.com/Sieitzz/dgfy-platform/actions/runs/37754525806).

## Object keys and retrieval

S3 fallback keys use this structure:

```text
artifacts/repo/<owner>/<repo>/workflow/<workflow-slug>/run/<run-id>/attempt/<attempt>/job/<job>/artifact/<artifact-name>/sha/<source-sha>/<filename>
```

Directory uploads use `<directory-name>.tar.gz` for `<filename>`. Android APK and checksum files
are uploaded separately under the same artifact folder so the APK can be retrieved directly.

When GitHub Artifacts is the selected backend, the summary records the artifact name, ID, digest,
run ID/attempt, source SHA, size, checksum, and retention. Repository readers can retrieve it with:

```bash
gh run download <run-id> -n <artifact-name>
```

GitHub artifact access follows repository read access. GitHub artifact names include the run
attempt because v4 artifacts are immutable; Android APK and checksum files use distinct names.

When the workflow used the S3 fallback, retrieve the object URI in the summary with operator
credentials:

```bash
aws s3 cp 's3://<bucket>/<object-key>' ./evidence \
  --endpoint-url "$ARTIFACT_S3_ENDPOINT"
```

or the verified 48-hour presigned URL shown in that run's step summary. S3 objects are private;
treat the URL as a bearer link that anyone holding it can use until expiry. For a directory
archive, extract the `.tar.gz` after retrieval.

## Retention and expiry

The 30-day S3 families are scoped by workflow key prefix, with lifecycle rules for current objects
and noncurrent versions:

| Upload family | GitHub retention (`retention-days`) | S3 fallback workflow prefix / expiry |
| --- | ---: | --- |
| API test-matrix evidence | 30 days | `promotion-quality-gate/`; managed 30-day lifecycle |
| F&B browser evidence | 30 days | `promotion-quality-gate/`; managed 30-day lifecycle |
| POS sales E2E evidence | 30 days | `promotion-quality-gate/`; managed 30-day lifecycle |
| Frontend budgets report | 30 days | `promotion-quality-gate/`; managed 30-day lifecycle |
| Salvaged API test-matrix evidence | 30 days | `promotion-quality-gate/`; managed 30-day lifecycle |
| Compliance sweep results | 30 days | `compliance-preflight-sweep/`; managed 30-day lifecycle |
| Compliance sweep handoff | 30 days | `compliance-preflight-sweep/`; managed 30-day lifecycle |
| Android release APK and checksum | 30 days | `build-android-release-manual/`; managed 30-day lifecycle |
| Gitleaks report | 30 days | `security-scanning/`; no automatic S3 expiry |

All GitHub evidence uploads set `retention-days: 30`, including the Gitleaks report. S3 fallback
objects continue to follow the existing prefix lifecycle rules. `security-scanning/` has no
automatic S3 expiry; the large-object S3 multipart diagnostic is separate from retained workflow
evidence and deletes its test object after verification.

The production bucket's three managed 30-day rules were applied and read back successfully in
[lifecycle setup run 37757312162](https://github.com/Sieitzz/dgfy-platform/actions/runs/37757312162).
The reusable workflow `.github/workflows/ci-s3-artifact-lifecycle.yml` supports manual preview
(`apply: false`) and apply (`apply: true`). The script reads and preserves unrelated lifecycle
rules, replaces only its own managed rule IDs, and rejects an overlapping existing expiry rule for
a managed prefix. SeaweedFS lifecycle APIs support prefix filters, expiration, and noncurrent-
version expiration; lifecycle processing is asynchronous, so a configured 30-day rule does not
guarantee deletion at an exact instant. The actual expiry of a 30-day object has not yet been
observed; enforcement was verified by reading back the configured rules. If the endpoint reports a
conflicting rule in a future configuration, stop and resolve that configuration before relying on
the stated retention.

SeaweedFS lifecycle references: [S3 Lifecycle](https://github.com/seaweedfs/seaweedfs/wiki/S3-Lifecycle)
and [S3 Lifecycle Recipes](https://github.com/seaweedfs/seaweedfs/wiki/S3-Lifecycle-Recipes).

## Failure modes

- **GitHub artifact quota exhaustion.** GitHub can reject artifact creation after the repository's
  artifact storage quota is reached. The quota error observed in
  [run 38504422230](https://github.com/Sieitzz/dgfy-platform/actions/runs/38504422230) says usage is
  recalculated every 6–12 hours. Evidence retention is 30 days; prune unneeded older artifacts to
  free space sooner, then allow usage reporting to catch up.
- **S3 `SignatureDoesNotMatch` during readback.** Check the gateway's key mapping and SigV4
  configuration across all replicas, using endpoint-side logs to distinguish the cause. An object
  may have been written, but it is not verified evidence unless both the direct `s3api GetObject`
  and presigned GET match the source checksum. The uploader uses the direct API call for checksum
  verification; [AWS CLI `get-object`](https://docs.aws.amazon.com/cli/latest/reference/s3api/get-object.html)
  writes the response body to the requested local file. The Security Scanning workflow can opt into
  failure diagnostics that record the AWS CLI version, the direct API result, and a presigned GET's
  HTTP status and checksum. The diagnostic presigned URL is never written to the logs, outputs, or
  summary. Compare these results with endpoint-side request host and forwarded-header logs to
  distinguish direct SigV4 signing from proxy forwarding behavior.
- **Promotion quality evidence is advisory.** The operator-dispatched promotion quality suite
  reports storage outcomes but does not gate promotion. Its evidence enforcement steps remain
  `continue-on-error: true`; this is an intentional exception to the required-workflow failure
  behavior.

This repository is private, so workflow step summaries are visible to repository readers with
Actions access. A verified 48-hour presigned URL in a summary is a bearer link and can be used by
anyone who obtains it until it expires.

## GitHub artifact API scope

Successful primary uploads appear in
`gh api --paginate /repos/<owner>/<repo>/actions/artifacts` and can be downloaded from the run.
Evidence uploaded through the S3 fallback does not appear there; use that run summary's S3 object
URI or verified presigned URL instead. This endpoint remains useful for other active or historical
GitHub-native artifacts.
