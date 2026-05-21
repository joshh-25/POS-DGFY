# Data Backup and Disaster Recovery Plan

Last updated: 2026-04-08  
Owner: Platform Engineering

## 1. Objectives
1. Preserve tenant and landlord data integrity.
2. Recover service with bounded recovery objectives.
3. Maintain confidentiality for backups and export artifacts.

## 2. Recovery Targets
1. RPO (Recovery Point Objective): <= 24 hours for full backups, <= 1 hour for binlog/WAL replay where enabled.
2. RTO (Recovery Time Objective): <= 4 hours for priority restoration of production services.

## 3. Backup Cadence
1. Daily full logical backup for landlord and tenant databases.
2. Hourly incremental/binlog capture where infrastructure supports it.
3. Retention:
- Daily backups: 30 days
- Weekly backups: 12 weeks
- Monthly backups: 12 months

## 4. Encryption Controls
1. In transit:
- Backup transfer channels require TLS 1.2+.
2. At rest:
- Backups must be encrypted with AES-256 before offsite retention.
- Encryption keys are managed outside backup storage and rotated on policy schedule.

## 5. Restore Procedure
1. Identify target restore timestamp and affected tenant scopes.
2. Restore landlord metadata first, then tenant database snapshots.
3. Apply incremental logs to target point-in-time when available.
4. Validate:
- schema readiness checks
- tenant access checks
- POS transaction consistency checks

## 6. Drill and Verification Cadence
1. Monthly restore drill in non-production environment.
2. Quarterly simulated incident for cross-team runbook validation.
3. Every drill requires recorded:
- start/end timestamps
- success/failure points
- follow-up actions

## 7. Incident Escalation
1. Trigger conditions:
- backup job failures exceeding threshold
- checksum mismatch
- restore test failure
2. Escalation path:
- On-call engineer -> platform lead -> compliance lead
3. Severity assessment must be appended to compliance security incident audit workflow.

## 8. Evidence Outputs
1. Backup execution logs
2. Encryption verification evidence
3. Restore drill report with remediation actions
4. Linked references in `docs/compliance/evidence/open-controls-matrix.md` (Compliance Controls Evidence Matrix)

## 9. Sign-off Metadata
- Platform engineering approver: pending
- Compliance approver: pending
- Evidence report reference: `docs/compliance/evidence/drills/latest-restore-drill.json`
