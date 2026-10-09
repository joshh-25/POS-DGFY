---
status: reference
authority_level: reference
owner: infra
last_reviewed: 2026-10-08
applies_to: ci_artifact_storage
topic: s3_artifact_storage
---

# CI artifact S3 storage

Active workflow evidence migrated in #2329 is stored in the configured SeaweedFS S3 bucket rather
than attached to GitHub Actions runs. Uploads use `scripts/ci-s3-upload.sh`, which accepts one file
or one directory. A directory is archived as a `.tar.gz` while preserving its root and relative
paths; single-file uploads retain their original bytes and filename.

## Configuration and uploader contract

Set these as **repository-level GitHub Actions Variables** so they are available to all artifact
upload and lifecycle jobs without depending on a GitHub Environment:

| GitHub Actions variable | Job environment variable | Purpose |
| --- | --- | --- |
| `ARTIFACT_S3_ENDPOINT` | `ARTIFACT_S3_ENDPOINT` | Absolute HTTPS endpoint URL; current value: `https://s3.patteruel.dev` |
| `ARTIFACT_S3_BUCKET` | `ARTIFACT_S3_BUCKET` | Bucket name; current value: `artifacts` |
| `ARTIFACT_S3_ACCESS_KEY_ID` | `ARTIFACT_S3_ACCESS_KEY_ID` | Access key identifier; configuration, not the credential secret |

Set `ARTIFACT_S3_ACCESS_KEY_SECRET` as a **GitHub Actions Secret**. Workflows map it directly to
`AWS_SECRET_ACCESS_KEY`; never put it in a variable or endpoint URL. The scripts map the access key
ID to `AWS_ACCESS_KEY_ID` for the AWS CLI. The endpoint must be a valid HTTPS URL without embedded
credentials, query tokens, or a fragment. Validation errors do not print the configured URL.

The uploader also requires GitHub run metadata (`GITHUB_REPOSITORY`, `GITHUB_WORKFLOW`,
`GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT`, `GITHUB_JOB`) and the source commit SHA. It uses private
objects, path-style requests, and multipart upload for large files. It verifies a direct download
and a 48-hour presigned readback by SHA-256. Credentials and presigned links are not printed by the
uploader; the presigned link is written to the run summary only after verification.

Large multipart uploads can briefly return 403 during SeaweedFS's post-completion consistency
window. The uploader retries direct readback at 10, 20, 30, and 40 seconds before failing. See the
verified retry run in [#2329](https://github.com/Sieitzz/dgfy-platform/issues/2329) and
[run 37754525806](https://github.com/Sieitzz/dgfy-platform/actions/runs/37754525806).

## Object keys and retrieval

Keys use this structure:

```text
artifacts/repo/<owner>/<repo>/workflow/<workflow-slug>/run/<run-id>/attempt/<attempt>/job/<job>/artifact/<artifact-name>/sha/<source-sha>/<filename>
```

Directory uploads use `<directory-name>.tar.gz` for `<filename>`. Android APK and checksum files
are uploaded separately under the same artifact folder so the APK can be retrieved directly.

Use either the object URI in the workflow summary with operator credentials:

```bash
aws s3 cp 's3://<bucket>/<object-key>' ./evidence \
  --endpoint-url "$ARTIFACT_S3_ENDPOINT"
```

or the verified 48-hour presigned URL shown in that run's step summary. Treat that URL as a bearer
link: anyone who can read it can retrieve the object until it expires. For a directory archive,
extract the `.tar.gz` after retrieval.

## Retention and expiry

The old GitHub artifact settings describe intended retention. The 30-day families are scoped by
workflow key prefix, with lifecycle rules for current objects and noncurrent versions:

| Upload family | Previous GitHub retention | S3 workflow prefix |
| --- | ---: | --- |
| API test-matrix evidence | 30 days | `promotion-quality-gate/` |
| F&B browser evidence | 30 days | `promotion-quality-gate/` |
| POS sales E2E evidence | 30 days | `promotion-quality-gate/` |
| Frontend budgets report | 30 days | `promotion-quality-gate/` |
| Salvaged API test-matrix evidence | 30 days | `promotion-quality-gate/` |
| Compliance sweep results | 30 days | `compliance-preflight-sweep/` |
| Compliance sweep handoff | 30 days | `compliance-preflight-sweep/` |
| Android release APK and checksum | 30 days | `build-android-release-manual/` |
| Gitleaks report | No explicit retention setting | `security-scanning/` |

`security-scanning/` has no automatic expiry rule because the prior upload had no `retention-days`
setting. Large evidence test objects are configured for delete-after-verification and are separate
from the retained Gitleaks report.

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

## GitHub artifact API scope

After the migration is deployed, these workflow uploads no longer appear in
`gh api --paginate /repos/<owner>/<repo>/actions/artifacts`. That endpoint remains useful for
other active or historical GitHub-native artifacts; it is no longer an evidence inventory for the
migrated `security-scan.yml`, `compliance-preflight-sweep.yml`, `build-android-manual.yml`, and
`promotion-quality-gate.yml` uploads. Use the workflow summary's S3 object URI for migrated
evidence.
