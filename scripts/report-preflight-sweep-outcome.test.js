const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  POLICY_BLOCKED_PATTERN,
  classifyPrCreate,
  classifyOutcome,
  buildOperatorCommands,
  renderSummary,
  renderIssue,
  writeArtifact,
  runReport
} = require('./report-preflight-sweep-outcome');

const PASSING_RESULT = (declaration) => ({
  declaration,
  http_code: '200',
  verdict: { pass: true, result: 'no_breach', can_proceed: true, reason_code: 'ALLOWED' }
});

const FAILING_RESULT = (declaration) => ({
  declaration,
  http_code: '200',
  verdict: { pass: false, result: 'breach', can_proceed: false, reason_code: 'COMPLIANCE_ACTIVATION_REQUIRED' }
});

// --- classifyPrCreate --------------------------------------------------------------------------

test('classifyPrCreate: exit 0, any stderr noise -> created', () => {
  assert.equal(classifyPrCreate(0, ''), 'created');
  assert.equal(classifyPrCreate(0, 'some unrelated warning noise'), 'created');
  assert.equal(classifyPrCreate('0', 'noise'), 'created');
});

test('classifyPrCreate: exit 1 + the live policy-block string -> policy_blocked', () => {
  const liveStderr = 'GraphQL: GitHub Actions is not permitted to create or approve pull requests (createPullRequest)';
  assert.equal(classifyPrCreate(1, liveStderr), 'policy_blocked');
  assert.match(liveStderr, POLICY_BLOCKED_PATTERN);
});

test('classifyPrCreate: exit 1 + unrelated stderr -> error', () => {
  assert.equal(classifyPrCreate(1, 'fatal: could not read Username for https://github.com'), 'error');
  assert.equal(classifyPrCreate(1, ''), 'error');
});

// --- classifyOutcome -----------------------------------------------------------------------------

test('classifyOutcome: input_error takes priority over everything else', () => {
  const outcome = classifyOutcome({
    results: [PASSING_RESULT('a.md')],
    handoffState: { status: 'merged' },
    discoverCount: 1,
    inputError: true
  });
  assert.equal(outcome.class, 'input_error');
});

test('classifyOutcome: discoverCount 0 -> nothing_to_sweep', () => {
  const outcome = classifyOutcome({ results: null, handoffState: null, discoverCount: 0, inputError: false });
  assert.equal(outcome.class, 'nothing_to_sweep');
  assert.equal(outcome.discoverCount, 0);
});

test('classifyOutcome: results absent while discoverCount > 0 -> preflight_failed', () => {
  const outcome = classifyOutcome({ results: undefined, handoffState: null, discoverCount: 3, inputError: false });
  assert.equal(outcome.class, 'preflight_failed');
  assert.equal(outcome.discoverCount, 3);
});

test('classifyOutcome: a failing declaration -> preflight_failed, names the failing declaration', () => {
  const outcome = classifyOutcome({
    results: [PASSING_RESULT('2026-08-28-ok.md'), FAILING_RESULT('2026-08-29-breach.md')],
    handoffState: null,
    discoverCount: 2,
    inputError: false
  });
  assert.equal(outcome.class, 'preflight_failed');
  assert.equal(outcome.declarations.length, 1);
  assert.equal(outcome.declarations[0].declaration, '2026-08-29-breach.md');
  assert.equal(outcome.declarations[0].reason_code, 'COMPLIANCE_ACTIVATION_REQUIRED');
});

test('classifyOutcome: http_code != 200 with pass:true is still preflight_failed', () => {
  const outcome = classifyOutcome({
    results: [{ declaration: 'x.md', http_code: '500', verdict: { pass: true, result: 'no_breach', reason_code: 'ALLOWED' } }],
    handoffState: null,
    discoverCount: 1,
    inputError: false
  });
  assert.equal(outcome.class, 'preflight_failed');
  assert.equal(outcome.declarations[0].declaration, 'x.md');
});

