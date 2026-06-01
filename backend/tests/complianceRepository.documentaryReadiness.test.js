import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { complianceRepository } from '../src/modules/compliance/repositories/complianceRepository.js';

const writeFile = (filePath, content) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
};

const writeJson = (filePath, payload) => {
    writeFile(filePath, JSON.stringify(payload, null, 2));
};

const writeRmoDocs = ({ submissionRoot, evidenceRoot, nowIso }) => {
    writeFile(
        path.join(submissionRoot, 'rmo-24-2023-control-matrix.md'),
        '# RMO 24-2023 Control Matrix\n## Requirement Map\n## Evidence Owners\n'
    );
    writeFile(
        path.join(submissionRoot, 'rmo-24-2023-filing-authority-decision.md'),
        '# RMO Filing Authority Decision\n## Provider Responsibility\n## Tenant Responsibility\n'
    );
    writeFile(
        path.join(submissionRoot, 'rmo-24-2023-receipt-sample-pack.md'),
        '# RMO Receipt Sample Pack\n## Fiscal Invoice Sample\n## Non-Fiscal Slip Sample\n'
    );
    writeJson(path.join(evidenceRoot, 'latest-rmo-fiscal-integrity.json'), {
        verification_id: 'rmo-integrity-001',
        verified_at: nowIso,
        result: 'passed'
    });
    writeJson(path.join(evidenceRoot, 'latest-rmo-esales-rehearsal.json'), {
        rehearsal_id: 'rmo-esales-001',
        verified_at: nowIso,
        result: 'passed'
    });
};

