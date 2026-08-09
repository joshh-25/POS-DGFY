---
status: reference
owner: engineering
last_reviewed: 2026-08-09
declaration_id: 2026-08-09-store-template-curation-hardening
classification: regulatory
surfaces: settings,pos,terminal,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.08.09
verification_evidence: storeConfigurationTemplateUseCases.test.js,adminTemplates.transport.test.js,storeConfigurationTemplateHandlers.test.js,TenantManager.applyTemplatePicker.integration.test.jsx,StoreTemplateManager.presetGuards.integration.test.jsx,StoreTemplateManager.curationUx.integration.test.jsx,capabilityModules.contract.test.js,workflowModes.crossLayer.contract.test.js,workflowMode.services.test.js,check:architecture
rollback_note: Revert the deprecate guard in buildDeprecateTemplateUseCase, the is_preset removal from buildCreateDraftTemplateUseCase/the create handler, the StoreTemplateManager.jsx UI changes, the TenantManager.jsx response-shape and label fixes, the WORKFLOW_MODE_ENGINE classification and TEMPLATE_AUTHORABLE_MODES narrowing, and the module description/surface/group curation metadata together with this declaration -- verified and reviewed as one batch. Each falls back to its pre-change behavior (any template, including presets, becomes deprecatable again; is_preset becomes client-settable again on create; the apply-template picker goes dark again; create-draft accepts every WORKFLOW_MODE_VALUES entry again, including the manufacturing alias) -- no data migration, no schema change, nothing to unwind.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-09T00:00:00+08:00
preflight_request_ref: STORE-TEMPLATES-CURATION-HARDENING-20260809
---

# Store Template Curation Hardening (issue #178 final-touch, Phases 24-29)

## Compliance Impact Classification

Regulatory, per the classification matrix's floor for `TenantManager.jsx`
(`frontend/Pages/admin/TenantManager.jsx`), which carries an explicit
`regulatory` rule with the `settings,compliance` surfaces
(`scripts/check-compliance-impact.js`) regardless of which part of the file
changes. This declaration now covers two rounds of work against the same
admin curation surface, both re-touching `TenantManager.jsx`:

- **Phase 24** (original scope, retained below): the deprecate guard,
  `is_preset` server-ownership, the preset/canonical UI badges, and the
  apply-template picker's response-shape fix.
- **Phases 28-29** (this amendment): a native/transitional/external engine
  classification for workflow modes
  (`packages/shared-constants/src/workflowModes.js`), a narrower
  `TEMPLATE_AUTHORABLE_MODES` allowlist enforced on create-draft
  (`backend/src/validators/adminTemplateValidator.js`), module
  description/surface/group curation metadata
  (`packages/shared-constants/src/capabilityModules.js`), the
  `StoreTemplateManager.jsx` form/grid overhaul, and one further
  `TenantManager.jsx` line (the apply-template picker now shows the base
  mode's human label instead of its raw key).

None of `adminTemplateValidator.js`, `capabilityModules.js`,
`workflowModes.js`, or `StoreTemplateManager.jsx` match a sensitive-file
rule on their own, so `TenantManager.jsx` alone continues to set this
declaration's floor. No fiscal, VAT, payment, or tenant-runtime-config logic
is touched in either round; this remains entirely an admin-curation-surface
pass — Store Profile output, registration, and provisioning are unaffected
(verified via the unmodified `storeProfile.equivalence.contract` golden
snapshots after Phases 28-29, same as after Phase 24).

`check-compliance-impact.js` validates every declaration file present in a
PR's diff against the *union* of surfaces across the *entire* diff, not just
the files that declaration's own section describes (there is no per-PR
partial-coverage split across multiple declarations). Because this
declaration lands in the same PR as the companion correction to
`2026-08-09-store-template-writepath-hardening.md` (Phases 20-23's `pos`/
`terminal` surface), its `surfaces` field must also cover `pos,terminal`
even though this phase's own changes touch neither — hence
`settings,pos,terminal,compliance` rather than just `settings,compliance`.

## Affected Surfaces

1. `buildDeprecateTemplateUseCase` (`storeConfigurationTemplateUseCases.js`)
   now rejects deprecating a template with `is_preset: true` or
   `is_canonical: true` (409 `CONFLICT`) — previously any template,
   including platform-seeded presets and canonical defaults, could be
   deprecated with no guard, permanently breaking
   `findPublishedCanonicalForMode()` for that base mode (the seed migration
   is idempotent-by-key and never repairs a deprecated row).
