# Compliance Filing Instructions

Last updated: 2026-04-08

## 1. Generate Runtime Evidence
1. Execute compliance package endpoint:
- `GET /api/v1/reports/compliance-package`
2. Generate export bundle:
- `GET /api/v1/reports/compliance-package/export`
3. Confirm `submission_manifest.checksums` are present.

## 2. Prepare Documentary Packet
1. Include:
- `system-flow-diagram.mmd`
- `software-specification-dgfy.md`
- `backup-disaster-recovery-plan.md`
- generated compliance package export payload
2. Attach control mapping:
- `docs/compliance/control-matrix.md`
- `docs/compliance/evidence/open-controls-matrix.md` (Compliance Controls Evidence Matrix)

## 3. Verification Steps Before Sign-Off
1. Run architecture and compliance gates:
- `npm run check:architecture`
- `npm run check:compliance`
- `npm run lint:docs`
2. Run backend/frontend tests for changed compliance behavior.
3. Validate checklist status updates in `docs/compliance/DGFY Compliance Certification Checklist.md`.

## 4. Sign-Off Checklist
1. Engineering lead sign-off for runtime behavior.
2. Compliance lead sign-off for documentary completeness.
3. Archive final packet with immutable checksum references.

## 5. Sign-off metadata
- Engineering approver: pending
- Compliance approver: pending
- Final filing batch ID: pending
