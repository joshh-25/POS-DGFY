const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { runCheck, resolveCandidateIdFromHeadBranch } = require('./check-release-notes');

// --- git fixture harness, same shape as check-app-version-bump.test.js's -----------

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return (result.stdout || '').trim();
}

function makeGitRepo() {
  const root = makeTempDir('check-release-notes-git-');
  runGit(root, ['init', '-q']);
  runGit(root, ['config', 'user.email', 'test@example.com']);
  runGit(root, ['config', 'user.name', 'Release Notes Check Test']);
  return root;
}

function writeFiles(root, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

function commitAll(root, message) {
  runGit(root, ['add', '-A']);
  runGit(root, ['commit', '-q', '-m', message]);
  return runGit(root, ['rev-parse', 'HEAD']);
}

function pkgJson(version) {
  return `${JSON.stringify({ name: 'fixture', version }, null, 2)}\n`;
}

const CANDIDATE_ID = '2026-09-05-01';
const HEAD_BRANCH = `release/${CANDIDATE_ID}-r1`;

const DEFAULT_VERSIONS = {
  'dgfy-api': '1.2.2',
  'dgfy-migration-runner': '1.1.0',
  'dgfy-ims': '1.1.2',
  'dgfy-pos': '1.1.2',
  'dgfy-storefront': '1.2.1',
};

function appFixtures(versions = DEFAULT_VERSIONS) {
  const files = {};
  for (const [app, version] of Object.entries(versions)) {
    files[`apps/${app}/package.json`] = pkgJson(version);
  }
  return files;
}

function versionTable(versions = DEFAULT_VERSIONS) {
  const rows = Object.entries(versions).map(([app, version]) => `| ${app} | ${version} |`);
  return ['| App | Version |', '|---|---|', ...rows].join('\n');
}

// Mirrors docs/releases/notes/TEMPLATE.md's shape. `overrides` lets each test replace exactly the
// piece under test while keeping everything else valid, same factory pattern as
// check-promotion-candidate.test.js's candidate().
function releaseNote({
  candidateId = CANDIDATE_ID,
  productionCommit = 'pending',
  productionDate = '2026-09-05',
  versions = DEFAULT_VERSIONS,
  included = '- Storefront guest checkout no longer rejects a valid OTP after a page refresh. (#1614)',
  operationalNotes = 'None.',
  frontMatter = null,
} = {}) {
  const fm = frontMatter !== null ? frontMatter : [
    '---',
    'schema: sku-release-note/v1',
    `candidate_id: ${candidateId}`,
    `production_date: ${productionDate}`,
    `production_commit: ${productionCommit}`,
    '---',
  ].join('\n');

  return [
    fm,
    '',
    `# Release ${candidateId} — ${productionDate}`,
    '',
    versionTable(versions),
    '',
    '## Included',
    '',
    included,
    '',
    '## Operational notes',
    '',
    operationalNotes,
    '',
  ].join('\n');
}

function setupScenario({ versions = DEFAULT_VERSIONS, note, notePath } = {}) {
  const root = makeGitRepo();
  writeFiles(root, appFixtures(versions));
  const headGitRef = commitAll(root, 'head');
  if (note !== undefined) {
    const target = notePath || path.join(root, 'docs', 'releases', 'notes', `${CANDIDATE_ID}.md`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, note);
  }
  return { root, headGitRef };
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

// --- resolveCandidateIdFromHeadBranch ---------------------------------------------

test('resolveCandidateIdFromHeadBranch: matches the default flow and the #1007 exception alike (same pattern)', () => {
  assert.deepEqual(resolveCandidateIdFromHeadBranch('release/2026-09-05-01-r1'), { candidateId: '2026-09-05-01', revision: 1 });
  assert.deepEqual(resolveCandidateIdFromHeadBranch('release/2026-09-05-01-r3'), { candidateId: '2026-09-05-01', revision: 3 });
});

test('resolveCandidateIdFromHeadBranch: rejects a non-release-shaped branch', () => {
  assert.equal(resolveCandidateIdFromHeadBranch('to-staging/2026-09-05-01'), null);
  assert.equal(resolveCandidateIdFromHeadBranch('fix/2026-09-06-01'), null);
  assert.equal(resolveCandidateIdFromHeadBranch(''), null);
  assert.equal(resolveCandidateIdFromHeadBranch(undefined), null);
});

// --- happy paths -------------------------------------------------------------------

test('happy path: pending production_commit passes with no findings', () => {
  const { root, headGitRef } = setupScenario({ note: releaseNote({ productionCommit: 'pending' }) });
  try {
    const result = runCheck({ repoRoot: root, headGitRef, headBranchName: HEAD_BRANCH });
    assert.equal(result.ok, true);
    assert.equal(result.skipped, false);
    assert.deepEqual(result.findings, []);
    assert.equal(result.candidateId, CANDIDATE_ID);
  } finally {
    cleanup(root);
  }
});

test('happy path: a real 40-hex production_commit passes with no findings', () => {
  const realSha = 'a'.repeat(40);
  const { root, headGitRef } = setupScenario({ note: releaseNote({ productionCommit: realSha }) });
  try {
    const result = runCheck({ repoRoot: root, headGitRef, headBranchName: HEAD_BRANCH });
    assert.equal(result.ok, true);
    assert.deepEqual(result.findings, []);
  } finally {
    cleanup(root);
  }
});

test('happy path: "No user-visible changes." is a valid Included body', () => {
  const { root, headGitRef } = setupScenario({ note: releaseNote({ included: 'No user-visible changes.' }) });
  try {
    const result = runCheck({ repoRoot: root, headGitRef, headBranchName: HEAD_BRANCH });
    assert.equal(result.ok, true);
    assert.deepEqual(result.findings, []);
  } finally {
    cleanup(root);
  }
});

// --- failure paths -------------------------------------------------------------------

test('missing file: exits non-zero and names the expected path', () => {
  const { root, headGitRef } = setupScenario(); // no `note` -- file never written
  try {
    const result = runCheck({ repoRoot: root, headGitRef, headBranchName: HEAD_BRANCH });
    assert.equal(result.ok, false);
    assert.equal(result.skipped, false);
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].code, 'MISSING_RELEASE_NOTE_FILE');
  } finally {
    cleanup(root);
  }
});

