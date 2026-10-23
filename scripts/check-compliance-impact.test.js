const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const repoRoot = path.resolve(__dirname, '..');
const changedFiles = [
  'apps/dgfy-api/src/modules/tenants/controllers/adminTenantHandlers.js',
  'packages/web-core/src/features/pos/__tests__/terminalLocationScope.integration.test.jsx',
  'docs/compliance/impact-declarations/2026-09-24-pr-2054-aggregate-compliance.md',
  'docs/compliance/impact-declarations/2026-09-23-opis-split-back-office-phase-461.md',
  'docs/compliance/impact-declarations/2026-09-23-pos-backoffice-settings-layout.md'
].join(',');

const runCompliance = (headRef, baseRef = 'develop') => spawnSync(
  process.execPath,
  ['scripts/check-compliance-impact.js'],
  {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_BASE_REF: baseRef,
      GITHUB_HEAD_REF: headRef,
      COMPLIANCE_CHANGED_FILES: changedFiles
    }
  }
);

test('reserved integration heads into develop skip bundled classification and surface re-checking', () => {
  const result = runCompliance('feature/2053-unrelated-change');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /aggregate promotion feature\/2053-unrelated-change -> develop/);
  assert.match(result.stdout, /Skipping bundled classification\/surface re-check/);
  assert.match(`${result.stdout}${result.stderr}`, /Deleted declaration files are excluded from validation/);
});

test('ordinary feat heads into develop retain per-declaration classification scrutiny', () => {
  const result = runCompliance('feat/2053-unrelated-change');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Classification "major".*computed minimum "regulatory"/);
});

for (const baseRef of ['staging', 'main']) {
  test(`ordinary hotfix heads into ${baseRef} retain per-declaration classification scrutiny`, () => {
    const result = runCompliance('fix/2737-integration-branch-policy', baseRef);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Classification "major".*computed minimum "regulatory"/);
  });
}

for (const sensitivePath of [
  'apps/dgfy-api/src/modules/tenantIntake/usecases/tenantIntakeUseCases.js',
  'apps/dgfy-api/src/routes/adminTenantIntake.js',
  'apps/dgfy-api/src/config/demoProvisioningGuard.js',
  'apps/dgfy-api/src/modules/tenants/usecases/provisioningInputRules.js',
  'apps/dgfy-api/src/modules/tenants/usecases/adminAssistedProvisioningUseCase.js'
]) {
  test(`tenant intake retains regulatory floor for an isolated change: ${sensitivePath}`, () => {
    const run = (declaration) => spawnSync(process.execPath, ['scripts/check-compliance-impact.js'], {
      cwd: repoRoot, encoding: 'utf8', env: { ...process.env,
        GITHUB_BASE_REF: 'develop', GITHUB_HEAD_REF: 'feat/2372-tenant-intake-backend',
        COMPLIANCE_CHANGED_FILES: [sensitivePath, declaration].join(',') }
    });
    const missing = run('');
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /without a declaration/);
    const belowFloor = run('docs/compliance/impact-declarations/2026-10-07-dglaundry-outbound-delivery-phase-479.md');
    assert.notEqual(belowFloor.status, 0);
    assert.match(belowFloor.stderr, /Classification "major".*computed minimum "regulatory"/);
    const covered = run('docs/compliance/impact-declarations/2026-10-09-tenant-intake-backend.md');
    assert.equal(covered.status, 0, covered.stderr || covered.stdout);
  });
}
