# Production Observability Runbook

Status: authoritative
Owner: operations
Last reviewed: 2026-06-16

Use this runbook when production bugs, tenant reports, release regressions, or AI-agent investigations need traceable evidence.

## Trace Keys

1. `x-request-id` is the primary public correlation key.
2. `x-trace-id` is optional for callers. When omitted, the backend mirrors `x-request-id`.
3. Unsafe inbound IDs are regenerated. Safe IDs use letters, numbers, `.`, `_`, `:`, and `-`, with a maximum length of 100 characters.
4. Error JSON includes both `request_id` and `trace_id` where the existing error contract already exposes `request_id`.

## Request Outcome Logs

Production request outcomes are written to:

```text
backend/logs/request-outcomes.log
```

Each line is structured JSON and intentionally excludes request bodies, cookies, auth headers, company tokens, OTPs, passwords, provider secrets, raw emails, and raw phone numbers.

Expected fields:

- `event`
- `request_id`
- `trace_id`
- `method`
- `route`
- `status`
- `status_class`
- `duration_ms`
- `surface`
- `tenant_id`
- `user_id`
- `error_code`
- `ip_hash`
- `user_agent_family`

## Incident Bundle Workflow

Generate an AI-safe investigation bundle from the repo root:

```bash
npm run evidence:incident -- --request-id <request_id> --since <iso> --until <iso> --surface <surface>
```

Output:

```text
.tmp/incident-bundles/<timestamp>-<slug>/
```

Bundle contents:

- `incident_bundle.json`
- `ai_trace_index.md`
- `sanitized_log_excerpts.ndjson`
- `reproduction_template.md`
- `redaction_report.json`

AI agents must inspect these sanitized bundles instead of raw production logs. If raw logs are needed, an operator should generate a new bundle with a narrower `request_id`, `trace_id`, time window, or surface filter.

## Release Evidence

Run the observability gate in report mode:

```bash
npm run gate:release:observability
```

Default output:

```text
.tmp/release-gates/<sha>/observability_evidence.json
```

The gate checks health reachability, request/trace header round-trip, metrics reachability when enabled, structured request logging configuration, incident bundle dry-run, deployed SHA evidence, and stale QA deploy-head review.

The first rollout remains report-only. After one successful production release includes `observability_evidence.json`, set:

```bash
OBSERVABILITY_GATE_MODE=enforce
```

## Investigation Order

1. Confirm the production SHA from deploy summary and `.deploy-state/last_deployed_commit`.
2. Search by `request_id` or `trace_id` in the incident bundle.
3. Check the request outcome line for route, surface, status, error code, and duration.
4. Compare `/health` and `/metrics` snapshots for degraded runtime, schema, telemetry, or error-rate signals.
5. Use the reproduction template in a non-production environment with equivalent tenant setup.
6. Link the bundle path in the issue, PR, release note, or incident note.

## Safety Rules

1. Do not paste raw production logs into AI tools.
2. Do not include request bodies, cookies, session material, auth headers, OTPs, passwords, company tokens, or payment secrets in issue comments.
3. If a bundle contains unexpected sensitive data, delete it locally, fix the redaction rule, and regenerate the bundle.
