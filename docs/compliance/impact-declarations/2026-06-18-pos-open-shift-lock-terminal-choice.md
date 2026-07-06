---
status: reference
owner: pos
last_reviewed: 2026-06-18
declaration_id: 2026-06-18-pos-open-shift-lock-terminal-choice
classification: regulatory
surfaces: pos,terminal,settings,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.06.18
verification_evidence: npm run lint:docs,npm run check:architecture,npm run check:compliance,npm --prefix frontend test -- --run src/features/pos/__tests__/terminalViewModeContracts.test.js,npm --prefix frontend run build:pos,npm --prefix frontend run build:skupervisor,npm run smoke:pos-terminal-ui,git diff --check
rollback_note: Remove the Open Shift modal Lock Terminal action and this declaration together if the post-close-shift cashier choice causes terminal-session regressions.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-18T19:15:00+08:00
preflight_request_ref: POS-OPEN-SHIFT-LOCK-TERMINAL-CHOICE-2026-06-18
---

# POS Open Shift Lock Terminal Choice

## Compliance Impact Classification

Major.

This declaration covers a POS terminal UX control that lets a cashier lock the terminal from the forced Open Shift modal after a shift is closed. The existing Open Shift action remains unchanged; the new secondary action uses the same governed terminal lock path as manual terminal locking.

## Affected Surfaces

1. The Open Shift modal now gives the cashier two explicit choices after a closed shift:
   - `Open Shift` to continue cashier operations.
   - `Lock Terminal` to end the active terminal session and require unlock before further POS use.
2. Locking from the modal persists the terminal lock and clears the browser session through the existing terminal lock handler.
3. Sales, payments, receipt printing, and transaction changes remain blocked while no shift is open.
4. The lock action is disabled while an open-shift submission is already in progress.

## Compliance Preconditions

1. Open-shift actions remain permission-gated and require selected terminal identity after unlock.
2. The `Lock Terminal` action must not submit the opening cash form.
3. The existing terminal unlock drawer remains the only way to resume POS use after locking.
4. Backend shift, compliance, and terminal registry policies remain unchanged.

## Verification Evidence

Required validation:

1. `npm --prefix frontend test -- --run src/features/pos/__tests__/terminalViewModeContracts.test.js`
2. `npm --prefix frontend run build:pos`
3. `npm --prefix frontend run build:skupervisor`
4. `npm run smoke:pos-terminal-ui`
5. `npm run lint:docs`
6. `npm run check:architecture`
7. `npm run check:compliance`
8. `git diff --check`

## Deployment And Rollback

Deploy this declaration with the frontend POS modal change and focused contract test. Rollback is frontend-only: remove the `Lock Terminal` modal action and revert this declaration/test update together.