describe('complianceRepository documentary and encryption readiness', () => {
    const previousEnv = { ...process.env };
    let tempRoot;

    beforeEach(() => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'compliance-ready-'));
    });

    afterEach(() => {
        process.env = { ...previousEnv };
        if (tempRoot && fs.existsSync(tempRoot)) {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    });

    it('DOC-03 marks documentary readiness ready when all artifacts pass quality and freshness checks', async () => {
        const submissionRoot = path.join(tempRoot, 'submission');
        const evidenceRoot = path.join(tempRoot, 'evidence', 'drills');
        const nowIso = new Date().toISOString();

        writeFile(path.join(submissionRoot, 'system-flow-diagram.mmd'), 'flowchart LR\n  A["Start"] --> B["End"]\n');
        writeFile(path.join(submissionRoot, 'system-flow-diagram.png'), 'png-placeholder');
        writeFile(
            path.join(submissionRoot, 'software-specification-dgfy.md'),
            '# DGFY Software Specification Packet\n## 1. Product Scope\n## 6. Filing Evidence References\n## 7. Sign-off Metadata\n- Engineering lead: qa\n- Compliance lead: qa\n'
        );
        writeFile(
            path.join(submissionRoot, 'backup-disaster-recovery-plan.md'),
            '## 2. Recovery Targets\n## 4. Encryption Controls\n## 6. Drill and Verification Cadence\n## 9. Sign-off Metadata\n- Platform engineering approver: qa\n- Compliance approver: qa\n'
        );
        writeFile(
            path.join(submissionRoot, 'filing-instructions.md'),
            '# Filing Instructions\n## Submission package contents\n## Sign-off checklist\n## 5. Sign-off metadata\n- Engineering approver: qa\n- Compliance approver: qa\n'
        );

        writeJson(path.join(evidenceRoot, 'latest-restore-drill.json'), {
            drill_id: 'restore-001',
            executed_at: nowIso,
            result: 'passed'
        });
        writeJson(path.join(evidenceRoot, 'latest-encryption-verification.json'), {
            verification_id: 'enc-001',
            verified_at: nowIso,
            transport: { tls_min_version: '1.2' },
            at_rest: { algorithm: 'AES-256' }
        });
        writeRmoDocs({ submissionRoot, evidenceRoot, nowIso });

        process.env.COMPLIANCE_SUBMISSION_DOCS_ROOT = submissionRoot;
        process.env.COMPLIANCE_EVIDENCE_DOCS_ROOT = evidenceRoot;
        process.env.COMPLIANCE_EVIDENCE_MAX_AGE_DAYS = '45';

        const readiness = await complianceRepository.getSubmissionArtifactReadiness();

        expect(readiness.ready).toBe(true);
        expect(readiness.complete).toBe(readiness.total);
        expect(readiness.items.every((item) => item.ready === true)).toBe(true);
    });

    it('DOC-03 marks documentary readiness blocked when drill evidence is stale', async () => {
        const submissionRoot = path.join(tempRoot, 'submission');
        const evidenceRoot = path.join(tempRoot, 'evidence', 'drills');
        const staleIso = new Date(Date.now() - (120 * 24 * 60 * 60 * 1000)).toISOString();

        writeFile(path.join(submissionRoot, 'system-flow-diagram.mmd'), 'flowchart LR\n  A["Start"] --> B["End"]\n');
        writeFile(path.join(submissionRoot, 'system-flow-diagram.png'), 'png-placeholder');
        writeFile(
            path.join(submissionRoot, 'software-specification-dgfy.md'),
            '# DGFY Software Specification Packet\n## 1. Product Scope\n## 6. Filing Evidence References\n## 7. Sign-off Metadata\n- Engineering lead: qa\n- Compliance lead: qa\n'
        );
        writeFile(
            path.join(submissionRoot, 'backup-disaster-recovery-plan.md'),
            '## 2. Recovery Targets\n## 4. Encryption Controls\n## 6. Drill and Verification Cadence\n## 9. Sign-off Metadata\n- Platform engineering approver: qa\n- Compliance approver: qa\n'
        );
        writeFile(
            path.join(submissionRoot, 'filing-instructions.md'),
            '# Filing Instructions\n## Submission package contents\n## Sign-off checklist\n## 5. Sign-off metadata\n- Engineering approver: qa\n- Compliance approver: qa\n'
        );

        writeJson(path.join(evidenceRoot, 'latest-restore-drill.json'), {
            drill_id: 'restore-002',
            executed_at: staleIso,
            result: 'passed'
        });
        writeJson(path.join(evidenceRoot, 'latest-encryption-verification.json'), {
            verification_id: 'enc-002',
            verified_at: staleIso,
            transport: { tls_min_version: '1.2' },
            at_rest: { algorithm: 'AES-256' }
        });
        writeRmoDocs({ submissionRoot, evidenceRoot, nowIso: staleIso });

        process.env.COMPLIANCE_SUBMISSION_DOCS_ROOT = submissionRoot;
        process.env.COMPLIANCE_EVIDENCE_DOCS_ROOT = evidenceRoot;
        process.env.COMPLIANCE_EVIDENCE_MAX_AGE_DAYS = '30';

        const readiness = await complianceRepository.getSubmissionArtifactReadiness();
        const staleItems = readiness.items.filter((entry) => entry.quality_issues.some((issue) => issue.startsWith('stale:')));

        expect(readiness.ready).toBe(false);
        expect(staleItems.length).toBeGreaterThan(0);
        expect(readiness.missing).toBeGreaterThan(0);
    });

    it('DOC-03 requires sign-off metadata tokens in submission docs', async () => {
        const submissionRoot = path.join(tempRoot, 'submission');
        const evidenceRoot = path.join(tempRoot, 'evidence', 'drills');
        const nowIso = new Date().toISOString();

        writeFile(path.join(submissionRoot, 'system-flow-diagram.mmd'), 'flowchart LR\n  A["Start"] --> B["End"]\n');
        writeFile(path.join(submissionRoot, 'system-flow-diagram.png'), 'png-placeholder');
        writeFile(
            path.join(submissionRoot, 'software-specification-dgfy.md'),
            '# DGFY Software Specification Packet\n## 1. Product Scope\n## 6. Filing Evidence References\n'
        );
        writeFile(
            path.join(submissionRoot, 'backup-disaster-recovery-plan.md'),
            '## 2. Recovery Targets\n## 4. Encryption Controls\n## 6. Drill and Verification Cadence\n'
        );
        writeFile(
            path.join(submissionRoot, 'filing-instructions.md'),
            '# Filing Instructions\n## Submission package contents\n## Sign-off checklist\n'
        );

        writeJson(path.join(evidenceRoot, 'latest-restore-drill.json'), {
            drill_id: 'restore-003',
            executed_at: nowIso,
            result: 'passed'
        });
        writeJson(path.join(evidenceRoot, 'latest-encryption-verification.json'), {
            verification_id: 'enc-003',
            verified_at: nowIso,
            transport: { tls_min_version: '1.2' },
            at_rest: { algorithm: 'AES-256' }
        });
        writeRmoDocs({ submissionRoot, evidenceRoot, nowIso });

        process.env.COMPLIANCE_SUBMISSION_DOCS_ROOT = submissionRoot;
        process.env.COMPLIANCE_EVIDENCE_DOCS_ROOT = evidenceRoot;
        process.env.COMPLIANCE_EVIDENCE_MAX_AGE_DAYS = '45';

        const readiness = await complianceRepository.getSubmissionArtifactReadiness();
        const signoffIssues = readiness.items
            .flatMap((entry) => entry.quality_issues || [])
            .filter((issue) => issue.includes('Sign-off') || issue.includes('approver'));

        expect(readiness.ready).toBe(false);
        expect(signoffIssues.length).toBeGreaterThan(0);
    });

    it('ENC-01 reports encryption prerequisite issues when environment policy is weakened', async () => {
        process.env.BACKUP_ENCRYPTION_ALGORITHM = 'AES-128';
        process.env.BACKUP_TRANSPORT_TLS_MIN_VERSION = '1.0';
        process.env.EXPORT_ENCRYPTION_REQUIRED = 'false';
        process.env.BACKUP_KEY_MANAGEMENT_EXTERNALIZED = 'false';
        process.env.NODE_ENV = 'production';
        process.env.ENFORCE_HTTPS = 'false';

        const encryptionState = await complianceRepository.getEncryptionPolicyPrerequisitesState();

        expect(encryptionState.ready).toBe(false);
        expect(encryptionState.issues).toEqual(expect.arrayContaining([
            expect.stringContaining('AES-256'),
            expect.stringContaining('>= 1.2'),
            expect.stringContaining('must not be disabled'),
            expect.stringContaining('must be true'),
            expect.stringContaining('must be true in production')
        ]));
    });
});