test('classifyOutcome: all pass + handoff nothing_to_reconcile -> nothing_to_reconcile', () => {
  const outcome = classifyOutcome({
    results: [PASSING_RESULT('a.md')],
    handoffState: { status: 'nothing_to_reconcile' },
    discoverCount: 1,
    inputError: false
  });
  assert.equal(outcome.class, 'nothing_to_reconcile');
});

test('classifyOutcome: all pass + handoff merged -> merged', () => {
  const outcome = classifyOutcome({
    results: [PASSING_RESULT('a.md'), PASSING_RESULT('b.md')],
    handoffState: { status: 'merged', branch: 'compliance-sweep/123', pr_url: 'https://github.com/x/y/pull/9' },
    discoverCount: 2,
    inputError: false
  });
  assert.equal(outcome.class, 'merged');
  assert.deepEqual(outcome.declarations, ['a.md', 'b.md']);
});

test('classifyOutcome: all pass + handoff handoff_required -> handoff_required', () => {
  const outcome = classifyOutcome({
    results: [PASSING_RESULT('a.md')],
    handoffState: {
      status: 'handoff_required',
      branch: 'compliance-sweep/33545741502',
      head_sha: 'deadbeefcafef00d',
      base_sha: 'f00dcafedeadbeef',
      pr_body: '/tmp/pr-body.md'
    },
    discoverCount: 1,
    inputError: false
  });
  assert.equal(outcome.class, 'handoff_required');
});

test('classifyOutcome: a mix of no_breach passes and one not_applicable pass -> handoff_required, not preflight_failed', () => {
  const outcome = classifyOutcome({
    results: [
      { declaration: 'a.md', http_code: '200', verdict: { pass: true, result: 'no_breach', reason_code: 'ALLOWED' } },
      { declaration: 'b.md', http_code: 'n/a', verdict: { pass: true, result: 'not_applicable', reason_code: 'NO_ENDPOINT_ACCEPTED_SURFACE', declared_surfaces: ['storefront'] } }
    ],
    handoffState: { status: 'handoff_required', branch: 'compliance-sweep/1' },
    discoverCount: 2,
    inputError: false
  });
  assert.equal(outcome.class, 'handoff_required');
  assert.equal(outcome.not_applicable.length, 1);
  assert.deepEqual(outcome.not_applicable[0], {
    declaration: 'b.md',
    reason_code: 'NO_ENDPOINT_ACCEPTED_SURFACE',
    declared_surfaces: ['storefront']
  });
});

test('classifyOutcome: a not_applicable-shaped row with pass:false is a failure (defensive)', () => {
  const outcome = classifyOutcome({
    results: [
      { declaration: 'b.md', http_code: 'n/a', verdict: { pass: false, result: 'not_applicable', reason_code: 'NO_ENDPOINT_ACCEPTED_SURFACE' } }
    ],
    handoffState: null,
    discoverCount: 1,
    inputError: false
  });
  assert.equal(outcome.class, 'preflight_failed');
});

test('renderSummary and renderIssue both show the "Not applicable to live preflight" section when non-empty', () => {
  const outcome = classifyOutcome({
    results: [
      { declaration: 'a.md', http_code: '200', verdict: { pass: true, result: 'no_breach', reason_code: 'ALLOWED' } },
      { declaration: 'b.md', http_code: 'n/a', verdict: { pass: true, result: 'not_applicable', reason_code: 'NO_ENDPOINT_ACCEPTED_SURFACE', declared_surfaces: ['storefront'] } }
    ],
    handoffState: { status: 'handoff_required', branch: 'compliance-sweep/1' },
    discoverCount: 2,
    inputError: false
  });
  const summary = renderSummary(outcome);
  assert.match(summary, /Not applicable to live preflight/);
  assert.match(summary, /b\.md/);
  assert.match(summary, /NO_ENDPOINT_ACCEPTED_SURFACE/);

  const issue = renderIssue(outcome, {});
  assert.match(issue.body, /Not applicable to live preflight/);
  assert.match(issue.body, /storefront/);
});

