# QA Isolation Profile

## Purpose

Define the minimum non-production isolation required before a staging candidate may be authorized for promotion.

## Required Boundaries

Provision QA with all of the following:

1. A dedicated Unix identity, for example `skupervisor-qa`, with no read permission for production environment files, database credentials, uploads, backups, or controller state.
2. A separate checkout/app directory, for example `/srv/skupervisor-qa/app`.
3. A separate database and database user. The QA user must have no grants on production schemas.
4. Separate environment and runtime markers that identify QA without containing production values.
5. A separate uploads directory owned by the QA identity.
6. Separate PM2 process names, such as `sku-qa-backend`, `sku-qa-ims`, `sku-qa-pos`, and `sku-qa-store`.
7. A dedicated QA origin and disposable tenant/data marker.
8. Disposable browser/UAT data that can be reset without production impact.

## Non-Secret Controller Inputs

The proof checker requires non-secret identifiers and paths:

```text
QA_SSH_HOST
QA_APP_DIR
QA_UNIX_USER
QA_RUNTIME_MARKER
QA_DATABASE_MARKER
QA_DATABASE_NAME
QA_DB_CREDENTIAL_ID
QA_TENANT_DATA_MARKER
QA_UPLOADS_DIR
QA_PM2_NAMES
QA_DISPOSABLE_TEST_DATA=1
QA_PRODUCTION_DATA_ACCESS=denied

DEPLOY_PROD_REMOTE_HOST
DEPLOY_PROD_REMOTE_DIR
DEPLOY_PROD_REMOTE_USER
PROD_DATABASE_NAME
PROD_DB_CREDENTIAL_ID
PROD_UPLOADS_DIR
PROD_PM2_NAMES
```

Credential IDs are labels used to prove different credential sets; they are not passwords or connection strings.

## QA Deploy Summary

The QA deploy summary must contain:

```text
deployed_head=<exact candidate SHA>
remote_head=<exact candidate SHA>
expected_commit=<exact candidate SHA>
runtime_marker=<QA_RUNTIME_MARKER>
database_marker=<QA_DATABASE_MARKER>
unix_user=<QA_UNIX_USER>
app_dir=<QA_APP_DIR>
database_name=<QA_DATABASE_NAME>
uploads_dir=<QA_UPLOADS_DIR>
pm2_names=<comma-separated QA_PM2_NAMES>
```

Missing, stale, or production-equivalent evidence blocks promotion. There is no production-as-QA bypass in the signed-controller flow.