2. `buildCreateDraftTemplateUseCase` no longer accepts or forwards
   `isPreset`/`isCanonical` — both are platform-owned provenance flags, set
   only by the seed use case (`seedCanonicalTemplatePresets.js`), which
   calls the repository directly and bypasses this use case entirely. The
   handler (`storeConfigurationTemplateHandlers.js`) no longer reads
   `is_preset` off `req.validatedData`. The Joi validator still *accepts*
   `is_preset` in the request body (so a stale client isn't 422'd — the
   schema's `.unknown(false)` would otherwise reject the field outright
   rather than silently stripping it) but the value is never read past
   validation.
3. `StoreTemplateManager.jsx` (platform-admin curation UI): removed the
   create-form checkbox that was labeled "Canonical preset" but bound to
   `is_preset` (a claim the server never honored even before this change,
   since `is_canonical` was never client-settable); the Deprecate button is
   now hidden for preset/canonical rows, replaced with a "Platform preset"
   label; the "Preset" column is now a provenance badge distinguishing
   `Canonical` from `Preset` from admin-authored (previously only a
   Yes/No `is_preset` column, `is_canonical` was not surfaced at all).
4. `TenantManager.jsx`: fixed a response-shape bug where the apply-template
   picker read `response.data` instead of `response.data?.templates` from
   `listStoreTemplates()` (which returns `{ success, data: { templates } }`)
   — `templates.length > 0` was always `undefined > 0` (false), so the
   Phase 17 apply-template picker never rendered for any tenant. One-line
   fix; no change to what the picker does once populated.
5. **(Phase 28)** `workflowModes.js` gains `WORKFLOW_MODE_ENGINE` (a
   native/transitional/external classification per mode),
   `WORKFLOW_MODE_ENGINE_NOTES` (planned external-engine names for
   transitional modes), and `TEMPLATE_AUTHORABLE_MODES` (the de-aliased,
   non-external subset). `adminTemplateValidator.js`'s create-draft
   `base_mode` now validates against `TEMPLATE_AUTHORABLE_MODES` instead of
   the full `WORKFLOW_MODE_VALUES` — the four external-engine modes
   (healthcare, ticketing_transport, logistics_distribution,
   education_institutions) and the deprecated `manufacturing` alias are now
   rejected with a 422 on this endpoint. The list-query filter is
   unchanged. This is a deliberate narrowing of what an admin can author a
   *new* template against; no existing template of any mode becomes
   unlistable, unviewable, or unappliable.
6. **(Phase 29)** `capabilityModules.js` gains `description`, `surface`
   (pos/storefront/back_office), and `group` metadata on every shipped,
   non-locked module, plus `MODE_FAMILY_MODULE_GROUPS` (which module groups
   the curation grid shows by default per base-mode family). Purely
   additive constants — `validateModuleSelection`, the seed migration, and
   `STORE_TEMPLATE_PRESETS`/`STORE_TEMPLATE_PRESETLESS_MODES` are
   unaffected. `StoreTemplateManager.jsx`'s create/edit forms now show
   labeled fields, a de-aliased base-mode dropdown with engine-classification
   notes, and a grouped/filtered/described module grid instead of 21
   alphabetical unlabeled checkboxes; template rows and the detail header
   show an engine-classification badge. `TenantManager.jsx`'s apply-template
   picker now shows the base mode's human label (e.g. "Retail") instead of
   its raw key (e.g. "retail").

## Compliance Preconditions