test('renderSummary omits the "Not applicable" section entirely when there are no not_applicable rows (regression)', () => {
  const outcome = classifyOutcome({
    results: [{ declaration: 'a.md', http_code: '200', verdict: { pass: true, result: 'no_breach', reason_code: 'ALLOWED' } }],
    handoffState: { status: 'merged', branch: 'compliance-sweep/1' },
    discoverCount: 1,
    inputError: false
  });
  assert.doesNotMatch(renderSummary(outcome), /Not applicable to live preflight/);
});

test('writeArtifact includes the not_applicable array', () => {
  const outcome = classifyOutcome({
    results: [
      { declaration: 'b.md', http_code: 'n/a', verdict: { pass: true, result: 'not_applicable', reason_code: 'NO_ENDPOINT_ACCEPTED_SURFACE', declared_surfaces: ['storefront'] } }
    ],
    handoffState: { status: 'handoff_required', branch: 'compliance-sweep/1' },
    discoverCount: 1,
    inputError: false
  });
  const tmpFile = path.join(os.tmpdir(), `wave-b-artifact-${Date.now()}.json`);
  const artifact = writeArtifact(tmpFile, outcome, {});
  assert.equal(artifact.not_applicable.length, 1);
  const written = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
  assert.equal(written.schema, 'compliance-preflight-sweep-handoff/v1');
  assert.equal(written.not_applicable[0].declaration, 'b.md');
  fs.unlinkSync(tmpFile);
});

test('classifyOutcome: all pass + handoff error status -> handoff_error', () => {
  const outcome = classifyOutcome({
    results: [PASSING_RESULT('a.md')],
    handoffState: { status: 'error', detail: 'git push -u origin failed: remote rejected' },
    discoverCount: 1,
    inputError: false
  });
  assert.equal(outcome.class, 'handoff_error');
  assert.match(outcome.detail, /remote rejected/);
});

test('classifyOutcome: all pass + missing/unrecognized handoff status -> handoff_error (never a silent green)', () => {
  const outcome = classifyOutcome({
    results: [PASSING_RESULT('a.md')],
    handoffState: null,
    discoverCount: 1,
    inputError: false
  });
  assert.equal(outcome.class, 'handoff_error');
});

// --- renderSummary / buildOperatorCommands ------------------------------------------------------

test('renderSummary for handoff_required contains branch, head SHA, and both operator commands', () => {
  const outcome = classifyOutcome({
    results: [PASSING_RESULT('2026-09-01-example.md')],
    handoffState: {
      status: 'handoff_required',
      branch: 'compliance-sweep/33545741502',
      head_sha: 'deadbeefcafef00dfeedfacecafebeef00000001',
      base_sha: 'f00dcafedeadbeeffeedfacecafebeef00000002',
      pr_body: '/tmp/pr-body.md'
    },
    discoverCount: 1,
    inputError: false
  });

  const summary = renderSummary(outcome);
  assert.match(summary, /compliance-sweep\/33545741502/);
  assert.match(summary, /deadbeefcafef00dfeedfacecafebeef00000001/);
  assert.match(summary, /gh pr create --base develop --head compliance-sweep\/33545741502/);
  assert.match(summary, /gh pr merge <N> --merge --delete-branch/);

  const commands = buildOperatorCommands(outcome);
  assert.equal(commands.length, 4);
  assert.match(commands[0], /^gh pr create --base develop --head compliance-sweep\/33545741502/);
});

test('buildOperatorCommands is empty for every non-handoff_required class', () => {
  for (const cls of ['merged', 'nothing_to_reconcile', 'nothing_to_sweep', 'input_error', 'preflight_failed', 'handoff_error']) {
    assert.deepEqual(buildOperatorCommands({ class: cls, handoff: { branch: 'x' } }), []);
  }
});

test('renderSummary renders superseded-branch rows with their action outcome', () => {
  const outcome = classifyOutcome({
    results: [PASSING_RESULT('a.md')],
    handoffState: {
      status: 'merged',
      branch: 'compliance-sweep/33545741502',
      superseded: [
        { branch: 'compliance-sweep/33531804412', action: 'deleted' },
        { branch: 'compliance-sweep/33536811560', action: 'kept_open_pr' },
        { branch: 'compliance-sweep/33542764832', action: 'delete_skipped_pr_query_failed' }
      ]
    },
    discoverCount: 1,
    inputError: false
  });

  const summary = renderSummary(outcome);
  assert.match(summary, /compliance-sweep\/33531804412[\s\S]*deleted/);
  assert.match(summary, /compliance-sweep\/33536811560[\s\S]*kept \(has an open PR\)/);
  assert.match(summary, /compliance-sweep\/33542764832[\s\S]*delete skipped -- open-PR query failed/);
});

