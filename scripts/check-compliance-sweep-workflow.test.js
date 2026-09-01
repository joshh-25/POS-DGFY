const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// #1374 Wave 4: regression coverage for .github/workflows/compliance-preflight-sweep.yml's
// supervised-handoff redesign (Waves 2-3, commits 31d516ff5 / 5a56cf9ce). Regex/text assertions
// over the live YAML file -- matching the style of scripts/check-runner-routing.test.js (a
// readRealFile helper feeding a real, on-disk workflow into structural checks), but without a
// separate checker module: every assertion here is small and single-purpose enough to live inline,
// unlike check-runner-routing.js's much larger cross-file job.

const WORKFLOW_PATH = path.resolve(__dirname, '..', '.github', 'workflows', 'compliance-preflight-sweep.yml');

function readWorkflow() {
  return fs.readFileSync(WORKFLOW_PATH, 'utf8');
}

/** Ordered list of every job step's name, as they appear in the file. */
function getStepNames(text) {
  return [...text.matchAll(/^ {6}- name: (.+)$/gm)].map((m) => m[1].trim());
}

/** The full text of one named step, from its `- name:` line up to (not including) the next step
 * at the same indentation, or end of file. Throws if the step isn't found -- a missing step is a
 * real regression, not something to silently skip past. */
function getStepBlock(text, stepName) {
  const nameLine = `- name: ${stepName}`;
  const startIdx = text.indexOf(nameLine);
  assert.notEqual(startIdx, -1, `step not found: ${stepName}`);
  const searchFrom = startIdx + nameLine.length;
  const rest = text.slice(searchFrom);
  const nextMatch = rest.match(/\n {6}- name: /);
  const endIdx = nextMatch ? searchFrom + nextMatch.index : text.length;
  return text.slice(startIdx, endIdx);
}

const workflowText = readWorkflow();

// --- hard-fail step: present and last, with its guard --------------------------------------------

test('the hard-fail step ("Fail the run on any bad result") is the LAST step in the job', () => {
  const names = getStepNames(workflowText);
  assert.ok(names.length > 0);
  assert.equal(names[names.length - 1], 'Fail the run on any bad result');
});

test('the hard-fail step still guards on steps.sweep.outputs.overall_fail == \'1\'', () => {
  const block = getStepBlock(workflowText, 'Fail the run on any bad result');
  assert.match(block, /if: steps\.sweep\.outputs\.overall_fail == '1'/);
});

// --- report step: always(), invokes the report subcommand -----------------------------------------

test('"Report sweep outcome" is if: always()', () => {
  const block = getStepBlock(workflowText, 'Report sweep outcome');
  assert.match(block, /if: always\(\)/);
});

test('"Report sweep outcome" invokes report-preflight-sweep-outcome.js\'s report subcommand', () => {
  const block = getStepBlock(workflowText, 'Report sweep outcome');
  assert.match(block, /node scripts\/report-preflight-sweep-outcome\.js report\b/);
});

test('"Report sweep outcome" maps its own exit 2 to a warning + exit 0, not a second failure', () => {
  const block = getStepBlock(workflowText, 'Report sweep outcome');
  assert.match(block, /report_exit.*=.*"2"/);
  assert.match(block, /::warning::/);
});

// --- handoff step: dual guard ---------------------------------------------------------------------

test('the handoff step ("Push reconciliation branch and open PR or hand off") guards on BOTH count != \'0\' and overall_fail == \'0\'', () => {
  const block = getStepBlock(workflowText, 'Push reconciliation branch and open PR or hand off');
  const ifLineMatch = block.match(/^\s*if: (.+)$/m);
  assert.ok(ifLineMatch, 'no if: line found on the handoff step');
  const ifLine = ifLineMatch[1];
  assert.match(ifLine, /steps\.discover\.outputs\.count != '0'/);
  assert.match(ifLine, /steps\.sweep\.outputs\.overall_fail == '0'/);
});

// --- set +e immediately precedes gh pr create, set -e follows -------------------------------------

test('set +e immediately precedes `gh pr create`, and set -e follows once its exit code is captured', () => {
  const block = getStepBlock(workflowText, 'Push reconciliation branch and open PR or hand off');
  assert.match(
    block,
    /set \+e\n\s*PR_URL=\$\(gh pr create[\s\S]*?\)\n\s*pr_create_exit=\$\?\n\s*set -e/
  );
});

// --- classify-pr-create wired in, the live policy-block string never inlined into the YAML --------

test('the workflow invokes classify-pr-create rather than pattern-matching gh pr create\'s stderr itself', () => {
  assert.match(workflowText, /report-preflight-sweep-outcome\.js classify-pr-create --exit-code/);
});