1. No fiscal, VAT, payment, or receipt logic is touched — this phase is
   entirely within the platform-admin Store Template curation surface
   (issue #178 Phase 14/17) and its master-admin-only routes
   (`middleware/auth.js`'s `masterOnly` check on `/api/v1/admin/templates`
   is unchanged).
2. The fail-closed guarantee is unaffected: the new deprecate rejection
   returns a 409 through the same `DomainError` contract every other
   template-lifecycle guard in this file already uses; no new "allow on
   error" branch is introduced.
3. The `is_preset` validator change is strictly permissive-then-inert, not
   a new rejection: requests that previously succeeded still succeed
   (`stripUnknown`/`.unknown(false)` semantics mean the field was already
   being silently accepted by Joi before this change too, since it was a
   declared schema key) — only what happens to the value *after*
   validation changes (it is now ignored instead of forwarded).
4. Presets/canonical templates being newly protected from deprecation is a
   narrowing of admin capability, not a widening — no previously-permitted,
   non-preset action becomes newly rejected.
5. `fiscalProfile` and `customerAccessMode` (the catalog's two `locked`
   modules) remain unreachable by any curation-surface action — unaffected
   by this phase, same as every prior phase in this arc.
6. **(Phase 28)** The `TEMPLATE_AUTHORABLE_MODES` narrowing on create-draft
   is a request-validation change only — no existing `store_configuration_templates`
   row changes status, provenance, or module list. Registration (`isWorkflowMode`,
   `WORKFLOW_MODE_SELECT_VALUES`) and provisioning
   (`findPublishedCanonicalForMode`) do not read `TEMPLATE_AUTHORABLE_MODES`
   and are untouched — a tenant can still register into and be provisioned
   for any of the ten registration-offered modes exactly as before.
7. **(Phase 29)** The module description/surface/group metadata and
   `MODE_FAMILY_MODULE_GROUPS` are read only by the admin curation UI's
   presentation layer — never by `validateModuleSelection`, the seed
   migration, or any runtime capability-resolution path. Confirmed by the
   full `storeProfile.equivalence.contract.test.js` snapshot suite staying
   green, byte-identical, after both phases.

## Verification Evidence

1. `backend/tests/storeConfigurationTemplateUseCases.test.js` — the
   "preset/canonical protection" suite: deprecating an `is_preset` or
   `is_canonical` row is rejected with no `setStatus`/audit-log call; a
   plain admin-authored template still deprecates normally; the create use
   case never forwards `isPreset`/`isCanonical` even when a caller passes
   them.
2. `backend/tests/adminTemplates.transport.test.js` — a create-draft
   request carrying `is_preset: true` is still accepted (201), proving the
   validator change doesn't 422 an old client.
3. `backend/tests/storeConfigurationTemplateHandlers.test.js` (new) — the
   handler layer: a `req.validatedData` containing `is_preset`/`is_canonical`
   never reaches the use case call.
4. `frontend/src/pages/__tests__/TenantManager.applyTemplatePicker.integration.test.jsx`
   (new) — the picker renders from the real `{ data: { templates } }`
   response shape; this test fails against the pre-fix code (proven during
   development) and passes after the one-line fix.
5. `frontend/src/pages/__tests__/StoreTemplateManager.presetGuards.integration.test.jsx`
   (new) — the create form no longer offers the preset checkbox; Deprecate
   is hidden for preset/canonical rows and shown for an admin-authored row;
   Canonical/Preset provenance is surfaced distinctly per row.
6. `npm run check:architecture` passed.
7. `npm run check:compliance` passed, simulated against the full PR #311
   diff (`COMPLIANCE_CHANGED_FILES` set to `git diff --name-only
   origin/develop...HEAD`), together with the companion correction to
   `2026-08-09-store-template-writepath-hardening.md`.
8. **(Phase 28)** `backend/tests/capabilityModules.contract.test.js`'s
   "engine classification contracts" suite — every mode has an engine
   entry, the alias mirrors its target, the current native/transitional/
   external membership is pinned, every external mode is a subset of
   `STORE_TEMPLATE_PRESETLESS_MODES`, every transitional mode has a planned-
   engine note, and `TEMPLATE_AUTHORABLE_MODES` matches the expected
   offered-minus-external set. `backend/tests/adminTemplates.transport.test.js`
   — create-draft rejects `healthcare` and `manufacturing` base_mode values
   (422) and accepts `hospitality` (201); the list filter still accepts
   `healthcare`. `backend/tests/workflowModes.crossLayer.contract.test.js` —
   the engine map and authorable-modes list are identical across the
   frontend and backend re-exports.
9. **(Phase 29)** `capabilityModules.contract.test.js`'s "module curation
   metadata contracts" suite — every selectable module has a non-empty
   description and a valid surface/group; every `MODE_FAMILY_MODULE_GROUPS`
   entry references only valid groups and includes `universal`; every
   de-aliased offered mode has an entry.
   `frontend/src/pages/__tests__/StoreTemplateManager.curationUx.integration.test.jsx`
   (new) — labeled form fields; the module grid filters to the default base
   mode's relevant groups and hides unrelated ones (e.g. no "Housekeeping
   Board" under retail) until "show all" is used; the storefront module's
   plain-language description renders; surface tags render; a transitional
   template row shows the engine badge and a native one doesn't; the
   base-mode dropdown offers exactly one Food Manufacturing option and no
   external-engine modes. All seven assertions were proven against the
   pre-overhaul component (git-show reverted, confirmed failing, restored)
   before being accepted as genuine regression pins.
   `frontend/src/features/settings/__tests__/workflowMode.services.test.js`
   — `TEMPLATE_AUTHORABLE_MODES` excludes the alias and all four
   external-engine modes while keeping both transitional modes authorable.
10. `storeProfile.equivalence.contract.test.js` — all 11 golden per-mode
    snapshots re-verified byte-identical after Phases 28-29, confirming the
    engine classification and module curation metadata introduced zero
    runtime/profile behavior change.