// --- renderIssue -----------------------------------------------------------------------------------

test('renderIssue: handoff_required carries the compliance:preflight-handoff label and full content', () => {
  const outcome = classifyOutcome({
    results: [PASSING_RESULT('a.md')],
    handoffState: {
      status: 'handoff_required',
      branch: 'compliance-sweep/33545741502',
      head_sha: 'abc123',
      pr_body: '/tmp/pr-body.md'
    },
    discoverCount: 1,
    inputError: false
  });
  const issue = renderIssue(outcome, { runId: '33545741502' });
  assert.equal(issue.label, 'compliance:preflight-handoff');
  assert.match(issue.title, /handoff_required/);
  assert.match(issue.body, /compliance-sweep\/33545741502/);
  assert.match(issue.body, /gh pr merge <N>/);
});

// #1374 follow-up (found live via #1393): the title must be STABLE across runs -- it is one
// persistent issue per class, updated in place, and embedding a run ID in the title goes stale
// the moment a second run updates the same issue's body without ever touching its title (the
// workflow only calls `gh issue edit --body-file`, never `--title`).
test('renderIssue: the title does not change between two different runs of the same class', () => {
  const outcomeA = classifyOutcome({
    results: [PASSING_RESULT('a.md')],
    handoffState: { status: 'handoff_required', branch: 'compliance-sweep/111' },
    discoverCount: 1,
    inputError: false
  });
  const outcomeB = classifyOutcome({
    results: [PASSING_RESULT('a.md')],
    handoffState: { status: 'handoff_required', branch: 'compliance-sweep/222' },
    discoverCount: 1,
    inputError: false
  });
  const issueA = renderIssue(outcomeA, { runId: '111' });
  const issueB = renderIssue(outcomeB, { runId: '222' });
  assert.equal(issueA.title, issueB.title, 'the title must not embed the run ID');
  assert.doesNotMatch(issueA.title, /\d{5,}/, 'the title must not contain a run-id-shaped number at all');
  // The body, by contrast, is expected to change per run -- that is where the current run's
  // specifics belong.
  assert.notEqual(issueA.body, issueB.body);
});

test('renderIssue: preflight_failed carries the compliance:preflight-failed label and names the failing declaration', () => {
  const outcome = classifyOutcome({
    results: [FAILING_RESULT('2026-08-29-breach.md')],
    handoffState: null,
    discoverCount: 1,
    inputError: false
  });
  const issue = renderIssue(outcome, { runId: '999' });
  assert.equal(issue.label, 'compliance:preflight-failed');
  assert.match(issue.body, /2026-08-29-breach\.md/);
  assert.match(issue.body, /COMPLIANCE_ACTIVATION_REQUIRED/);
});

test('renderIssue: green classes carry no label', () => {
  const outcome = classifyOutcome({ results: null, handoffState: null, discoverCount: 0, inputError: false });
  const issue = renderIssue(outcome, {});
  assert.equal(issue.label, null);
});

// --- writeArtifact ---------------------------------------------------------------------------------

