---
status: reference
owner: engineering
last_reviewed: 2026-08-28
declaration_id: 2026-08-28-preflight-token-minting-automation
classification: minor
surfaces: compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.08.28
verification_evidence: node --check scripts/mint-preflight-token.js,node --check scripts/build-preflight-request.js,node --test scripts/build-preflight-request.test.js,npm run check:compliance,manual dry-run of scripts/mint-preflight-token.js and the sweep workflow's result-gating logic against a local target (documented in PR)
rollback_note: Revert scripts/mint-preflight-token.js, .github/workflows/compliance-preflight-sweep.yml, the docs/promoter-skill edits, and this declaration together. Nothing here changes any runtime authorization decision, schema, or persisted business state — reverting restores the prior manual-token-paste procedure exactly as it was, with no cleanup required on any host. No bot account or GitHub secret this PR documents is created by the revert itself; those remain a separate manual step either way.
---

# Automate DGFY_DEV_TOKEN Minting for the Compliance Preflight Sweep

Covers #1121 (`feat(compliance): automate DGFY_DEV_TOKEN minting for preflight sweep`).

## Compliance Impact Classification

**Minor.** `scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES` patterns
(`apps/dgfy-api/src/modules/{pos,vouchers,store,payments,commercePayments}/`) don't match this
diff's paths (`scripts/`, `.github/workflows/`, two docs) — this PR doesn't touch any
compliance-sensitive backend module, so a declaration isn't mechanically required by the gate at
all. It's filed anyway because #1121 itself flags this as "auth/credential automation touching a
compliance-classified surface" and asked for one explicitly.

**Why `minor`, not `major`/`regulatory`:** the change automates *obtaining the credential* used to
call `POST /api/v1/compliance/preflight` — it does not touch the preflight endpoint's own decision
logic, the policy engine, or any authorization/shift/payment/document-classification path. Per the
issue's own framing: "this is not a bypass mechanism... only automates obtaining the credential."
`major`/`regulatory` would additionally require asserting a `preflight_result: no_breach` this PR
has no live run to back — `minor` is the classification that doesn't require that assertion
(`check:compliance`'s `PREFLIGHT_REQUIRED_CLASSIFICATIONS` is `{major, regulatory}` only), and is
the honest one: nothing here has actually been evaluated by the policy engine, because nothing here
changes what the policy engine evaluates.

## Affected Surfaces

1. **`compliance` — new automated path to the preflight credential.**
   `scripts/mint-preflight-token.js` logs in as a dedicated, least-privilege bot account
   (`SYSTEM.EDIT_SETTINGS` only) via the existing `POST /api/v1/auth/login` endpoint and prints the
   resulting JWT. No new backend endpoint, no new permission, no change to `authService.js`,
   `middleware/auth.js`, or the compliance policy engine.
2. **`compliance` — new CI workflow.** `.github/workflows/compliance-preflight-sweep.yml`
   dispatches the mint script and calls the existing `POST /api/v1/compliance/preflight` endpoint,
   once per outstanding `NOT-EXECUTED-*` declaration, on the self-hosted `sieitz-runner` (no GHA-
   minutes cost). Read-only against the target host — no write path to declaration files or a PR
   exists inside the workflow.
3. **Non-sensitive — docs.** `docs/compliance/request-time-preflight-protocol.md` and
   `.agents/skills/promoter/SKILL.md` are updated to document the new mechanism and STAGING as the
   preflight target (per #1121's explicit redirect, ahead of #982's own docs amendment).

## Compliance Preconditions

1. No authorization, shift, terminal, payment, or document-classification decision changes.
2. The minted token is never logged, cached, or persisted anywhere — `scripts/mint-preflight-
   token.js` prints only the JWT to stdout on success, and the workflow's step summary /
   `compliance-preflight-sweep-results` artifact record only `{declaration, http_code, response}`
   from the preflight call itself, never the token or the bot account's password.
3. The bot account's credentials live only in a GitHub Environment's own secret store
   (`STAGING`, optionally `DEV`) — never in this repo, never in a script, never in a plain env file.
   Provisioning the account itself is explicitly a manual, one-time step this PR does not perform —
   see the protocol doc's "Where live preflight actually runs" for why (a per-tenant database write
   `apps/dgfy-migration-runner`'s landlord-only scope cannot make) and what to do instead.
4. The bot account must carry `permissions: ["settings:edit"]` only, never `role: "admin"` or any
   broader grant — documented explicitly in the protocol doc as a requirement of the manual
   provisioning step, not assumed.

## Verification Evidence

1. `node --check scripts/mint-preflight-token.js` — syntax-only Tier 0 floor for `apps/dgfy-api`-
   adjacent tooling with no build step (mirrors `implement`'s Tier 0 policy for backend/tooling
   changes).
2. `npm run check:compliance` — confirms this declaration's own front matter passes the shape gate.
3. Manual dry-run of `scripts/mint-preflight-token.js` against a local target with fabricated
   credentials, confirming: missing-env-var handling exits 1 with a named-var message; a non-2xx
   login response exits 1 without dumping the response body; a successful login prints only the
   token to stdout. (Documented in the PR body rather than an automated test — this repo has no
   local target host to run this against for real, per the issue's own "not the same as
   `gate:release:local`" caveat.)

No database schema, migration, receipt output, fiscal classification, payment path, or
authorization rule is touched.

## Preflight Reconciliation

Not run — this PR targets `develop`, and per this protocol doc's own "Where live preflight actually
runs" section, a `NOT-EXECUTED-*` placeholder is the accepted, expected state for a
`develop`-targeting PR, not a defect. Since this declaration's classification is `minor`, the four
`preflight_*` front-matter fields aren't gate-required at all (`check:compliance`'s
`PREFLIGHT_REQUIRED_CLASSIFICATIONS` is `major`/`regulatory` only) — they're omitted here rather
than asserted, since nothing has actually been evaluated by the policy engine and there is nothing
here for the policy engine to evaluate (see "Why minor" above). If this classification is ever
revisited upward, use `preflight_request_ref: NOT-EXECUTED-1121-PREFLIGHT-TOKEN-MINTING` and
reconcile it through the promotion-time sweep like any other declaration — fittingly, using the
mechanism this PR itself ships.

## Deployment And Rollback

Deploy the script, the workflow, and the docs edits together. No database migration, backend data
cleanup, or host action is required for either direction. The bot account and its GitHub Environment
secrets (provisioned separately, out of this PR's scope) are unaffected by reverting this PR — they
simply become unused until the mechanism is reintroduced or the manual procedure resumes.

Three follow-ups this declaration does not resolve, named so they aren't lost:

1. Provisioning the real STAGING bot account, choosing its tenant, and creating the four
   `PREFLIGHT_*` GitHub Environment secrets — one-time human/ops action, no automated path exists
   for any of it in this repo today.
2. Actually dispatching `compliance-preflight-sweep.yml` against a live STAGING run — blocked on
   (1); a human or `promoter` test-dispatches it once the secrets exist.
3. A rotation/revocation procedure for the bot account's password and the GitHub Environment
   secrets themselves — undesigned (pr-reviewer RF-4 on PR #1127; see the protocol doc's "Storage
   mechanism" note for the full rationale on why GitHub Environment secrets replaced #1121's
   original SOPS+age proposal, and why that substitution doesn't itself resolve rotation).
