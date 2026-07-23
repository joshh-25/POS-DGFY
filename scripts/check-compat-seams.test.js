const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  runCheck,
  validateManifestSchema,
  validateSeamCompleteness,
  validateSeamTestPaths,
} = require('./check-compat-seams');

// Built from parts so this test file's own source text never contains the
// marker as a single literal substring — otherwise a real, full-repo
// `npm run check:compat-seams` run would find a phantom marker inside this
// very file (see check-compat-seams.js file header for the same rule).
const MARKER_TAG = ['@compat', '-seam'].join('');
const MARKER_KEY = ['i', 'd', '='].join('');
const markerComment = (id) => `// ${MARKER_TAG} ${MARKER_KEY}${id}\n`;

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function writeManifest(root, manifest) {
  const manifestPath = path.join(root, 'compatibility-seams.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifestPath;
}

function baseSeam(overrides = {}) {
  return {
    id: 'sample-seam',
    type: 'db-level',
    status: 'active',
    rationale: 'Example rationale for the sample seam.',
    tests: ['tests/sample.test.js'],
    rollback: 'Remove the seam entry and its code marker.',
    removal_criteria: 'Legacy dependency retired.',
    ...overrides,
  };
}

function runGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return (result.stdout || '').trim();
}

function makeGitRepo() {
  const root = makeTempDir('compat-seams-git-');
  runGit(root, ['init']);
  runGit(root, ['config', 'user.email', 'test@example.com']);
  runGit(root, ['config', 'user.name', 'Compat Seams Test']);
  return root;
}