test('version-table mismatch: a stale table version fails against apps/<app>/package.json at head', () => {
  const staleVersions = { ...DEFAULT_VERSIONS, 'dgfy-api': '1.2.1' }; // table still says 1.2.1
  const { root, headGitRef } = setupScenario({
    note: releaseNote({ versions: staleVersions }), // table built from the stale map
    // package.json fixtures use DEFAULT_VERSIONS (dgfy-api actually at 1.2.2)
  });
  try {
    const result = runCheck({ repoRoot: root, headGitRef, headBranchName: HEAD_BRANCH });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((f) => f.code === 'VERSION_MISMATCH' && f.message.includes('dgfy-api')));
  } finally {
    cleanup(root);
  }
});

test('missing "## Operational notes" section fails', () => {
  const note = releaseNote().replace(/## Operational notes\n\nNone\.\n\n?$/, '');
  const { root, headGitRef } = setupScenario({ note });
  try {
    const result = runCheck({ repoRoot: root, headGitRef, headBranchName: HEAD_BRANCH });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((f) => f.code === 'MISSING_OPERATIONAL_NOTES_SECTION'));
  } finally {
    cleanup(root);
  }
});

test('non-promotion head: exits ok, skipped, not applicable -- a fix/* hotfix branch is left uncovered on purpose', () => {
  const { root, headGitRef } = setupScenario({ note: releaseNote() });
  try {
    const result = runCheck({ repoRoot: root, headGitRef, headBranchName: 'fix/2026-09-06-01' });
    assert.equal(result.ok, true);
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'not-a-promotion-branch');
    assert.equal(result.candidateId, null);
  } finally {
    cleanup(root);
  }
});

test('malformed frontmatter: a note with no front matter block fails', () => {
  const note = '# Release 2026-09-05-01\n\nNo frontmatter here.\n';
  const { root, headGitRef } = setupScenario({ note });
  try {
    const result = runCheck({ repoRoot: root, headGitRef, headBranchName: HEAD_BRANCH });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((f) => f.code === 'MISSING_FRONTMATTER'));
  } finally {
    cleanup(root);
  }
});

test('invalid production_commit: neither 40-hex nor the literal "pending" fails', () => {
  const { root, headGitRef } = setupScenario({ note: releaseNote({ productionCommit: 'TBD' }) });
  try {
    const result = runCheck({ repoRoot: root, headGitRef, headBranchName: HEAD_BRANCH });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((f) => f.code === 'INVALID_PRODUCTION_COMMIT'));
  } finally {
    cleanup(root);
  }
});

// --- a few extra edge cases worth locking in ----------------------------------------

test('candidate_id mismatch between frontmatter and the release branch fails', () => {
  const note = releaseNote({ frontMatter: [
    '---',
    'schema: sku-release-note/v1',
    'candidate_id: 2026-09-01-01',
    'production_date: 2026-09-05',
    'production_commit: pending',
    '---',
  ].join('\n') });
  const { root, headGitRef } = setupScenario({ note });
  try {
    const result = runCheck({ repoRoot: root, headGitRef, headBranchName: HEAD_BRANCH });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((f) => f.code === 'CANDIDATE_ID_MISMATCH'));
  } finally {
    cleanup(root);
  }
});

test('a missing app row in the version table fails', () => {
  const partial = { ...DEFAULT_VERSIONS };
  delete partial['dgfy-pos'];
  const { root, headGitRef } = setupScenario({ note: releaseNote({ versions: partial }) });
  try {
    const result = runCheck({ repoRoot: root, headGitRef, headBranchName: HEAD_BRANCH });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((f) => f.code === 'MISSING_APP_ROW' && f.message.includes('dgfy-pos')));
  } finally {
    cleanup(root);
  }
});

test('a multi-line (wrapped) Included bullet fails the concision rule', () => {
  const included = '- Storefront guest checkout no longer rejects a valid OTP\nafter a page refresh. (#1614)';
  const { root, headGitRef } = setupScenario({ note: releaseNote({ included }) });
  try {
    const result = runCheck({ repoRoot: root, headGitRef, headBranchName: HEAD_BRANCH });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((f) => f.code === 'INCLUDED_MULTILINE_BULLET'));
  } finally {
    cleanup(root);
  }
});

test('a fenced code block in Included fails', () => {
  const included = '- one line\n\n```\ncode\n```';
  const { root, headGitRef } = setupScenario({ note: releaseNote({ included }) });
  try {
    const result = runCheck({ repoRoot: root, headGitRef, headBranchName: HEAD_BRANCH });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((f) => f.code === 'INCLUDED_FENCED_CODE_BLOCK'));
  } finally {
    cleanup(root);
  }
});

test('a nested list under Included fails', () => {
  const included = '- top level change\n  - nested detail';
  const { root, headGitRef } = setupScenario({ note: releaseNote({ included }) });
  try {
    const result = runCheck({ repoRoot: root, headGitRef, headBranchName: HEAD_BRANCH });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((f) => f.code === 'INCLUDED_NESTED_LIST'));
  } finally {
    cleanup(root);
  }
});
