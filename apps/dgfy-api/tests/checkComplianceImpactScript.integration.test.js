import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..', '..', '..');
const declarationsDir = path.join(repoRoot, 'docs', 'compliance', 'impact-declarations');

const buildDeclaration = ({
    declarationId,
    classification = 'major',
    surfaces = 'settings',
    includePreflight = true
}) => `---
status: reference
owner: engineering
last_reviewed: 2026-04-07
declaration_id: ${declarationId}
classification: ${classification}
surfaces: ${surfaces}
reason_codes_impacted: IMPACT_DECLARATION_REQUIRED
policy_version: 2026.04.07
verification_evidence: npm run check:compliance
rollback_note: Revert test-only compliance declaration changes.
${includePreflight ? `preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-04-07T08:00:00+08:00
preflight_request_ref: TEST-123` : ''}
---

# Test Declaration

## Compliance Impact Classification
${classification}

## Affected Surfaces
- ${surfaces}

## Compliance Preconditions
1. Test declaration for script integration.

## Verification Evidence
- npm run check:compliance
`;

const runCheck = ({ changedFiles = [], stagedFiles = [], args = [] } = {}) => {
    return spawnSync(
        process.execPath,
        ['scripts/check-compliance-impact.js', ...args],
        {
            cwd: repoRoot,
            env: {
                ...process.env,
                COMPLIANCE_CHANGED_FILES: changedFiles.join('\n'),
                COMPLIANCE_STAGED_FILES: stagedFiles.join('\n')
            },
            encoding: 'utf8'
        }
    );
};

const writeTempDeclaration = (content) => {
    const fileName = `.tmp-check-compliance-${Date.now()}-${Math.random().toString(16).slice(2)}.md`;
    const absolutePath = path.join(declarationsDir, fileName);
    fs.writeFileSync(absolutePath, content, 'utf8');
    return {
        absolutePath,
        relativePath: path.posix.join('docs/compliance/impact-declarations', fileName)
    };
};

const cleanupTempDeclaration = (absolutePath) => {
    if (absolutePath && fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
    }
};

