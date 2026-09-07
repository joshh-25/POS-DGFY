const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ReconcileLocalError,
  normalizeDeclarationArgs,
  validateDeclarations,
  parseFixtureOutput,
  sweepOneDeclaration,
  reconcileOrFailClosed,
  DECLARATIONS_DIR
} = require('./reconcile-preflight-declaration-local');

// ---- normalizeDeclarationArgs ------------------------------------------------------------------

test('normalizeDeclarationArgs throws on no arguments', () => {
  assert.throws(() => normalizeDeclarationArgs([]), /Usage: node scripts/);
});

test('normalizeDeclarationArgs prefixes a bare filename with DECLARATIONS_DIR', () => {
  const [normalized] = normalizeDeclarationArgs(['2026-09-07-example.md']);
  assert.equal(normalized, `${DECLARATIONS_DIR}/2026-09-07-example.md`);
});

test('normalizeDeclarationArgs leaves an already-prefixed path alone', () => {
  const input = `${DECLARATIONS_DIR}/2026-09-07-example.md`;
  const [normalized] = normalizeDeclarationArgs([input]);
  assert.equal(normalized, input);
});

test('normalizeDeclarationArgs handles multiple entries, mixed bare/prefixed', () => {
  const normalized = normalizeDeclarationArgs([
    '2026-09-07-a.md',
    `${DECLARATIONS_DIR}/2026-09-07-b.md`
  ]);
  assert.deepEqual(normalized, [
    `${DECLARATIONS_DIR}/2026-09-07-a.md`,
    `${DECLARATIONS_DIR}/2026-09-07-b.md`
  ]);
});

test('normalizeDeclarationArgs rejects an absolute path', () => {
  assert.throws(() => normalizeDeclarationArgs(['/etc/passwd']), /path traversal/);
});

test('normalizeDeclarationArgs rejects a path-traversal entry', () => {
  assert.throws(() => normalizeDeclarationArgs(['../../etc/passwd']), /path traversal/);
});

test('normalizeDeclarationArgs rejects an empty entry', () => {
  assert.throws(() => normalizeDeclarationArgs(['  ']), /Empty declarations entry/);
});

// ---- validateDeclarations ----------------------------------------------------------------------

test('validateDeclarations throws on a missing file (operator input error, fails fast)', () => {
  assert.throws(
    () => validateDeclarations(['docs/compliance/impact-declarations/does-not-exist.md'], {
      existsSync: () => false
    }),
    /does not exist/
  );
});

test('validateDeclarations skips (does not error on) an already-reconciled entry', () => {
  const logs = [];
  const result = validateDeclarations(['docs/compliance/impact-declarations/already-done.md'], {
    existsSync: () => true,
    readFileSync: () => 'content',
    isOutstanding: () => false,
    log: (msg) => logs.push(msg)
  });
  assert.deepEqual(result, []);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /already reconciled, skipping/);
});

test('validateDeclarations returns only the outstanding subset, preserving order', () => {
  const files = {
    'a.md': false, // already reconciled
    'b.md': true,
    'c.md': true
  };
  const result = validateDeclarations(['a.md', 'b.md', 'c.md'], {
    existsSync: () => true,
    readFileSync: (p) => p,
    isOutstanding: (content) => files[content]
  });
  assert.deepEqual(result, ['b.md', 'c.md']);
});

// ---- parseFixtureOutput -------------------------------------------------------------------------

test('parseFixtureOutput extracts the five expected keys and ignores unrelated log noise', () => {
  const stdout = [
    '[seed-preflight-fixture] Provisioning tenant "PreflightFixture-local"...',
    'PREFLIGHT_HOST=http://127.0.0.1:18081',
    'some winston log line with an = sign in it',
    'PREFLIGHT_COMPANY_TOKEN=abc123',
    'PREFLIGHT_BOT_EMAIL=preflightbot@ci.local',
    'PREFLIGHT_BOT_PASSWORD=hunter2',
    'FIXTURE_TENANT_ID=42'
  ].join('\n');

  const parsed = parseFixtureOutput(stdout);
  assert.deepEqual(parsed, {
    PREFLIGHT_HOST: 'http://127.0.0.1:18081',
    PREFLIGHT_COMPANY_TOKEN: 'abc123',
    PREFLIGHT_BOT_EMAIL: 'preflightbot@ci.local',
    PREFLIGHT_BOT_PASSWORD: 'hunter2',
    FIXTURE_TENANT_ID: '42'
  });
});

test('parseFixtureOutput throws when a required key never appeared', () => {
  const stdout = 'PREFLIGHT_HOST=http://127.0.0.1:18081\nFIXTURE_TENANT_ID=42\n';
  assert.throws(() => parseFixtureOutput(stdout), /missing expected key/);
});

// ---- sweepOneDeclaration ------------------------------------------------------------------------

const FIXTURE_FRONT_MATTER = {
  major: '---\ndeclaration_id: fixture\nclassification: major\nsurfaces: pos\n---\n\n# Fixture\n\nBody.\n',
  minorNoSurface: '---\ndeclaration_id: fixture\nclassification: minor\nsurfaces: storefront\n---\n\n# Fixture\n\nBody.\n',
  majorNoSurface: '---\ndeclaration_id: fixture\nclassification: major\nsurfaces: storefront\n---\n\n# Fixture\n\nBody.\n',
  noFrontMatter: '# Fixture\n\nNo front matter here.\n'
};

test('sweepOneDeclaration throws MISSING_DEP when no postPreflight is injected', async () => {
  await assert.rejects(
    () => sweepOneDeclaration('x.md', { readFileSync: () => FIXTURE_FRONT_MATTER.major }),
    (error) => error instanceof ReconcileLocalError && error.code === 'MISSING_DEP'
  );
});

