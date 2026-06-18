const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  MergeAdoptionRequiredError,
  findManifestCandidates,
  isHighRiskPath,
  parseArgs,
  validateRequiredManifest,
} = require('./check-merge-adoption-required');

const silentLogger = {
  log() {},
  warn() {},
  error() {},
};

function makeTempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'merge-adoption-required-'));
}

function writeFile(projectRoot, relativePath, content) {
  const filePath = path.join(projectRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function writePassingManifest(projectRoot, relativePath = 'docs/release/merge-adoption/test.json') {
  writeFile(projectRoot, 'frontend/apps/store/src/StorefrontApp.jsx', 'const title = "Continue to your order";');
  writeFile(
    projectRoot,
    relativePath,
    JSON.stringify(
      {
        version: 1,
        merge_name: 'storefront adoption test',
        target_branch: 'master',
        semantic_conflict_review: {
          status: 'none',
          notes: 'No behavioral merge conflicts were found during this test fixture.',
          user_approved_decisions: [],
        },
        feature_areas: [
          {
            id: 'checkout-entry',
            decision: 'combine',
            intent: 'Adopt checkout entry UI while preserving master order linkage.',
            master_behaviors_preserved: ['DGFY account ownership remains explicit.'],
            proof: {
              required_files_present: ['frontend/apps/store/src/StorefrontApp.jsx'],
              required_strings_present: [
                {
                  file: 'frontend/apps/store/src/StorefrontApp.jsx',
                  text: 'Continue to your order',
                },
              ],
              tests: ['npm --prefix frontend test -- --run apps/store/src/__tests__/checkoutRules.test.js'],
            },
          },
        ],
      },
      null,
      2
    )
  );
  return relativePath;
}

test('recognizes high-risk storefront and customer-flow paths', () => {
  assert.equal(isHighRiskPath('frontend/apps/store/src/StorefrontApp.jsx'), true);
  assert.equal(isHighRiskPath('backend/src/modules/dgfy/usecases/dgfyCustomerUseCases.js'), true);
  assert.equal(isHighRiskPath('docs/features/DGFY_CUSTOMER_ACCOUNT.md'), true);
  assert.equal(isHighRiskPath('docs/archive/old-note.md'), false);
});

test('finds adoption manifests under docs/release/merge-adoption', () => {
  assert.deepEqual(findManifestCandidates([
    'frontend/apps/store/src/StorefrontApp.jsx',
    'docs/release/merge-adoption/storefront-customer-flow.json',
    'docs/templates/MERGE_ADOPTION_MANIFEST_TEMPLATE.json',
  ]), ['docs/release/merge-adoption/storefront-customer-flow.json']);
});

test('parses explicit base, head, and manifest arguments', () => {
  const options = parseArgs([
    '--base',
    'origin/master',
    '--head',
    'HEAD',
    '--manifest',
    'docs/release/merge-adoption/example.json',
  ]);
  assert.equal(options.base, 'origin/master');
  assert.equal(options.head, 'HEAD');
  assert.equal(options.manifestPath, 'docs/release/merge-adoption/example.json');
});

test('passes when no high-risk files changed', () => {
  const report = validateRequiredManifest({
    projectRoot: makeTempProject(),
    changedFiles: ['docs/reference/readme.md'],
    logger: silentLogger,
  });
  assert.equal(report.required, false);
});

test('fails high-risk changes without a manifest', () => {
  const projectRoot = makeTempProject();
  try {
    assert.throws(
      () => validateRequiredManifest({
        projectRoot,
        changedFiles: ['frontend/apps/store/src/StorefrontApp.jsx'],
        logger: silentLogger,
      }),
      (error) => error instanceof MergeAdoptionRequiredError && error.code === 'MANIFEST_REQUIRED'
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('auto-selects and validates a single changed manifest', () => {
  const projectRoot = makeTempProject();
  try {
    const manifestPath = writePassingManifest(projectRoot);
    const report = validateRequiredManifest({
      projectRoot,
      changedFiles: ['frontend/apps/store/src/StorefrontApp.jsx', manifestPath],
      logger: silentLogger,
    });
    assert.equal(report.required, true);
    assert.equal(report.manifestPath, manifestPath);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('allows explicit no-adoption override for documented exceptions', () => {
  const report = validateRequiredManifest({
    projectRoot: makeTempProject(),
    changedFiles: ['frontend/apps/store/src/StorefrontApp.jsx'],
    allowNotRequired: true,
    logger: silentLogger,
  });
  assert.equal(report.bypassed, true);
});