test('empty manifest and no code markers passes cleanly', () => {
  const root = makeTempDir('compat-seams-empty-');
  try {
    const manifestPath = writeManifest(root, { version: 1, seams: [] });
    writeFile(root, 'src/index.js', 'module.exports = {};\n');

    const result = runCheck({ manifestPath, repoRoot: root });

    assert.equal(result.ok, true);
    assert.deepEqual(result.failures, []);
    assert.equal(result.seamCount, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects a seam missing governance fields with a per-field failure', () => {
  const root = makeTempDir('compat-seams-incomplete-');
  try {
    const manifestPath = writeManifest(root, {
      version: 1,
      seams: [
        baseSeam({
          rationale: '',
          rollback: '',
          removal_criteria: '',
          tests: [],
        }),
      ],
    });

    const result = runCheck({ manifestPath, repoRoot: root });

    assert.equal(result.ok, false);
    assert.ok(result.failures.some((f) => /rationale must be a non-empty string/.test(f)));
    assert.ok(result.failures.some((f) => /rollback must be a non-empty string/.test(f)));
    assert.ok(result.failures.some((f) => /removal_criteria must be a non-empty string/.test(f)));
    assert.ok(result.failures.some((f) => /tests must be a non-empty array/.test(f)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects a test path containing ".." before touching the filesystem', () => {
  const failures = validateSeamTestPaths(
    baseSeam({ tests: ['../outside-repo/evil.test.js'] }),
    '/nonexistent/repo/root/that/would/throw/if/accessed'
  );

  assert.ok(failures.some((f) => /must not contain "\.\." segments/.test(f)));
});

test('rejects an absolute test path before touching the filesystem', () => {
  const failures = validateSeamTestPaths(
    baseSeam({ tests: ['/etc/passwd'] }),
    '/nonexistent/repo/root/that/would/throw/if/accessed'
  );

  assert.ok(failures.some((f) => /must be repo-relative, not absolute/.test(f)));
});

test('rejects a safe repo-relative test path that does not exist on disk', () => {
  const root = makeTempDir('compat-seams-missing-test-');
  try {
    const manifestPath = writeManifest(root, {
      version: 1,
      seams: [baseSeam({ status: 'pending', tests: ['tests/does-not-exist.test.js'] })],
    });

    const result = runCheck({ manifestPath, repoRoot: root });

    assert.equal(result.ok, false);
    assert.ok(result.failures.some((f) => /does not exist/.test(f)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects an unknown type or status enum value', () => {
  const manifest = {
    version: 1,
    seams: [baseSeam({ type: 'not-a-real-type' }), baseSeam({ id: 'seam-two', status: 'not-a-real-status' })],
  };

  const { failures } = validateManifestSchema(manifest);

  assert.ok(failures.some((f) => /\.type must be one of/.test(f)));
  assert.ok(failures.some((f) => /\.status must be one of/.test(f)));
});

test('fails when a code marker has no matching complete manifest entry', () => {
  const root = makeTempDir('compat-seams-orphan-marker-');
  try {
    const manifestPath = writeManifest(root, { version: 1, seams: [] });
    writeFile(root, 'src/legacyAdapter.js', markerComment('missing-entry'));

    const result = runCheck({ manifestPath, repoRoot: root });

    assert.equal(result.ok, false);
    assert.ok(result.failures.some((f) => /Code marker id "missing-entry"/.test(f)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails when an active manifest entry has no matching code marker (orphan entry)', () => {
  const root = makeTempDir('compat-seams-orphan-entry-');
  try {
    const manifestPath = writeManifest(root, {
      version: 1,
      seams: [baseSeam({ tests: ['tests/sample.test.js'] })],
    });
    writeFile(root, 'tests/sample.test.js', '// covers the sample seam\n');
    // Deliberately no marker comment anywhere in the tree.

    const result = runCheck({ manifestPath, repoRoot: root });

    assert.equal(result.ok, false);
    assert.ok(result.failures.some((f) => /orphan entry/.test(f)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pending/removed entries are exempt from the marker-presence requirement', () => {
  const root = makeTempDir('compat-seams-exempt-status-');
  try {
    const manifestPath = writeManifest(root, {
      version: 1,
      seams: [
        baseSeam({ id: 'pending-seam', status: 'pending' }),
        baseSeam({ id: 'removed-seam', status: 'removed' }),
      ],
    });
    writeFile(root, 'tests/sample.test.js', '// fixture\n');

    const result = runCheck({ manifestPath, repoRoot: root });

    assert.equal(result.ok, true);
    assert.deepEqual(result.failures, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a complete active seam with a matching marker passes', () => {
  const root = makeTempDir('compat-seams-happy-path-');
  try {
    writeFile(root, 'tests/sample.test.js', '// fixture\n');
    writeFile(root, 'src/legacyAdapter.js', markerComment('sample-seam'));
    const manifestPath = writeManifest(root, {
      version: 1,
      seams: [baseSeam()],
    });

    const result = runCheck({ manifestPath, repoRoot: root });

    assert.equal(result.ok, true);
    assert.deepEqual(result.failures, []);
    assert.equal(result.seamCount, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--staged mode restricts the marker scan to git diff --cached --name-only', () => {
  const root = makeGitRepo();
  try {
    writeFile(root, 'tests/sample.test.js', '// fixture\n');
    writeFile(root, 'src/unstagedAdapter.js', markerComment('unstaged-marker'));
    runGit(root, ['add', 'tests/sample.test.js']);
    runGit(root, ['commit', '-m', 'base fixture']);

    // Staged file carries a marker with no manifest entry — should fail.
    writeFile(root, 'src/stagedAdapter.js', markerComment('staged-marker'));
    runGit(root, ['add', 'src/stagedAdapter.js']);

    const manifestPath = writeManifest(root, { version: 1, seams: [] });

    const result = runCheck({ manifestPath, repoRoot: root, staged: true });

    assert.equal(result.ok, false);
    assert.ok(result.failures.some((f) => /Code marker id "staged-marker"/.test(f)));
    // The unstaged marker must NOT be picked up in staged mode.
    assert.ok(!result.failures.some((f) => /unstaged-marker/.test(f)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('completeness gate is skipped for pending/removed seams', () => {
  const failures = validateSeamCompleteness(
    baseSeam({ status: 'pending', rationale: '', rollback: '', removal_criteria: '', tests: [] })
  );

  assert.deepEqual(failures, []);
});
