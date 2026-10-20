# Feedback Module

Flow: `routes -> feedback handler -> submit/read use cases -> feedback repository -> FeedbackSubmission`.
The landlord `feedback_submissions` table is the source of truth. The Platform Admin feedback
service is a compatibility facade over this module. The existing `admin.feedback` permission
continues to protect list and stats reads.

`POST /api/v1/feedback` currently requires a tenant-user session. The body accepts `type`
(`bug`, `idea`, `question`, `other`), a 1–5000 character `description`, optional `url` and
`context`, optional `origin` (`surface`, `platform`, `app_version`), and optional guest `contact`
(`name`, `email`). It returns HTTP 201 with `{ message, id }`. The route remains authenticated;
unauthenticated contact submission is deferred to #582. A session's name/email overrides body
contact and is marked verified. A future guest contact is unverified. Unknown origin values are
normalized to `unknown` and retained in `context_json.origin_raw` when the 8 KB context bound
allows. Storefront web uses `storefront` + `web`; native Storefront uses `storefront` + `ios` or
`android`.

The request ID is stored as `correlation_id`, matching the engagement event's correlation ID.
A database failure returns a 500 result; clients can retain their draft and retry. No file
fallback or dual write exists.

## Legacy import after deployment

The migration runner must create the landlord table before API traffic uses it. On each host,
run the import in the API container against its bind-mounted log:

```sh
docker compose exec dgfy-api node scripts/import-legacy-feedback-log.js
docker compose exec dgfy-api node scripts/import-legacy-feedback-log.js --apply
```

The default path is `/app/logs/user_feedback.log`; `--file PATH` overrides it. Dry-run is the
default and reports projected inserts, duplicate skips, and malformed line numbers. Apply is
idempotent by SHA-256 of each original line. A nonzero exit for malformed lines requires an
operator to review those entries; neither mode changes or deletes the source file. Run dry-run
then apply in STAGING, and repeat in PROD after reviewing counts. Until a host import completes,
its older feedback is absent from the database-backed Admin view. This script is not run by the
Worker or as part of startup.
