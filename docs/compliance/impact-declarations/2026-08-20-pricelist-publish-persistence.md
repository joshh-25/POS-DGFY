---
status: reference
owner: engineering
last_reviewed: 2026-08-20
declaration_id: 2026-08-20-pricelist-publish-persistence
classification: major
surfaces: pos,terminal
reason_codes_impacted: none (no reason code added or changed)
policy_version: 2026.08.20
verification_evidence: npm run build:pos,GITHUB_BASE_REF=develop npm run check:compliance,npm run check:architecture,npm run check:adr,npx vitest run src/features/pos/components/__tests__/PricelistManagementPanel.publish.test.jsx
rollback_note: Revert all changed files. No migration, no schema change. Reverting restores the prior (silently-incorrect) publish behavior exactly -- Publish sends only the pricelist id, never the edited rows, so a never-Saved pricelist activates with zero persisted item prices.
preflight_result: no_breach
preflight_reason_code: APPROVED_LOCAL_HARDENING
preflight_run_at: 2026-08-20T00:00:00+08:00
preflight_request_ref: PR-752-PRICELIST-PUBLISH-PERSISTENCE
---

# Pricelist Publish Persistence

## Compliance Impact Classification

Major, per `apps/dgfy-web/src/features/pos/`'s floor (`scripts/check-compliance-impact.js:145-149`,
`surfaces: pos,terminal`). This closes a data-loss-shaped bug: Publish never sent the edited
in-memory rows to the server, so a merchant who typed voucher prices and pressed Publish without an
explicit Save first got a live pricelist with zero persisted item prices, silently falling back to
SRP on every row.

## Affected Surfaces

Four related fixes to `PricelistManagementPanel.jsx`, one domain (#748, plus #749/#735 in the same
PR):

- **Publish now persists before it activates.** The save logic previously only reachable via
  `handleSave` is extracted into `persistRows()`, called by both `handleSave` and `handlePublish`.
  Publish always writes current rows first (`replacePricelistItems`) and targets the id the server
  actually wrote to (`result.editing_pricelist_id`, which may be a draft-revision id distinct from
  the pricelist the editor was opened with) rather than the stale id a naive fix would have used.
- **Save and Publish are now cross-gated** (`saving || publishing`) — both funnel through the same
  write path, so an uncoordinated double-click could otherwise send two concurrent writes at the
  same optimistic-lock version.
- **A false-positive overcharge warning was corrected before it shipped** — SRP/cost are
  `DECIMAL(10,4)` but round-trip through centavos; the above-SRP/no-discount/below-cost/drift
  comparisons now compare in centavos (the unit the server stores) instead of pesos, so a rounding
  artifact (e.g. `19.997` stored/returned as `20.00`) can no longer fire a red "overcharge" warning
  on a row nobody touched.
- Publish now returns to the list on success (previously left the editor open) and, on a
  post-persist publish failure, tells the merchant their edits were saved even though publishing
  itself failed (previously an identical generic message for both cases).

## Compliance Preconditions

- **No schema change, no migration, no API contract change.** `replacePricelistItems` and
  `publishPricelist` are pre-existing endpoints (#696/#698); this PR only changes when/how the
  client calls them.
- **No new reason code.** The existing `PRICELIST_VERSION_CONFLICT` handling is reused unchanged and
  now also covers the newly-possible concurrent-write case.
- **No behavior change to the already-correct Save-then-Publish path** — a merchant who already
  clicked Save before Publish saw identical persisted data before and after this fix; only the
  no-Save-before-Publish path (previously silently wrong) changes.

## Verification Evidence

- `npm run build:pos` — real Vite build, succeeds.
- New regression test, `PricelistManagementPanel.publish.test.jsx` — asserts `replacePricelistItems`
  is called with the edited row data before `publishPricelist`, and that `publishPricelist` receives
  the server-returned `editing_pricelist_id`, not the original stale id. 1/1 passing.
- `npm run check:architecture` — OK, 49 modules / 491 files.
- `npm run check:adr` — OK, 74 ADRs.
- `GITHUB_BASE_REF=develop npm run check:compliance` — to be re-run after this declaration is added
  and pasted into the PR.

## Rollback Considerations

Revert all changed files (one component, one new test file, this declaration). No migration, no
schema change, no data written by this PR itself.