describe('check-compliance-impact script integration', () => {
    it('fails when backend settings route changes without declaration', () => {
        const result = runCheck({
            changedFiles: ['apps/dgfy-api/src/routes/settings.js']
        });

        const output = `${result.stdout}${result.stderr}`;
        expect(result.status).toBe(1);
        expect(output).toContain('Compliance-sensitive files changed without a declaration file');
        expect(output).toContain('apps/dgfy-api/src/routes/settings.js');
    });

    it('fails when declaration classification is below computed minimum', () => {
        const declaration = writeTempDeclaration(buildDeclaration({
            declarationId: '2026-04-07-test-classification-floor',
            classification: 'major',
            surfaces: 'compliance'
        }));

        try {
            const result = runCheck({
                changedFiles: [
                    'apps/dgfy-web/src/features/compliance/components/ComplianceProgramPanel.jsx',
                    declaration.relativePath
                ]
            });

            const output = `${result.stdout}${result.stderr}`;
            expect(result.status).toBe(1);
            expect(output).toContain('below computed minimum "regulatory"');
        } finally {
            cleanupTempDeclaration(declaration.absolutePath);
        }
    });

    it('fails major declaration when required preflight metadata is missing', () => {
        const declaration = writeTempDeclaration(buildDeclaration({
            declarationId: '2026-04-07-test-missing-preflight',
            classification: 'major',
            surfaces: 'settings',
            includePreflight: false
        }));

        try {
            const result = runCheck({
                changedFiles: [
                    'apps/dgfy-api/src/routes/settings.js',
                    declaration.relativePath
                ]
            });

            const output = `${result.stdout}${result.stderr}`;
            expect(result.status).toBe(1);
            expect(output).toContain('Missing required major preflight front matter key "preflight_result"');
            expect(output).toContain('Missing required major preflight front matter key "preflight_request_ref"');
        } finally {
            cleanupTempDeclaration(declaration.absolutePath);
        }
    });

    it('passes when changed files are non-sensitive', () => {
        const result = runCheck({
            changedFiles: ['apps/dgfy-web/src/utils/non-sensitive-file.js']
        });

        const output = `${result.stdout}${result.stderr}`;
        expect(result.status).toBe(0);
        expect(output).toContain('No compliance-sensitive changes detected');
    });

    // #707: modules/commercePayments/ (QRPh money-capture) and its route file were absent from
    // COMPLIANCE_SENSITIVE_RULES despite modules/payments/ and modules/store/ both being covered.
    it('fails when commercePayments module changes without declaration', () => {
        const result = runCheck({
            changedFiles: ['apps/dgfy-api/src/modules/commercePayments/usecases/finalizePaidCommerceSession.js']
        });

        const output = `${result.stdout}${result.stderr}`;
        expect(result.status).toBe(1);
        expect(output).toContain('Compliance-sensitive files changed without a declaration file');
        expect(output).toContain('apps/dgfy-api/src/modules/commercePayments/usecases/finalizePaidCommerceSession.js');
    });

    it('fails when the commercePayments route file changes without declaration', () => {
        const result = runCheck({
            changedFiles: ['apps/dgfy-api/src/routes/commercePayments.js']
        });

        const output = `${result.stdout}${result.stderr}`;
        expect(result.status).toBe(1);
        expect(output).toContain('Compliance-sensitive files changed without a declaration file');
        expect(output).toContain('apps/dgfy-api/src/routes/commercePayments.js');
    });

    it('passes commercePayments module changes with a matching major/payments declaration', () => {
        const declaration = writeTempDeclaration(buildDeclaration({
            declarationId: '2026-04-07-test-commerce-payments-floor',
            classification: 'major',
            surfaces: 'payments'
        }));

        try {
            const result = runCheck({
                changedFiles: [
                    'apps/dgfy-api/src/modules/commercePayments/usecases/finalizePaidCommerceSession.js',
                    declaration.relativePath
                ]
            });

            const output = `${result.stdout}${result.stderr}`;
            expect(result.status).toBe(0);
            expect(output).toContain('PASS');
        } finally {
            cleanupTempDeclaration(declaration.absolutePath);
        }
    });

    it('supports staged-mode parity via COMPLIANCE_STAGED_FILES override', () => {
        const declaration = writeTempDeclaration(buildDeclaration({
            declarationId: '2026-04-07-test-staged-parity',
            classification: 'major',
            surfaces: 'settings'
        }));

        try {
            const result = runCheck({
                stagedFiles: [
                    'apps/dgfy-api/src/routes/settings.js',
                    declaration.relativePath
                ],
                args: ['--staged']
            });

            const output = `${result.stdout}${result.stderr}`;
            expect(result.status).toBe(0);
            expect(output).toContain('[check:compliance] PASS');
        } finally {
            cleanupTempDeclaration(declaration.absolutePath);
        }
    });

    it.each([
        'apps/dgfy-api/src/routes/adminTenants.js',
        'apps/dgfy-api/src/modules/tenants/controllers/adminTenantHandlers.js',
        'apps/dgfy-api/src/controllers/adminTenantController.js',
        'apps/dgfy-api/src/controllers/complianceController.js',
        'apps/dgfy-api/src/modules/tenants/usecases/registerCompanyRequestUseCase.js',
        'apps/dgfy-api/src/modules/tenants/usecases/provisionNewTenantUseCase.js',
        'apps/dgfy-api/src/modules/tenants/repositories/tenantAdminRepository.js'
    ])('fails when uncovered compliance-sensitive path changes without declaration: %s', (changedPath) => {
        const result = runCheck({
            changedFiles: [changedPath]
        });

        const output = `${result.stdout}${result.stderr}`;
        expect(result.status).toBe(1);
        expect(output).toContain('Compliance-sensitive files changed without a declaration file');
        expect(output).toContain(changedPath);
    });

    it('fails when mixed admin compliance service change declares major below regulatory floor', () => {
        const declaration = writeTempDeclaration(buildDeclaration({
            declarationId: '2026-04-07-test-admin-service-floor',
            classification: 'major',
            surfaces: 'settings,compliance'
        }));

        try {
            const result = runCheck({
                changedFiles: [
                    'apps/dgfy-web/src/services/adminService.js',
                    declaration.relativePath
                ]
            });

            const output = `${result.stdout}${result.stderr}`;
            expect(result.status).toBe(1);
            expect(output).toContain('below computed minimum "regulatory"');
        } finally {
            cleanupTempDeclaration(declaration.absolutePath);
        }
    });
});
