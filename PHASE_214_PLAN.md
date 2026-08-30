# Phase 214 — Affiliate Enrollment Status History (#1202)

**Issue:** #1202 — *Affiliate enrollment status history: `reactivated_at`/`reactivated_by` or a
status-events table*
**Epic:** #446 (Affiliate program v2) · **Refs:** #450 (Phase 199), #1191 (Phase 207), #1203 (queued
as Phase 215)
**Planned against:** `origin/develop @ addbc65c6` (fetched 2026-08-31; Phases 212 and 213 merged)
**Phase number:** 214 — the next continuous number in
`docs/features/IMPLEMENTATION_PHASE_LEDGER.md` (highest ledgered: 213, plus an out-of-band 219 for
#1220). See J8 for the numbering caveat.
**Status of this document:** plan only. No implementation code was written.

---

## 0. READ FIRST — every open judgment call

Read this section before anything else. It names each call this plan makes, whether it is mine to
make or Pat's, and what the default is if nobody answers.

| # | Call | Who owns it | This plan's position |
|---|---|---|---|
| **J1** | **Option (a) columns vs option (b) events table** | **Mine — engineering tradeoff, not policy** | **Option (b): a `dgfy_affiliate_enrollment_status_events` table.** Full justification in §3. Option (a) is cheaper by roughly one model + one endpoint, but it cannot answer the question #1202 was filed to answer, and it cannot give #1203/Phase 215 an actor *name* (F4). |
| **J2** | **Is the status history visible to the affiliate themselves, or merchant-only?** | **Pat's — this is the one genuine product-policy question in here** | **Default taken: merchant-only.** The history carries a merchant's free-text `reason` ("suspected code sharing", "no longer with us"). Surfacing that to the affiliate in the storefront customer dashboard is a relationship/tone decision, not an engineering one. Phase 214 ships **no** storefront surface either way, so this does not block the phase — but it must be answered before any affiliate-facing read path is built, and Phase 215 (#1203) should not assume it. |
| **J3** | **Backfill existing rows into the events table?** | Mine | **Partial, unambiguous-only** (§4.2). Synthesize an `enrolled` event per existing enrollment from `created_at`, and a demotion event where `revoked_at IS NOT NULL` **and** the row's current status is `suspended`/`revoked` (target knowable). Skip rows where `revoked_at` is set but status is now `active` — the demotion target is genuinely unknowable (F5) and a guess would be fabricated audit evidence. Backfilled rows carry `source: 'backfill'` so they are never mistaken for captured events. |
| **J4** | **Does `POST .../reactivate` start accepting an optional `reason`?** | Mine, with a product edge | **Yes, optional, ≤500 chars, additive** (no existing caller breaks). Without it the new table has a permanently-null `reason` on exactly the transition #1202 is about, and a Phase 216 "add reactivation_reason" is guaranteed. Whether the UI *requires* a reason is Phase 215's call, not this one's. |
| **J5** | **Retire `revoked_at`/`revoked_by`/`revocation_reason` in favour of the table?** | Mine | **No — keep all three, unchanged.** They become a documented denormalized cache of the most recent demotion. Retiring them is a breaking change to `GET /affiliates` (Phase 207's own compliance declaration lists them as preserved behaviour), plus a data migration, plus an N+1 on the list endpoint. §3.4. |
| **J6** | **Fix `revoked_at`'s suspend/revoke conflation (F5)?** | Mine | **No, not in this phase.** The events table records `from_status`/`to_status` exactly, so the conflation stops mattering for anything reading the new table. Changing the three columns' meaning is a separate, breaking change with no caller asking for it. |
| **J7** | **Read shape: new endpoint vs inline in `GET /affiliates`** | Mine | **A dedicated `GET /affiliates/:enrollment_id/status-events`**, mirroring Phase 213's own `GET /:id/affiliate-slots/audit-logs` sibling (F8). Inlining an unbounded history array per row into a list endpoint that already does per-row earnings and cap queries is the wrong trade. |
| **J8** | **Phase numbering** | Mine, needs a sanity check | 214 is free. **215 is the intended slot for #1203** per the dispatching brief. Note that **216 and 219 are already claimed by in-flight non-affiliate work** in sibling worktrees (219 is already ledgered for #1220), so 217/218 are the next free numbers after 215. If #1203 does not get worked next, do not silently reassign 215. |
| **J9** | **Retention / pruning of status events** | Named, not solved | **None.** Neither `dgfy_account_admin_audit_logs` nor `tenant_admin_audit_logs` has a retention policy today; inventing one here would be an unasked-for divergence. Row volume is bounded by human admin actions, so this is not an urgent gap — but it is a gap, and it is stated rather than left implied. |
| **J10** | **Transactional event write, or best-effort?** | Mine, with a named residual risk | **Transactional** — same reasoning Phase 213 recorded verbatim ("a cap write that lands without its audit row is exactly the state #1190 exists to eliminate"). ADR 0036 Decision 4's best-effort posture governs *accrual bookkeeping on the sale path*, not admin status changes, and must not be borrowed here. **Residual risk, stated:** the auto-enroll-on-register path (§4.4, site 2b) runs inside the account-creation transaction, so an event-insert failure there would abort a user registration that would otherwise have succeeded. The alternative (skip event writes on that one path) leaves a permanent hole in the history for every invite-accepted affiliate. I take the transactional side; if Pat disagrees, the narrow fix is a try/catch around *only* that call site, not a global best-effort posture. |
| **J11** | **Pre-existing defect found while planning — hand off, don't fix here** | Needs a `pm` filing | `DgfyAffiliateCategoryRate` (Phase 209, #448) was **not** added to `NON_TENANT_MODEL_EXPORTS` (`apps/dgfy-api/src/utils/tenantModelFactory.js`), unlike every other landlord affiliate model. Consequence and calibration in F10 — flagged, **not** asserted as a live production fault, and out of scope for this phase beyond making sure Phase 214's own new model does not repeat it. |

**Nothing in this list blocks starting the work.** J2 is the only item with a product-policy edge,
and it is scoped entirely outside Phase 214's deliverable.

---

## 1. Documentation read before planning (per `AGENTS.md`'s lookup order)

1. `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md` (`authoritative`,
   `last_reviewed: 2026-03-06`) — the `routes → controllers → usecases → repositories → models`
   chain this plan follows exactly.
2. `docs/architecture/ARCHITECTURE_GOVERNANCE.md`, ADR 0039 (clause strictness tiers).
3. **ADR 0036** — *Affiliates Program: Commission Ledger, Attribution, and Cashout*,
   `status: amended`, `authority_level: authoritative`, `last_reviewed: 2026-08-31`,
   `review_by: 2027-01-24` (not decayed). Its only `[binding]` clause is **Decision 2** (integer
   centavos, bps, rate snapshotting) — **nothing binding governs enrollment status history.**
   Decision 1 establishes the landlord-DB home and the no-cross-DB-FK convention this plan obeys.
4. ADR 0050 (affiliate buyer-facing pricing) — read, not engaged by this phase.
5. `docs/features/IMPLEMENTATION_PHASE_LEDGER.md` — Phases 199, 207, 208, 209, 213 entries
   (`grep '^## Phase'` only; the file is ~13k lines).
6. `docs/compliance/impact-declarations/2026-08-30-affiliate-reactivation-endpoint.md` (Phase 207).
7. `AGENTS.md` and `.agents/skills/implement/SKILL.md`, both in full.

**Governance consequence (§8):** ADR 0036 needs a dated `## Amendments` block in the same PR. This
is new material the ADR omits rather than a correction of an existing clause — the same route
Phase 213's own amendment took, filed under ADR 0039's `[default]`/untagged tier. No new ADR, no
tech-lead approval gate.

---

## 2. Ground truth — what the code actually does today

Verified against `origin/develop @ addbc65c6`, not from #1202's summary.

### F1 — There are exactly four writers of `dgfy_affiliate_enrollments.status`

All four live in one file, `apps/dgfy-api/src/modules/dgfy/repositories/dgfyAffiliateRepository.js`:

| # | Repository method | Transition | Reached from |
|---|---|---|---|
| 1 | `createEnrollment` (`:333`) | `∅ → active` | `buildProvisionAffiliateUseCase` (`POST /affiliates`) |
| 2 | `materializeInviteEnrollment` (`:503`) | `∅ → active` | (a) `buildAcceptAffiliateInviteUseCase`; (b) `mirrorPendingAffiliateInvitesForAccount` (`:583`), the auto-enroll-on-register hook, called from `dgfyAuthUseCases.js` inside the account-creation transaction |
| 3 | `updateEnrollment` (`:365`) | `active → suspended`, `* → revoked` **(demotions only)** | `buildUpdateAffiliateEnrollmentUseCase` (`PATCH /affiliates/:enrollment_id`) |
| 4 | `reactivateEnrollment` (`:391`) | `suspended\|revoked → active` | `buildReactivateAffiliateEnrollmentUseCase` (`POST /affiliates/:enrollment_id/reactivate`, Phase 207) |

Confirmed exhaustive by `grep -n "row.update\|\.update({"` across the file: every other `.update(`
call targets invites, commissions, cashouts, payout methods, price rules, or category rates — not
enrollment status. **Three of the four already own a transaction**; only `updateEnrollment` (site 3)
does not. Sites 1, 2, and 4 also carry `acquireAffiliateSlotLock`'s #1187 RF-6 ordering contract
("must be the FIRST statement of its transaction, before any other read").

### F2 — A `revoked` enrollment has no Reactivate button in the merchant UI

`packages/web-core/src/features/pos/components/AffiliatesWorkspacePanel.jsx:833-846`: the action
row renders **Suspend** when `status === 'active'`, **Reactivate** when `status === 'suspended'`,
and **nothing** otherwise. **Revoke** renders whenever `status !== 'revoked'`.

So today, through the UI, `revoked` is terminal — the reachable cycle is
`active ⇄ suspended`, plus a one-way `→ revoked`. The API allows `revoked → active` (Phase 207
explicitly supports it), the UI just never offers it. This does **not** weaken #1202's premise:
`revoked_at` is stamped on *both* demotion targets (F5), so an `active → suspended → active →
suspended` cycle — fully reachable by a merchant, today, with two clicks — already loses every
suspension but the last. It does mean the multi-cycle scenario is more mundane than #1202's
"revoke/reactivate" framing suggests, and it surfaces a UI gap Phase 215 should look at.

### F3 — `revocation_reason` is never populated in practice today

`handleStatusChange` (`AffiliatesWorkspacePanel.jsx:408-419`) calls
`updateAffiliateEnrollment(id, { status })` with no `revocation_reason`. There is no reason input
anywhere in the panel. The backend accepts and stores one (Phase 199 D6/D7), but nothing sends it.

**Consequence that must be stated plainly rather than discovered later:** Phase 214's `reason`
column will also be empty for UI-driven transitions until Phase 215 adds a reason prompt. Phase 214
delivers the *capacity* to record a reason, not populated reasons.

### F4 — `revoked_by` is an unresolvable integer; both existing landlord audit tables denormalize the actor name instead

`revoked_by` is written from `req.user?.user_id` — a **tenant-DB `users.user_id` integer**, held by
value with no FK (the Phase 199 migration says so outright: *"tenant-DB — value link only, no FK,
cross-database"*). Nothing in the codebase resolves it to a name, and the affiliate repository has
no tenant-DB handle to do so with; the enrollment include is `DgfyAccount` (the affiliate), never
the acting staff user.

A UI that renders `revoked_by` today can only say **"by user #7."**

Both landlord audit tables solved this the same way — by denormalizing a display string at write
time:

- `dgfy_account_admin_audit_logs.actor_username` `STRING(120) NOT NULL`
- `tenant_admin_audit_logs.actor_username` `STRING(120) NOT NULL`

`req.user.username` is available at the controller (`middleware/auth.js:331-333`), and
`middleware/auth.js:481` already uses exactly the
`String(req.user?.username || req.user?.email || '').slice(0, 120)` shape.

**This is the single most valuable thing Phase 214 can hand Phase 215, and option (a) cannot
provide it** — `reactivated_by INTEGER` reproduces the same unresolvable-id problem in a second
column.

### F5 — `revoked_at` conflates `suspended` and `revoked`, and only stamps on a *change*

`buildUpdateAffiliateEnrollmentUseCase` (`dgfyAffiliateUseCases.js:619-631`) stamps all three
columns when `updates.status ∈ {suspended, revoked}` **and** `previous.status !== updates.status`.
So `active → suspended → revoked` stamps twice and the suspension is gone; an idempotent re-PATCH
correctly does not re-stamp. The three columns therefore mean "the most recent demotion, of either
kind" — not "the revocation."

### F6 — the `pending` enrollment status is unreachable

The model defaults to `'pending'`, but every creation path passes `status: 'active'` explicitly
(`createEnrollment`'s own comment says so). `REACTIVATABLE_STATUSES` deliberately excludes it
(Phase 207 returns 409 `AFFILIATE_NOT_REACTIVATABLE`). The events table's `from_status`/`to_status`
should still admit it — it is a legal model value — but no phase-214 code path emits it.

### F7 — a backend-only Phase 214 needs **no** compliance impact declaration

`scripts/check-compliance-impact.js`'s sensitive-path table (lines 35-195) covers
`apps/dgfy-api/src/modules/{pos,vouchers,store,payments,commercePayments,downpayment,settings,compliance}/`,
a handful of named routes/controllers, and `packages/web-core/src/features/pos/`. It contains **no
entry** for `apps/dgfy-api/src/modules/dgfy/**`, `apps/dgfy-api/src/routes/affiliateAdmin.js`, or
`apps/dgfy-migration-runner/migrations/**`.

Phase 207's declaration exists **solely** because it touched two
`packages/web-core/src/features/pos/**` files — its own text says so. Phase 214 as scoped here
touches none, so `npm run check:compliance` will pass with no declaration. **Phase 215 (#1203) will
need one** (it edits `AffiliatesWorkspacePanel.jsx`, `major`/`pos,terminal` by the floor rule) — a
further argument for the backend/frontend split this plan takes.

### F8 — three in-repo precedents for the shape, one of which was deliberately *not* a new table

1. **`dgfy_account_admin_audit_logs`** (`models/Landlord/DgfyAccountAdminAuditLog.js`) — the closest
   analogue by far: per-account lifecycle audit with an `action` ENUM including `suspend` and
   `reactivate`, a denormalized `actor_username`, a `reason`, request metadata
   (`request_id`/`ip_address`/`user_agent`), and `before_snapshot`/`after_snapshot` JSON. Written
   **inside the same transaction** as the lifecycle change
   (`dgfyAdminAccountUseCases.js:392-403`), read back with `limit` clamped to 1..100 and serialized
   onto the admin detail GET. *The DGFY-account half of this exact problem is already solved this
   way.*
2. **`company_registration_events`** (`models/Landlord/CompanyRegistrationEvent.js`) — a leaner
   event-log shape: `event_type STRING(80)`, `actor_type ENUM('applicant','platform_admin',
   'system')`, nullable `actor_id`, `details JSON`, and `timestamps: true, updatedAt: false`
   (append-only by construction). The `actor_type` discriminator and the `updatedAt: false` posture
   are both worth copying.
3. **`tenant_admin_audit_logs`** — **considered and rejected as a reuse target.** Phase 213 (#1190,
   merged 2026-08-31) chose to extend this table rather than create a new one, and ADR 0036's
   amendment records the reasoning. That reasoning does **not** transfer:
   - its `action` ENUM is entirely *platform-admin* operations (`admin_create_tenant`,
     `admin_assign_owner`, `affiliate_slots_update`); the actor here is **tenant staff**, a
     different actor class entirely;
   - it is keyed `tenant_id` only — there is no enrollment key, so "this affiliate's history"
     is not expressible as an indexed query;
   - `reason` is `NOT NULL`, and F3 shows the merchant path supplies no reason today;
   - it is a **platform-admin-read** surface (`GET /admin/tenants/:id/…`, `authenticateAdmin`),
     not a merchant-read one.

   Reusing it would mean a merchant-facing read of a platform-admin audit table. Rejected.

4. **The tenant-DB generic `AuditLog`** (`models/AuditLog.js`, `entity_type`/`entity_id`) — also
   rejected: the enrollment is a **landlord** row (ADR 0036 Decision 1), the affiliate repository
   has no `dbStore` handle, and writing tenant-DB rows from the landlord-scoped affiliate module
   would cross the boundary ADR 0029/ADR 0036 Decision 1 exist to hold.

### F9 — `GET /affiliates` already returns the three revocation columns

`listEnrollmentsForTenant` → `toPlain(row)` returns the whole row; `buildListAffiliatesUseCase`
spreads `...enrollment` and appends `earnings`/`earnings_cap`. There is no field allowlist. So
`revoked_at`/`revoked_by`/`revocation_reason` are already on the wire — exactly as #1203 states —
and **any column option (a) adds also appears automatically, with no serializer change.** That is
option (a)'s one genuine advantage, and it is priced into §3.2.

### F10 — pre-existing gap found in passing (J11, hand off to `pm`, do not fix here)

`NON_TENANT_MODEL_EXPORTS` (`apps/dgfy-api/src/utils/tenantModelFactory.js:4`) lists every landlord
affiliate model — `DgfyAffiliateEnrollment`, `…Attribution`, `…Commission`, `…PayoutMethod`,
`…Cashout`, `…Invite`, `…PriceRule`, `TenantAffiliateSettings` — **except
`DgfyAffiliateCategoryRate`**, added by Phase 209 (#448). Any model absent from that set is re-bound
onto every tenant connection by `getTenantModels`, and the set's own comment warns this "makes
Sequelize emit foreign keys for landlord tables (for example `tenants`), which do not exist in an
isolated tenant schema."

**Calibrated honestly:** this is a hygiene/latent-risk finding, **not** a confirmed production
fault. `apps/dgfy-api/scripts/sync-tenant-schemas.js`'s required-table/column contracts are
hand-curated constants, not derived from `getTenantModels`, so the #860/#639 crash-loop preflight is
not driven by this omission. It has not been reproduced at runtime and this plan does not claim it
has been. File it via `pm`; do not fix it inside Phase 214's PR (out of scope, different issue).

**What Phase 214 must do about it:** add its own new model to `NON_TENANT_MODEL_EXPORTS`. §4.3.

---

## 3. The decision — option (b), and why

### 3.1 What each option actually produces for a real history

Take the cheapest genuinely-reachable multi-cycle case from F2 — a merchant suspending and
restoring an affiliate twice over a quarter, with reasons:

```
Jan 04  enrolled (invite accepted)
Feb 11  active    -> suspended   by Ana    "card testing on her code"
Feb 20  suspended -> active      by Ana
Apr 02  active    -> suspended   by Marco  "second incident"
Apr 09  suspended -> active      by Marco
```

**Under option (a)** the row afterwards reads:
`status=active`, `revoked_at=Apr 02`, `revoked_by=14`, `revocation_reason="second incident"`,
`reactivated_at=Apr 09`, `reactivated_by=14`.
February is gone entirely. The enrolment date is inferrable from `activated_at`. Nobody can answer
"has this affiliate been suspended before?" — which is the actual question a merchant asks before
deciding whether to reinstate.

**Under option (b)** all five rows survive, each with `from_status`, `to_status`, `actor_username`,
`reason`, and `occurred_at`.

### 3.2 Head-to-head

| Dimension | (a) `reactivated_at`/`reactivated_by` | (b) status-events table |
|---|---|---|
| Answers "how many times has this happened?" | **No** — last-write-wins, one cycle deep | **Yes** |
| Distinguishes `suspended` from `revoked` (F5) | No — inherits the conflation | **Yes** (`from_status`/`to_status`) |
| Actor renderable as a **name** (F4) | **No** — a second unresolvable tenant-DB integer | **Yes** (`actor_username`, denormalized like both existing audit tables) |
| Reason on reactivation | No (would need a third column, later) | Yes |
| Records enrollment/invite-acceptance itself | No | Yes — complete timeline from one source |
| Auto-appears on `GET /affiliates` (F9) | **Yes, free** | No — needs one new endpoint |
| Files touched | migration, model, `reactivateEnrollment`, tests | + model registration, exclusion set, repo write helper ×4 sites, read method, use case, controller, route, tests |
| Write sites to wire | 1 | 4 (all in one file; 3 already transactional) |
| Migration risk | `ALTER TABLE`, 2 nullable columns | `CREATE TABLE`, no change to an existing table |
| What #1203/Phase 215 can render | "last revoked … / last reactivated … by user #14" | a real per-affiliate timeline with names |
| Cost of getting it wrong later | Two dead columns + a migration to add the table anyway | — |

### 3.3 Recommendation

**Build option (b).** It is an engineering tradeoff, not a policy question, and it resolves in (b)'s
favour on four independent grounds:

1. **Option (a) does not close the issue it is proposed for.** #1202's stated defect is
   "last-write-wins, not auditable." Option (a) is still last-write-wins — it just moves the
   waterline one event later. Shipping it would leave #1202 half-open and near-certainly produce a
   follow-up asking for the table anyway; the repo's own precedent (Phase 199 → #1202) is exactly
   this pattern of a deferred correct shape coming back.
2. **The marginal cost is bounded and concentrated.** All four write sites are in one repository
   file, three already own a transaction, and the write is a single `create` per transition. The
   genuinely new artefacts are one migration, one model, one repository pair (write + read), and
   one read endpoint. This is smaller than Phase 209 (which touched two accrual channels across
   `posUseCases.js` and `storeUseCases.js`) and comparable to Phase 213.
3. **Two in-repo precedents already exist for exactly this shape** (F8.1, F8.2) — the DGFY-account
   half of this same lifecycle problem is already solved with a per-entity audit table, written
   transactionally, read back on a detail endpoint. Option (b) is the codebase's own established
   answer, not a novel design.
4. **It is the only option that unblocks #1203 properly** (F4). Phase 215 with option (a) renders
   "by user #14"; with option (b) it renders "by Ana."

**Not escalated as a product-policy question.** I looked for one, and the only thing that qualifies
is J2 (affiliate-facing visibility of merchant-written reasons) — which sits entirely outside this
phase's deliverable and does not gate it. The (a)-vs-(b) choice itself is a schema-shape call of the
same kind Phase 209's A2 made on its own authority (weighted per-line split vs per-line ledger
rows), decided on cost/fidelity grounds and recorded with its consequences, not sent upward.

### 3.4 What option (b) explicitly does **not** do (J5, J6)

The three Phase 199 columns stay exactly as they are: same names, same semantics, same values, same
place in the `GET /affiliates` response. They become a **denormalized cache of the most recent
demotion event**, documented as such in the model and the migration header. The events table is the
authority; the columns are the fast path the list endpoint already reads for free.

This is deliberate:
- Phase 207's compliance declaration lists their preservation as a verified precondition
  (precondition 3) — removing them would contradict a shipped declaration.
- Dropping them is a breaking API-response change plus a data migration, for no caller's benefit.
- Keeping them means `GET /affiliates` needs **zero** change this phase (F9) and stays free of an
  N+1.

**The one invariant this creates, which must be stated so a future reader does not assume otherwise:
the three columns and the events table can disagree about *which kind* of demotion happened** —
`revoked_at` conflates the two (F5), the events rows do not. On any disagreement the events table
wins. Documented in the model and in the ADR amendment, not left implicit.

---

## 4. Design

### 4.1 Table — `dgfy_affiliate_enrollment_status_events`

Landlord DB. Migration `apps/dgfy-migration-runner/migrations/20260901000004-add-affiliate-enrollment-status-events.cjs`
(pick the next free ordinal on the day the branch is cut — `20260901000003` is taken by
`add-order-packed-attribution.cjs`; three files already share a `20260831000001` prefix, so a
collision is survivable but should be avoided).

| Column | Type | Null | Notes |
|---|---|---|---|
| `status_event_id` | `BIGINT` PK auto-increment | no | `BIGINT` matching both audit-log precedents, not the `INTEGER` the affiliate tables use — this is an append-only event stream |
| `enrollment_id` | `INTEGER` | no | value link to `dgfy_affiliate_enrollments.enrollment_id`. **No FK** — consistent with the module's by-value convention (ADR 0036 Decision 1) and so a future enrollment hard-delete cannot cascade away audit evidence |
| `tenant_id` | `UUID` | no | denormalized so every read is tenant-scoped without a join — the same scoping every other affiliate table uses, and what makes the tenant-isolation check in §4.5 a `WHERE` clause rather than a join |
| `from_status` | `ENUM('pending','active','suspended','revoked')` | **yes** | `NULL` = enrollment creation (there was no prior status) |
| `to_status` | `ENUM('pending','active','suspended','revoked')` | no | |
| `event_type` | `ENUM('enrolled','suspended','revoked','reactivated')` | no | Derived, not free-text. Redundant with the status pair *by design*: it is the field a UI filters and labels on, and it is what makes `enrolled` distinguishable from a hypothetical future `pending → active`. Mirrors `dgfy_account_admin_audit_logs.action` |
| `actor_type` | `ENUM('tenant_user','dgfy_account','system')` | no | From `company_registration_events.actor_type`. `dgfy_account` covers invite-acceptance (the affiliate acts, not the merchant); `system` covers auto-enroll-on-register |
| `actor_user_id` | `INTEGER` | yes | tenant-DB `users.user_id`, by value, no FK — same as `revoked_by`. Kept for machine correlation |
| `actor_username` | `STRING(120)` | yes | **The point of F4.** Denormalized at write time from `req.user.username`. Nullable (unlike both precedents' `NOT NULL`) because the `system` and `dgfy_account` actor types have no tenant username |
| `actor_dgfy_account_id` | `UUID` | yes | set on `dgfy_account`-actor events (invite acceptance) |
| `reason` | `STRING(500)` | yes | same width as `revocation_reason` and both audit tables' `reason`. Nullable, unlike `tenant_admin_audit_logs` — F3 |
| `source` | `ENUM('admin_api','invite_accept','auto_enroll','backfill')` | no | distinguishes a captured event from a J3 backfilled one. **Never** conflate them |
| `metadata` | `JSON` | yes | `request_id`/`ip_address`/`user_agent` and anything a later phase needs, without a migration. Same escape hatch `tenant_admin_audit_logs.metadata` provides |
| `created_at` | `DATETIME` | no | `timestamps: true, updatedAt: false` — append-only by construction, copied from `company_registration_events` |

Indexes:
- `idx_affiliate_status_events_enrollment_time` on `(enrollment_id, created_at)` — the primary read.
- `idx_affiliate_status_events_tenant_time` on `(tenant_id, created_at)` — a future tenant-wide feed.
- `idx_affiliate_status_events_event_type` on `(event_type)` — matches both precedents' action index.

No unique index: repeated identical transitions are legitimate history, not duplicates. **This means
the write is not idempotent** — a retried request writes a second event. Accepted: every write site
is inside a transaction that also performs the status change itself, so a retry that writes a second
event is a retry that also performed a second status change, which *is* two events. Stated so
nobody later "fixes" it with a unique index.

Migration guards: `describeTable`/`showIndex`-based idempotency throughout, copied from
`20260901000001-add-affiliate-category-rates.cjs`. `down()` drops the table.

### 4.2 Backfill (J3)

In the same migration, after `createTable`, guarded on the table being empty:

1. One `enrolled` row per existing enrollment: `from_status = NULL`, `to_status = 'active'`,
   `event_type = 'enrolled'`, `actor_type = 'system'`, `created_at = enrollment.created_at`,
   `source = 'backfill'`.
2. One demotion row **only** where `revoked_at IS NOT NULL AND status IN ('suspended','revoked')`:
   `from_status = 'active'` (an assumption, flagged in `metadata.backfill_assumption`),
   `to_status = status`, `event_type = status`, `actor_user_id = revoked_by`,
   `actor_username = NULL` (unrecoverable — F4 is precisely why it was never stored),
   `reason = revocation_reason`, `created_at = revoked_at`, `source = 'backfill'`.
3. **Skip** rows with `revoked_at IS NOT NULL AND status IN ('active','pending')`. The demotion
   target is unknowable (F5) and the reactivation timestamp was never recorded (that is the whole
   of #1202). Fabricating either would be worse than a gap. The migration header must say this
   outright, and `metadata.backfill_assumption` must mark every assumed field on rows that *are*
   written.

**Reviewer's alternative, if this is judged too clever for a migration:** ship no backfill at all
and let the read path render "History begins 2026-09-01" when an enrollment has zero events. That is
a defensible call; it just makes every pre-existing affiliate's timeline start blank. I take the
partial backfill.

### 4.3 Model and registration

- `apps/dgfy-api/src/models/Landlord/DgfyAffiliateEnrollmentStatusEvent.js` — factory shape copied
  from `DgfyAffiliateCategoryRate.js`; `timestamps: true, updatedAt: false`.
- `apps/dgfy-api/src/models/index.js` — import factory, instantiate, add to **both** export blocks
  (the file exports the model map twice, ~`:1268` and ~`:1483`; Phase 209 had to touch both).
  **No `Tenant.hasMany` association** — the by-value `tenant_id` needs none, and adding one would
  emit an FK, which is the exact thing F10's comment warns about.
- **`apps/dgfy-api/src/utils/tenantModelFactory.js` — add `'DgfyAffiliateEnrollmentStatusEvent'` to
  `NON_TENANT_MODEL_EXPORTS`.** Non-optional. F10 shows what happens when this step is missed.

### 4.4 Write path — one helper, four call sites

Add to `dgfyAffiliateRepository.js`:

```
async recordEnrollmentStatusEvent({ enrollmentId, tenantId, fromStatus, toStatus, eventType,
    actorType, actorUserId, actorUsername, actorDgfyAccountId, reason, source, metadata },
    { transaction = null } = {}) { … }
```

A thin `DgfyAffiliateEnrollmentStatusEvent.create(...)`. It **always** takes the caller's
transaction; it never opens its own.

| Site | Where | Event written | Transaction | Ordering note |
|---|---|---|---|---|
| 1 | `createEnrollment` (`:344-363`) | `enrolled`, `actor_type: 'tenant_user'`, `source: 'admin_api'` | existing | after the `create`, well after `assertAffiliateSlotAvailable` — the RF-6 lock-first contract constrains *reads*, and an insert is not a read, but keeping it last removes the question entirely |
| 2a | `materializeInviteEnrollment` (`:549-563`), `created === true` branch only | `enrolled`, `actor_type: 'dgfy_account'`, `actor_dgfy_account_id: account.id`, `source: 'invite_accept'` | existing (own or caller's) | **must be inside `if (!existing)`** — the idempotent re-accept branch must not emit a second `enrolled` event |
| 2b | same method, reached via `mirrorPendingAffiliateInvitesForAccount` | same, `source: 'auto_enroll'`, `actor_type: 'system'` | the **account-creation** transaction | J10's residual risk lives here. `source`/`actor_type` differ from 2a; thread a flag through `materializeInviteEnrollment`'s options rather than sniffing the caller |
| 3 | `updateEnrollment` (`:365-373`) | `suspended` or `revoked` | **new — this method has none today** | see below |
| 4 | `reactivateEnrollment` (`:391-406`) | `reactivated` | existing | after `row.update({ status: 'active' })`, before the `reload` |

**Site 3 is the only structural change.** `updateEnrollment` is a bare
`findOne → row.update → reload` and is called for **non-status** updates too (commission rate,
commission type, the Phase 208 cap fields). The change:

- wrap the body in `DgfyAffiliateEnrollment.sequelize.transaction(...)`;
- read the row **inside** the transaction so `from_status` is read under the same snapshot as the
  write (the same RF-1 correction PR #1228 applied to Phase 213 — a snapshot read on a separate
  implicit connection is not guaranteed to match the locked/written row);
- emit an event **only** when `updates.status` is present and differs from the row's current status
  — mirroring the use case's existing `stamped` condition exactly, so the event and the
  `revoked_at` stamp can never disagree about whether a transition occurred;
- **no slot lock.** `updateEnrollment` only ever demotes now (Phase 207), demotions only free slots,
  and taking `acquireAffiliateSlotLock` here would add contention on the tenant settings row for
  every commission-rate edit. Deliberate, and worth stating in the code comment.

The use case (`buildUpdateAffiliateEnrollmentUseCase`) already computes `previous` and `stamped`;
it passes actor fields down. `revokedBy` is already threaded from the controller
(`dgfyAffiliateHandlers.js:141-150`) — add `revokedByUsername` from `req.user?.username` alongside
it, and the equivalent `reactivatedByUsername` on the reactivate handler.

**`reactivatedBy` finally gets used.** Phase 207 threaded it through the controller and use case and
deliberately left it unpersisted (`void reactivatedBy;`, `dgfyAffiliateUseCases.js:~695`) with a
comment saying a follow-up would use it. Phase 214 is that follow-up: remove the `void`, pass it to
the event write. **Do not add a `reactivated_by` column** — that is option (a), rejected.

### 4.5 Read path (J7)

`GET /api/v1/affiliates/affiliates/:enrollment_id/status-events`

- Route in `apps/dgfy-api/src/routes/affiliateAdmin.js`, beside the existing `/qr` sibling:
  `authenticate` + `checkPermission(PERMISSIONS.AFFILIATES.actions.VIEW_AFFILIATES)` — read
  permission, matching `GET /affiliates` and `/qr`, **not** `MANAGE_AFFILIATES`.
- Controller `listAffiliateEnrollmentStatusEvents` in `dgfyAffiliateHandlers.js`, transport-only.
- Use case `buildListAffiliateEnrollmentStatusEventsUseCase`:
  - `ensureTenantId`;
  - `findEnrollmentById(tenant, enrollmentId)` first — **404 if it does not exist for this tenant.**
    This is the tenant-isolation boundary; do not query events by `enrollment_id` alone;
  - `limit` parsed from the query, clamped `1..100`, default `25` — the clamp shape
    `listAdminAuditLogs` already uses;
  - newest-first (`created_at DESC, status_event_id DESC` — the tiebreaker matters, two events can
    share a second).
- Repository `listStatusEventsForEnrollment(tenantId, enrollmentId, { limit })` — filters on **both**
  `tenant_id` and `enrollment_id`, belt and braces with the 404 above.
- Response: `{ status_events: [...], enrollment_id }`, each event serialized through an explicit
  field list (never `toPlain` of the raw row) so `metadata` internals are a deliberate choice rather
  than an accident.
- **No affiliate-facing surface** (J2). Not on the storefront customer dashboard, not on
  `listEnrollmentsForAccount`.

### 4.6 What Phase 215 (#1203) gets

Purely frontend, no backend dependency left open:
- the three revocation columns, already on `GET /affiliates` today (F9) — the "last revoked …" line
  #1203 literally asks for, buildable with zero Phase 214 work;
- `GET .../status-events` for a real per-affiliate timeline with **names**;
- two adjacent UI gaps Phase 215 should be told about, not left to rediscover: no Reactivate button
  on a `revoked` row (F2), and no reason input anywhere (F3).

---

## 5. Implementation order

Batched by domain per `docs/ai/PR.md`, one commit each — new schema → model wiring → write path →
read path → docs.

1. `feat(db)`: migration (table + indexes + guarded partial backfill).
2. `feat(api)`: model + `models/index.js` (both export blocks) + `NON_TENANT_MODEL_EXPORTS`.
3. `feat(api)`: `recordEnrollmentStatusEvent` + the four write sites, including
   `updateEnrollment`'s new transaction.
4. `feat(api)`: read repository method + use case + controller + route + `modules/dgfy/index.js`
   wiring.
5. `test(api)`: new suite + updates to the two existing ones (§6).
6. `docs`: ADR 0036 amendment + phase-ledger entry (§8).

Branch `feature/1202-affiliate-enrollment-status-events` off fresh `origin/develop`
(`.github/branch-cleanup-policy.json` prefix `feature/`). Base **`develop`**. Link **`Refs #1202`**,
not `Closes` — the change needs deployed verification before the issue closes, matching Phases
199/206's linkage and keeping the `For QA` lane working (`docs/process/ISSUE-TAXONOMY.md`).

---

## 6. Tests

New: `apps/dgfy-api/tests/dgfyAffiliateStatusEvents.unit.test.js`. Reuse the in-memory fake-model
harness from `dgfyAffiliateReactivationUseCase.unit.test.js` (itself copied from
`dgfyAffiliateRepository.slotEnforcement.unit.test.js`) — it already mocks `models/index.js` and
gives `findOrCreate` real lock-queue semantics. It needs one new fake model registered.

1. Provision writes exactly one `enrolled` event (`actor_type: 'tenant_user'`, `source: 'admin_api'`).
2. Invite acceptance writes one `enrolled` event, `actor_type: 'dgfy_account'`,
   `source: 'invite_accept'`.
3. **Re-accepting an already-materialized invite writes no second event** (site 2a's `if (!existing)`
   guard).
4. Auto-enroll-on-register writes `source: 'auto_enroll'`, `actor_type: 'system'`.
5. `PATCH {status:'suspended'}` writes one `suspended` event with `from_status:'active'`,
   `actor_username` from the controller, **and** still stamps `revoked_at` — both, in one call.
6. **Idempotent re-PATCH of the same status writes no event** — matches the existing `stamped`
   condition (F5). The regression guard against the two mechanisms drifting apart.
7. `PATCH` of a non-status field (`commission_rate_bps`) writes no event.
8. `POST .../reactivate` writes one `reactivated` event with `from_status` matching the actual prior
   status — asserted for **both** `suspended` and `revoked` sources, symmetrically.
9. Reactivation still preserves `revoked_at`/`revoked_by`/`revocation_reason` and still does not
   touch `activated_at` — Phase 207's guarantees, re-asserted here so Phase 214 cannot silently
   regress them.
10. A four-transition sequence yields four events in order, with the enrollment's three columns
    reflecting only the last demotion — the §3.1 scenario, asserted directly. **This is the test
    that proves #1202 is actually fixed.**
11. Read endpoint: newest-first, `limit` clamped to 100, `limit` defaults to 25.
12. Read endpoint returns **404** for an enrollment belonging to another tenant, and never leaks its
    events.
13. A failing event insert rolls back the status change (J10's transactional claim, asserted rather
    than assumed).

Updated: `dgfyAffiliateEnrollmentUseCases.unit.test.js` and
`dgfyAffiliateReactivationUseCase.unit.test.js` — their fake repositories need the new method
stubbed. **Assertion changes should be additive**; if an existing assertion has to change meaning,
that is a signal the design drifted, not a test to quietly rewrite.

**Tier 0 (required, per `implement`'s SKILL.md):** `node --check` on every changed `apps/dgfy-api`
and `apps/dgfy-migration-runner` file — neither app has a real build step. **No frontend build is
needed** as long as §7's DO-NOT list holds (no `packages/web-core` file is touched). No
`package.json` changes, so no lockfile step. Post Tier 0 results in the PR body's
`## Testing Evidence`; post any Tier 1/2 runs as a PR comment.

---

## 7. DO NOT

1. **Do not add `reactivated_at`/`reactivated_by` columns.** That is option (a); §3 rejects it. If a
   reviewer disagrees, reopen §3 — do not ship both.
2. **Do not clear or repurpose `revoked_at`/`revoked_by`/`revocation_reason`** (J5). Phase 207's
   compliance declaration lists their preservation as a verified precondition.
3. **Do not touch `activated_at`** — the original enrollment date, rendered to the affiliate as
   "Enrolled `<date>`" in `apps/dgfy-storefront/src/customer-dashboard/components/AffiliateSection.jsx`.
   A standing `DO NOT` since Phase 207.
4. **Do not touch any `packages/web-core/**` file.** It would pull a `major`/`pos,terminal`
   compliance declaration and three frontend builds into a backend-only phase (F7). UI is #1203 /
   Phase 215.
5. **Do not re-open the generic PATCH to `status: 'active'`.** Phase 207's one-enforcement-path
   decision stands; the 422 `AFFILIATE_REACTIVATION_MOVED` stays.
6. **Do not add a foreign key** from the events table to `dgfy_affiliate_enrollments`, `tenants`, or
   any tenant-DB table, and do not add a `Tenant.hasMany` association (ADR 0036 Decision 1; F10).
7. **Do not put `acquireAffiliateSlotLock` on the `updateEnrollment` path** (§4.4).
8. **Do not expose status events on any affiliate-facing surface** until J2 is answered.
9. **Do not fix F10's `DgfyAffiliateCategoryRate` omission in this PR** — hand it to `pm` as its own
   issue.
10. **Do not make the event write best-effort/try-catch** without re-opening J10 explicitly.
11. **Do not add a unique index** on the events table (§4.1).

---

## 8. Governance

**ADR 0036 needs a dated `## Amendments` block, in the same PR.** Route: ADR 0039's
`[default]`/untagged tier — this is new material the ADR omits, not a correction of an existing
clause, and no `[binding]` clause governs enrollment status history (the only one, Decision 2,
governs rate snapshotting). The ADR is already `status: amended`; `last_reviewed: 2026-08-31`,
`review_by: 2027-01-24` — current, not decayed. Exactly the route Phase 213's own amendment took
five days earlier.

The block should record: the new table and its authority relative to the three Phase 199 columns
(§3.4, including the disagreement invariant), the four instrumented write sites, the read endpoint
and its `VIEW_AFFILIATES` gate, J2 as an open decision with its stated default, and J3's partial
backfill with its skip rule.

**Phase ledger entry** — `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`, all seven required fields
per `AGENTS.md`'s Continuous Phase Numbering rules, `status: in_progress` at PR-open and
`completed` only after the acceptance gates pass. "Next eligible phase" should name **215 (#1203)**
and flag that 216/219 are already taken (J8).

**Compliance:** no impact declaration required, for the reason in F7 — stated affirmatively in the
PR body so a reviewer does not have to re-derive the absence.

**Checkpoint (`implement`'s policy):** this phase adds a file under
`apps/dgfy-migration-runner/migrations/`, which is a named checkpoint row. Pat's standing preference
is to skip that confirmation and go straight to PR since he reviews every PR himself; the trigger is
named here rather than silently passed.

---

## 9. Follow-ups for `pm` (file, do not build here)

1. **`DgfyAffiliateCategoryRate` missing from `NON_TENANT_MODEL_EXPORTS`** (F10) — hygiene/latent
   risk, calibrated as unreproduced. Refs #448.
2. **No Reactivate button on a `revoked` affiliate row** (F2) — the API supports it (Phase 207), the
   UI does not offer it. Candidate to fold into #1203/Phase 215 rather than file separately.
3. **No revocation-reason input anywhere in the merchant UI** (F3) — the backend has stored one
   since Phase 199 and nothing populates it. Also a natural #1203 companion.
4. **J2 as an explicit product decision** — affiliate-facing visibility of status history and
   merchant-written reasons.
5. **Retention/pruning for landlord audit and event tables** (J9) — cross-cutting; affects
   `dgfy_account_admin_audit_logs` and `tenant_admin_audit_logs` too, not just this table.

---

## 10. Out of scope, named rather than silently absent

- Any UI (#1203 / Phase 215).
- Status events for **invites** (`dgfy_affiliate_invites` has its own `pending → accepted /
  cancelled / expired` machine, untouched here).
- Status events for cashouts or commissions (both already have their own state columns and
  timestamps).
- Changing what `revoked_at` means (J6).
- Retention, pruning, or export of status events (J9).
- Any change to slot-cap enforcement (#1177 / Phase 198) or to the reactivation guard rails
  (Phase 207).

---

## 11. Current phase / next eligible phase

**Current:** Phase 214 — Affiliate Enrollment Status History (#1202), `planned`.
**Next eligible:** Phase 215 — #1203, the merchant-facing surfacing of this data plus the two UI
gaps in F2/F3. 216 and 219 are already claimed by in-flight non-affiliate work; 217/218 are the next
free numbers after 215 (J8).