test('writeArtifact writes the compliance-preflight-sweep-handoff/v1 schema to disk', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-preflight-sweep-outcome-test-'));
  const outputPath = path.join(tmpDir, 'handoff.json');

  const outcome = classifyOutcome({
    results: [PASSING_RESULT('a.md')],
    handoffState: { status: 'merged', branch: 'compliance-sweep/1' },
    discoverCount: 1,
    inputError: false
  });
  const artifact = writeArtifact(outputPath, outcome, { runId: '1', ref: 'refs/heads/develop', sha: 'deadbeef' });

  assert.equal(artifact.schema, 'compliance-preflight-sweep-handoff/v1');
  assert.equal(artifact.outcome_class, 'merged');
  assert.equal(artifact.handoff_status, 'merged');

  const written = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(written.outcome_class, 'merged');
  assert.equal(written.run_id, '1');
  assert.equal(written.sha, 'deadbeef');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// --- runReport (the `report` CLI subcommand's testable core) --------------------------------------

test('runReport: nothing_to_sweep renders exit 0 with a non-empty summary and no operator commands', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-preflight-sweep-outcome-test-'));
  const outputPath = path.join(tmpDir, 'artifact.json');
  const issueFilePath = path.join(tmpDir, 'issue.md');

  const result = runReport({
    resultsPath: undefined,
    handoffStatePath: undefined,
    discoverCount: '0',
    inputError: '0',
    outputPath,
    issueFilePath,
    env: {}
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /nothing to sweep/i);
  assert.ok(fs.existsSync(outputPath));
  assert.ok(fs.existsSync(issueFilePath));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('runReport: handoff_required renders exit 2, still non-empty stdout, artifact written', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-preflight-sweep-outcome-test-'));
  const resultsPath = path.join(tmpDir, 'results.json');
  const handoffStatePath = path.join(tmpDir, 'handoff-state.json');
  const outputPath = path.join(tmpDir, 'artifact.json');
  const issueFilePath = path.join(tmpDir, 'issue.md');

  fs.writeFileSync(resultsPath, JSON.stringify([PASSING_RESULT('a.md')]), 'utf8');
  fs.writeFileSync(handoffStatePath, JSON.stringify({
    status: 'handoff_required',
    branch: 'compliance-sweep/42',
    head_sha: 'abc123',
    pr_body: '/tmp/pr-body.md'
  }), 'utf8');

  const result = runReport({
    resultsPath,
    handoffStatePath,
    discoverCount: '1',
    inputError: '0',
    outputPath,
    issueFilePath,
    env: { GITHUB_RUN_ID: '42' }
  });

  assert.equal(result.exitCode, 2);
  assert.ok(result.stdout.length > 0);
  assert.match(result.stdout, /compliance-sweep\/42/);

  const artifact = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(artifact.outcome_class, 'handoff_required');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('runReport: input_error renders exit 0 (the discover step already went red, report only documents it)', () => {
  const result = runReport({
    resultsPath: undefined,
    handoffStatePath: undefined,
    discoverCount: '2',
    inputError: '1',
    outputPath: undefined,
    issueFilePath: undefined,
    env: {}
  });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /input_error/);
});

test('runReport: a malformed results.json produces exit 1 with non-empty stdout, never throws', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-preflight-sweep-outcome-test-'));
  const resultsPath = path.join(tmpDir, 'results.json');
  fs.writeFileSync(resultsPath, '{ not valid json', 'utf8');

  const result = runReport({
    resultsPath,
    handoffStatePath: undefined,
    discoverCount: '3',
    inputError: '0',
    outputPath: path.join(tmpDir, 'artifact.json'),
    issueFilePath: path.join(tmpDir, 'issue.md'),
    env: {}
  });

  assert.equal(result.exitCode, 1);
  assert.ok(result.stdout.length > 0);
  assert.match(result.stdout, /Could not render outcome/);
  // Never crashed -- no artifact/issue file should exist since rendering failed before those writes.
  assert.ok(!fs.existsSync(path.join(tmpDir, 'artifact.json')));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('runReport: a malformed handoff-state.json also produces exit 1 with non-empty stdout', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-preflight-sweep-outcome-test-'));
  const resultsPath = path.join(tmpDir, 'results.json');
  const handoffStatePath = path.join(tmpDir, 'handoff-state.json');
  fs.writeFileSync(resultsPath, JSON.stringify([PASSING_RESULT('a.md')]), 'utf8');
  fs.writeFileSync(handoffStatePath, 'not json at all', 'utf8');

  const result = runReport({
    resultsPath,
    handoffStatePath,
    discoverCount: '1',
    inputError: '0',
    outputPath: undefined,
    issueFilePath: undefined,
    env: {}
  });

  assert.equal(result.exitCode, 1);
  assert.ok(result.stdout.length > 0);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
