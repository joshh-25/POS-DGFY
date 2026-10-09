---
status: authoritative
authority_level: authoritative
owner: platform
last_reviewed: 2026-10-09
applies_to: dgfy_api_platform_admin
topic: tenant_intake_api
---

# Tenant intake API (#2372, Phase 485)

Base: `/api/v1/admin/tenant-intake`. Every route requires a live Platform Admin session and both
`admin.tenants` and `admin.dgfy_accounts`, or Platform Master authority. Cookie requests retain the
existing CSRF contract. Responses use `Cache-Control: no-store`.

| Method/path | Input | Result |
| --- | --- | --- |
| GET `/capabilities` | none | `demo: {allowed, reason}`, `extraction_enabled` |
| POST `/proposals` | `{target, source, payload}` | 201 pending proposal; no account or tenant created |
| POST `/proposals/extract` | JSON `{text, target, reason}` or multipart `file`, `target`, `reason` | 201 pending proposal from OpenAI extraction |
| GET `/proposals` | optional `status`, `limit` (1–100; default 50) | newest proposals, with expired pending rows projected as expired |
| GET `/proposals/:id` | none | proposal, including execution status and retained tenant ID |
| PATCH `/proposals/:id` | `{payload, target?}` | replaces the complete pending payload; recomputes hash, preserves original expiry |
| POST `/proposals/:id/reject` | none | terminal rejection |
| POST `/proposals/:id/confirm` | `{payload_hash, human_confirmed: true}` | 201 proposal plus existing provisioning result, including one-time temporary password |

Structured payload (same fields as the existing bundled admin-provisioning use case):

```json
{
  "target": "OFFICIAL",
  "source": "admin_form",
  "payload": {
    "reason": "Operator onboarding",
    "dgfy_account": {
      "first_name": "Ana",
      "middle_name": "",
      "last_name": "Owner",
      "email": "ana@example.test",
      "phone": "+639171112222"
    },
    "company": {"name": "Sample Store", "workflowMode": "retail", "templateKey": null}
  }
}
```

`target` defaults to `OFFICIAL`; valid values are `OFFICIAL|DEMO`. Structured requests allow source
`admin_form|mcp`; extraction assigns `admin_upload` server-side. Source is caller attribution, not
authorization. Structured aliases accepted by existing provisioning are normalized into the above
shape. Unsupported fields (including roles, owner IDs and verification markers) are dropped.
Credential-bearing fields/input are rejected before extraction or storage. No supplied temporary
password is accepted; the existing use case generates one at execution.

Hashing uses SHA-256 of sorted-key JSON containing **both target and canonical payload**. The client
must review the whole current payload/warnings and echo its hash. Only unexpired pending proposals
can be edited, rejected or confirmed. Confirmation commits an atomic row-locked claim and approval
audit before invoking the existing provisioning use case outside that transaction. Concurrent,
replayed, expired or stale-hash confirmation returns 409 without another provisioning call.
Missing confirmation is 400; missing permissions are 403; missing proposal is 404.

DEMO requires an explicitly set non-production `NODE_ENV`, landlord `DB_NAME` matching
`/dev|test|local|demo/i`, and exactly `SEED_DEMO_APPROVED=true`. The guard runs at proposal creation,
confirmation, and inside both admin provisioning use cases, including retries of existing demo
tenants. New tenants persist `tenants.is_demo`; safe provisioning snapshots and admin lists expose
it. OFFICIAL has no environment restriction. `DB_NAME` must identify the configured landlord schema
(in tests also set `DB_NAME_TEST` to the same value).

Extraction accepts one text/CSV/PDF upload up to 2 MiB, at most 20 PDF pages and 50,000 extracted text
characters, or pasted text with the same character cap. Scanned PDFs need transcription. Unset
`OPENAI_API_KEY` returns 503; `TENANT_INTAKE_MODEL` defaults to `gpt-5-mini`. Provider requests have
no tools, strict structured output, `store:false`, a 60-second timeout and no automatic retries.
Documents stay in request memory only. Persisted provenance uses a neutral filename, MIME, SHA-256
and model; usage logging contains model, token counts and estimated cost only.

Raw documents may include contact PII sent to OpenAI. Operators must submit only the business and
owner contact fields, never credentials. Detection rejects recognized credential keys, labels and
bearer/key patterns; arbitrary unlabelled secrets cannot be identified reliably. Human review
remains required. Missing/unrecognized industry follows the existing provisioning normalizer, with
an explicit warning to review its fallback. Template selection remains best-effort.

The extracted contact values are not independently verified. Existing provisioning records the
admin-provisioned email source; that is operator assertion, not OTP ownership proof. Account
password/profile/logout and membership lifecycle remain the existing DGFY flows.

## Audit and recovery

Proposal events use `platform_admin_audit_logs`: actor, source, target, hash, provenance, proposal
and tenant identifiers, approval channel. Existing tenant/account provisioning audits remain intact.
Neither proposal nor audit stores the returned password. `approved_via: admin_http` identifies the
transport, not independent proof of a human; the planned admin UI is the human-review surface.
Omitting MCP confirm tools constrains the tool surface, but an admin bearer token can call HTTP
confirmation. No cryptographic human-only boundary is claimed.

An execution may outlive the HTTP connection (existing provisioning can take ~180 seconds). Poll
GET instead of retrying confirmation. Lost success responses do not reveal the password again;
use existing admin password-reset lifecycle. `failed` is terminal and retains safe failure code,
partial-state/retryable flags and tenant ID. After inspection and correction, a **new** reviewed
proposal may invoke existing pending-tenant retry semantics. An abandoned `executing` row requires
operator reconciliation; there is no automatic lease expiry, redrive or duplicate creation.

## Rollout and validation

Apply `20261009000001-create-tenant-intake-proposals.cjs` to the landlord database **before** the
API image starts using the new model/column. The proposal model is excluded from tenant cloning;
no tenant-schema registry entry is required. Migration `up` is repeatable. Rollback reverts code
and preserves proposals, audits and demo classification; `down` refuses automatic destructive
rollback pending an operator-reviewed data preservation plan.

Focused tests: `npm --prefix apps/dgfy-api test -- --runTestsByPath tests/tenantIntake.usecases.test.js
tests/tenantIntake.extraction.test.js tests/tenantIntake.transport.test.js tests/adminAssistedProvisioningUseCase.test.js
tests/platformAdminRouteClassification.test.js`. Real persistence/schema proof:
`node scripts/verify-tenant-intake.mjs` with a new disposable local MySQL database and the explicitly
documented environment guard at the top of that script. Never point it at a shared schema.

This is backend PR 1 only. The dgfy-admin review/upload UI and local stdio MCP proposer are later
PRs under #2372; their completion, provider proof and deployment verification remain outstanding.

Architecture decision: [ADR 0090](../architecture/adr/0090-tenant-intake-proposal-confirmation.md).
