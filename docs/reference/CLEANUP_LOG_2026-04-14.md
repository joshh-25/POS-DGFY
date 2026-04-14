---
status: reference
authority_level: reference
owner: architecture
last_reviewed: 2026-04-14
applies_to: workspace_cleanup
topic: docs_and_root_artifact_cleanup
---

# Cleanup Log - 2026-04-14

## Summary
Documentation and QA references were updated for the current PO/JO quantity UX contracts (shared stepper, abbreviation-only UOM display, and numeric step policy).  
Outdated root-level planning/compliance duplicates were removed after confirming canonical replacements under `docs/`.

## Documentation Updates
1. Updated `docs/README.md` current-behavior notes with:
   - shared PO/JO stepper contract
   - POS step-by-1 keyboard behavior
   - precision-step exception policy for scientific sliders
2. Updated `docs/features/IMS_POS_SALES_UX_JOURNEY.md` with explicit PO/JO quantity UX contract.
3. Updated `docs/testing/README.md` with focused regression test commands:
   - `NumberStepper.behavior.test.jsx`
   - `poJoQuantityUx.contract.test.js`
   - `numericStepperPolicy.contract.test.js`
4. Updated `docs/testing/manual-qa-readiness-runbook-pos-ims-store.md` to include PO/JO quantity checks and POS keyboard step checks.
5. Updated `docs/reference/README.md` to include this cleanup log.

## Workspace Cleanup Performed
Removed outdated root-level files that were either duplicate or superseded by canonical docs:
1. `POS Software Developer Compliance Guide for the Philippines (1).md`
   - canonical replacement: `docs/compliance/ph-pos-software-developer-compliance-guide.md`
2. `SKUpervisor Digital POS MVP Implementation Plan (Hardened).md`
   - archived replacement: `docs/archive/reference/2026-04/SKUpervisor_Digital_POS_MVP_Implementation_Plan_Hardened_2026-03-25.md`
3. `SKUpervisor_Subscription_Implementation_Plan.md`
   - archived replacement: `docs/archive/reference/2026-04/SKUpervisor_Subscription_Implementation_Plan_2026-03-09.md`
4. `skupervisor_expansion_plan.md`
   - archived replacement: `docs/archive/reference/2026-04/SKUpervisor_Ecommerce_POS_Expansion_Plan_2026-03-30.md`

Conservative generated/transient cleanup:
1. Removed generated build output folder:
   - `dist-apps/`
2. Removed stale root log artifacts:
   - `logs/combined.log`
   - `logs/combined1.log`
   - `logs/error.log`

Safety exclusions (intentionally preserved):
1. `.worktree-hotfix-403/` because it is an active git worktree.
2. `pixel-agents/` because it appears to be a separate local tool workspace and not a generated artifact.

## Validation
1. `npm run lint:docs`