test('the live "not permitted to create or approve pull requests" policy string is never inlined into the YAML', () => {
  // That string is pinned exactly once, in scripts/report-preflight-sweep-outcome.js's
  // POLICY_BLOCKED_PATTERN -- inlining a second copy here would let the two silently drift.
  assert.doesNotMatch(workflowText, /not permitted to create or approve pull requests/);
});

// --- git push origin --delete: exactly once, inside the numeric-branch-prefix guard, after push -u -

test('`git push origin --delete` appears exactly once in the whole workflow', () => {
  const matches = workflowText.match(/git push origin --delete/g) || [];
  assert.equal(matches.length, 1);
});

test('`git push origin --delete` is inside the numeric compliance-sweep/[0-9]* guard, and comes after `git push -u origin`', () => {
  const pushUIdx = workflowText.indexOf('git push -u origin "$BRANCH"');
  const guardIdx = workflowText.indexOf('compliance-sweep/[0-9]*');
  const deleteIdx = workflowText.indexOf('git push origin --delete');
  assert.notEqual(pushUIdx, -1);
  assert.notEqual(guardIdx, -1);
  assert.notEqual(deleteIdx, -1);
  assert.ok(pushUIdx < guardIdx, '`git push -u origin` must come before the numeric-prefix guard');
  assert.ok(guardIdx < deleteIdx, '`git push origin --delete` must come after the numeric-prefix guard, not before it');
});

// --- discover: full-tree git ls-files, no develop..main diff --------------------------------------

test('the discover step uses `git ls-files` for auto-discovery', () => {
  const block = getStepBlock(workflowText, 'Discover NOT-EXECUTED-* declarations');
  assert.match(block, /git ls-files -- "\$DECLARATIONS_DIR"/);
});

test('the discover step no longer diffs origin/main..origin/develop (the permanent blind spot #1374 replaced)', () => {
  const block = getStepBlock(workflowText, 'Discover NOT-EXECUTED-* declarations');
  assert.doesNotMatch(block, /git diff --name-only origin\/main origin\/develop/);
  assert.doesNotMatch(block, /git fetch origin main develop/);
});

// --- permissions: issues: write present --------------------------------------------------------

test('permissions includes issues: write', () => {
  const permissionsBlock = workflowText.match(/^permissions:\n([\s\S]*?)\n\S/m);
  assert.ok(permissionsBlock, 'no top-level permissions: block found');
  assert.match(permissionsBlock[1], /^\s*issues: write\s*$/m);
});

test('permissions still includes contents: write (implies read -- gh issue create needs it)', () => {
  const permissionsBlock = workflowText.match(/^permissions:\n([\s\S]*?)\n\S/m);
  assert.ok(permissionsBlock);
  assert.match(permissionsBlock[1], /^\s*contents: write\s*$/m);
});

// --- labels: created once by hand, never by this workflow -----------------------------------------

test('the workflow never runs `gh label create` -- compliance:preflight-handoff/failed are created once by hand', () => {
  assert.doesNotMatch(workflowText, /gh label create/);
});

test('the workflow references both expected labels by name', () => {
  assert.match(workflowText, /compliance:preflight-handoff/);
  assert.match(workflowText, /compliance:preflight-failed/);
});

// --- upload/publish steps: present, correctly guarded ----------------------------------------------

test('"Upload handoff artifact" and "Publish handoff issue" both run at always() && count != \'0\'', () => {
  for (const name of ['Upload handoff artifact', 'Publish handoff issue']) {
    const block = getStepBlock(workflowText, name);
    const ifLineMatch = block.match(/^\s*if: (.+)$/m);
    assert.ok(ifLineMatch, `no if: line found on "${name}"`);
    assert.match(ifLineMatch[1], /always\(\)/);
    assert.match(ifLineMatch[1], /steps\.discover\.outputs\.count != '0'/);
  }
});

// --- step ordering sanity: teardown and the hard-fail step stay last, in that relative order -------

test('Report sweep outcome / Upload handoff artifact / Publish handoff issue / Tear down / Fail the run appear in that relative order', () => {
  const names = getStepNames(workflowText);
  const ordered = [
    'Report sweep outcome',
    'Upload handoff artifact',
    'Publish handoff issue',
    'Tear down fixture and containers',
    'Fail the run on any bad result'
  ];
  const indices = ordered.map((n) => names.indexOf(n));
  assert.ok(indices.every((i) => i !== -1), `one or more steps missing: ${JSON.stringify(ordered)}`);
  for (let i = 1; i < indices.length; i += 1) {
    assert.ok(indices[i - 1] < indices[i], `${ordered[i - 1]} must come before ${ordered[i]}`);
  }
});
