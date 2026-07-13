---
created: 2026-07-13T01:30:58.619Z
title: Wrap compliance verification and state writes in one transaction
area: database
files:
  - apps/dgfy-api/src/modules/compliance/usecases/complianceUseCases.js:307-320
  - apps/dgfy-api/src/modules/compliance/repositories/complianceModeStateRepository.js
---

## Problem

`complianceUseCases.js:307-320` calls `complianceModeStateRepository`'s `recordVerification` and `upsertState` as two independent, non-transactional writes. A crash or race between the two calls can leave a compliance review recorded (e.g. `rejected`) without `compliance_mode_state.state` actually demoted to `non_compliant_active`, or vice versa. Narrow window (not deterministic — needs interruption exactly between the two writes), but real: a tenant that should be fiscal-blocked could briefly still look compliant.

Confirmed by Phase 8's fourth verification pass (08-VERIFICATION.md, fresh review's CR-03) and accepted as non-blocking for Phase 8 UAT sign-off on 2026-07-13 — but explicitly NOT closed by any currently-planned future phase's own work, since no roadmap phase touches this file. Required before the milestone ships.

## Solution

Add a single `recordVerificationAndState()` repository method that wraps both writes in one `sequelize.transaction()` with a row lock, mirroring the pattern already used in `apps/dgfy-api/src/modules/shifts/repositories/shiftRepository.js` (used for the CR-02/CR-03 shift and booking lock-race fixes in 08-12).
