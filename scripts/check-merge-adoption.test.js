const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  MergeAdoptionError,
  parseArgs,
  validateManifest,
} = require('./check-merge-adoption');

const silentLogger = {
  log() {},
  warn() {},
  error() {},
};

function makeTempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'merge-adoption-gate-'));
}

function writeFile(projectRoot, relativePath, content) {
  const filePath = path.join(projectRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function writeManifest(projectRoot, manifest) {
  writeFile(projectRoot, 'merge-adoption.json', JSON.stringify(manifest, null, 2));
  return 'merge-adoption.json';
}

function baseManifest(overrides = {}) {
  return {
    version: 1,
    merge_name: 'test merge',
    target_branch: 'master',
    semantic_conflict_review: {
      status: 'none',
      notes: 'No behavioral merge conflicts were found in this test fixture.',
      user_approved_decisions: [],
    },
    feature_areas: [
      {
        id: 'storefront-customer-dashboard',
        decision: 'combine',
        intent: 'Adopt the new dashboard while preserving existing order tracking.',
        master_behaviors_preserved: ['Track buttons remain available.'],
        proof: {
          required_files_present: ['frontend/apps/store/src/StorefrontApp.jsx'],
          required_strings_present: [
            {
              file: 'frontend/apps/store/src/StorefrontApp.jsx',
              text: 'Grow your business',
            },
          ],
          required_strings_absent: [
            {
              file: 'frontend/apps/store/src/StorefrontApp.jsx',
              text: 'Company token:',
            },
          ],
          tests: ['npm --prefix frontend test -- --run apps/store/src/__tests__/profileLauncher.integration.test.jsx'],
        },
      },
    ],
    ...overrides,
  };
}

test('requires a manifest path', () => {
  assert.throws(
    () => parseArgs([]),
    (error) => error instanceof MergeAdoptionError && error.code === 'MANIFEST_REQUIRED'
  );
});

test('passes when required files and string evidence are present', () => {
  const projectRoot = makeTempProject();
  try {
    writeFile(
      projectRoot,
      'frontend/apps/store/src/StorefrontApp.jsx',
      'const title = "Grow your business"; const action = "Track Order";'
    );
    const manifestPath = writeManifest(projectRoot, baseManifest());
    const report = validateManifest({ projectRoot, manifestPath, logger: silentLogger });
    assert.equal(report.status, 'pass');
    assert.equal(report.feature_area_count, 1);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('fails when old or unsafe UI strings remain', () => {
  const projectRoot = makeTempProject();
  try {
    writeFile(
      projectRoot,
      'frontend/apps/store/src/StorefrontApp.jsx',
      'const title = "Grow your business"; const leak = "Company token:";'
    );
    const manifestPath = writeManifest(projectRoot, baseManifest());
    assert.throws(
      () => validateManifest({ projectRoot, manifestPath, logger: silentLogger }),
      (error) => error instanceof MergeAdoptionError
        && error.errors.some((message) => message.includes('forbidden string is still present'))
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('requires rejected feature areas to explain the rejection', () => {
  const projectRoot = makeTempProject();
  try {
    const manifestPath = writeManifest(
      projectRoot,
      baseManifest({
        feature_areas: [
          {
            id: 'obsolete-root-doc',
            decision: 'reject',
            intent: 'Do not adopt the root-level draft doc.',
            proof: {
              required_files_absent: ['DGFY_version1.1.md'],
            },
          },
        ],
      })
    );
    assert.throws(
      () => validateManifest({ projectRoot, manifestPath, logger: silentLogger }),
      (error) => error instanceof MergeAdoptionError
        && error.errors.some((message) => message.includes('rejection_reason'))
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('writes a report artifact for release evidence', () => {
  const projectRoot = makeTempProject();
  try {
    writeFile(
      projectRoot,
      'frontend/apps/store/src/StorefrontApp.jsx',
      'const title = "Grow your business";'
    );
    const manifestPath = writeManifest(projectRoot, baseManifest());
    const report = validateManifest({
      projectRoot,
      manifestPath,
      reportPath: '.tmp/release-gates/test-sha/merge_adoption_report.json',
      logger: silentLogger,
    });
    const persistedPath = path.join(projectRoot, report.report_path);
    const persisted = JSON.parse(fs.readFileSync(persistedPath, 'utf8'));
    assert.equal(persisted.status, 'pass');
    assert.equal(persisted.merge_name, 'test merge');
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
