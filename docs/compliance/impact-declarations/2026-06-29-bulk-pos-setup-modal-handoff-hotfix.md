---
status: reference
owner: engineering
last_reviewed: 2026-06-29
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-06-29-bulk-pos-setup-modal-handoff-hotfix
classification: major
surfaces: ims-items,pos-setup-modal,settings,storefront,pos-receipt-metadata
reason_codes_impacted: ALLOWED
policy_version: 2026.06.29
verification_evidence: npm --prefix frontend exec vitest run src/features/inventory/__tests__/itemProductWizard.contract.test.js --pool=threads,npm --prefix frontend run build,npm run check:architecture,npm run check:compliance,npm run lint:docs,git diff --check
rollback_note: Revert the Items page bulk POS setup handoff helpers and the matching item/product wizard contract test; no POS readiness rules, receipt rendering, checkout, payment, terminal session, database, or API behavior is changed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-29T16:25:00+08:00
preflight_request_ref: BULK-POS-SETUP-MODAL-HANDOFF-HOTFIX-2026-06-29
---

# Bulk POS Setup Modal Handoff Hotfix

## Compliance Impact Classification

Major. This hotfix changes only IMS Items UI modal sequencing for the POS setup workflow. It closes the active item/product create-edit wizard before opening the bulk POS setup checklist so the checklist is not hidden behind the wizard dialog.

## Affected Surfaces

1. IMS Items item create/edit wizard.
2. IMS Items product create/edit wizard.
3. Bulk POS setup checklist modal launch path.

## Compliance Preconditions

1. Opening Bulk POS Setup from an item/product wizard must close the source wizard first.
2. Existing item/product context must still guide the POS checklist to the selected item when available.
3. Unsaved create flows must still open the general bulk POS setup checklist without inventing an item identity.
4. POS readiness requirements, visibility toggles, image upload behavior, terminal session behavior, checkout, payment, and receipt/fiscal output remain unchanged.

## Verification Evidence

The commands listed in front matter must pass before deployment. Production verification should confirm that clicking "Open Bulk POS Setup" from an item/product wizard shows the bulk POS setup checklist in front with no active item/product wizard dialog overlaying it.