test('sweepOneDeclaration returns a pass:false build_error entry (not a throw) when there is no front matter', async () => {
  const entry = await sweepOneDeclaration('x.md', {
    readFileSync: () => FIXTURE_FRONT_MATTER.noFrontMatter,
    postPreflight: () => { throw new Error('should not be called'); }
  });
  assert.equal(entry.declaration, 'x.md');
  assert.equal(entry.verdict.pass, false);
  assert.equal(entry.verdict.reason_code, 'NO_FRONT_MATTER');
});

test('sweepOneDeclaration returns pass:true, result:not_applicable for a minor declaration with no endpoint-accepted surface (#1396)', async () => {
  const entry = await sweepOneDeclaration('x.md', {
    readFileSync: () => FIXTURE_FRONT_MATTER.minorNoSurface,
    postPreflight: () => { throw new Error('should not be called -- no_applicable is not_applicable, no HTTP call'); }
  });
  assert.equal(entry.http_code, 'n/a');
  assert.equal(entry.verdict.pass, true);
  assert.equal(entry.verdict.result, 'not_applicable');
  assert.equal(entry.verdict.reason_code, 'NO_ENDPOINT_ACCEPTED_SURFACE');
});

test('sweepOneDeclaration returns a pass:false build_error entry (not a throw) for a major declaration with no endpoint-accepted surface', async () => {
  const entry = await sweepOneDeclaration('x.md', {
    readFileSync: () => FIXTURE_FRONT_MATTER.majorNoSurface,
    postPreflight: () => { throw new Error('should not be called'); }
  });
  assert.equal(entry.verdict.pass, false);
  assert.equal(entry.verdict.result, 'build_error');
  assert.equal(entry.verdict.reason_code, 'NO_ENDPOINT_ACCEPTED_SURFACE');
});

test('sweepOneDeclaration calls postPreflight and parses a passing response (sync postPreflight)', async () => {
  const entry = await sweepOneDeclaration('x.md', {
    readFileSync: () => FIXTURE_FRONT_MATTER.major,
    postPreflight: (body) => {
      assert.equal(body.impact_declaration.declaration_id, 'fixture');
      return {
        httpCode: 200,
        responseBody: JSON.stringify({ success: true, data: { result: 'no_breach', can_proceed: true, reason_code: 'ALLOWED' } })
      };
    }
  });
  assert.equal(entry.http_code, '200');
  assert.equal(entry.verdict.pass, true);
  assert.equal(entry.verdict.result, 'no_breach');
});

test('sweepOneDeclaration awaits an async postPreflight and parses a failing response', async () => {
  const entry = await sweepOneDeclaration('x.md', {
    readFileSync: () => FIXTURE_FRONT_MATTER.major,
    postPreflight: async (body) => {
      await Promise.resolve();
      return {
        httpCode: 200,
        responseBody: JSON.stringify({ success: true, data: { result: 'breach', can_proceed: false, reason_code: 'COMPLIANCE_ACTIVATION_REQUIRED' } })
      };
    }
  });
  assert.equal(entry.verdict.pass, false);
  assert.equal(entry.verdict.result, 'breach');
});

// ---- reconcileOrFailClosed ----------------------------------------------------------------------

test('reconcileOrFailClosed reconciles every entry when all pass', () => {
  const reconcileCalls = [];
  const outcome = reconcileOrFailClosed(
    [
      { declaration: 'a.md', verdict: { pass: true, result: 'no_breach' } },
      { declaration: 'b.md', verdict: { pass: true, result: 'not_applicable' } }
    ],
    { runId: 'local' },
    {
      reconcileDeclarationFile: (declarationPath, verdict, { runId }) => {
        reconcileCalls.push({ declarationPath, verdict, runId });
        return `PREFLIGHT-${runId}-${declarationPath}`;
      }
    }
  );

  assert.equal(outcome.ok, true);
  assert.equal(outcome.failed.length, 0);
  assert.deepEqual(outcome.reconciled, [
    { declaration: 'a.md', ref: 'PREFLIGHT-local-a.md' },
    { declaration: 'b.md', ref: 'PREFLIGHT-local-b.md' }
  ]);
  assert.equal(reconcileCalls.length, 2);
});

test('reconcileOrFailClosed reconciles nothing when any entry fails (fail-closed, no partial writes)', () => {
  let reconcileCallCount = 0;
  const failedLogs = [];
  const outcome = reconcileOrFailClosed(
    [
      { declaration: 'a.md', verdict: { pass: true, result: 'no_breach' } },
      { declaration: 'b.md', verdict: { pass: false, result: 'breach', reason_code: 'COMPLIANCE_ACTIVATION_REQUIRED' } }
    ],
    { runId: 'local' },
    {
      reconcileDeclarationFile: () => { reconcileCallCount += 1; return 'unused'; },
      logError: (msg) => failedLogs.push(msg)
    }
  );

  assert.equal(outcome.ok, false);
  assert.deepEqual(outcome.reconciled, []);
  assert.deepEqual(outcome.failed, ['b.md']);
  assert.equal(reconcileCallCount, 0, 'must not reconcile ANY file when the batch has a failure, including the passing ones');
  assert.equal(failedLogs.length, 1);
  assert.match(failedLogs[0], /b\.md/);
});

test('reconcileOrFailClosed treats a missing/undefined verdict.pass as a failure', () => {
  const outcome = reconcileOrFailClosed(
    [{ declaration: 'a.md', verdict: {} }],
    { runId: 'local' },
    { reconcileDeclarationFile: () => { throw new Error('should not be called'); } }
  );
  assert.equal(outcome.ok, false);
  assert.deepEqual(outcome.failed, ['a.md']);
});
