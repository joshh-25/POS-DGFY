const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const repoRoot = path.resolve(__dirname, '..');
const changedFiles = [
  'apps/dgfy-api/src/modules/tenants/controllers/adminTenantHandlers.js',
  'packages/web-core/src/features/pos/__tests__/terminalLocationScope.integration.test.jsx',
  'docs/compliance/impact-declarations/2026-09-24-pr-2054-aggregate-compliance.md',
  'docs/compliance/impact-declarations/2026-09-23-opis-split-back-office-phase-461.md'
].join(',');

const runCompliance = (headRef) => spawnSync(
  process.execPath,
  ['scripts/check-compliance-impact.js'],
  {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_BASE_REF: 'develop',
      GITHUB_HEAD_REF: headRef,
      COMPLIANCE_CHANGED_FILES: changedFiles
    }
  }
);

test('uses the aggregate declaration only for the PR 2054 develop compare', () => {
  const result = runCompliance('feature/2052-opis-split-back-office');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /2026-09-24-pr-2054-aggregate-compliance as the aggregate declaration/);
  assert.doesNotMatch(result.stdout, /2026-09-23-opis-split-back-office-phase-461/);
});

test('does not apply PR 2054 aggregate handling to another feature head', () => {
  const result = runCompliance('feature/2053-unrelated-change');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Classification "major".*computed minimum "regulatory"/);
});

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
        GITHUB_BASE_REF: 'develop', GITHUB_HEAD_REF: 'feature/2372-tenant-intake-backend',
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
