const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseChainTarget,
  validateLocalRef,
  validateIssueTarget,
  parseChainInvocation,
  resolveChainSlots,
  assertSingleWorktree,
} = require('./chain-target');

const KNOWN_CLIS = ['claude', 'codex', 'opencode', 'cursor', 'antigravity'];
const SLOT_CTX = {
  knownClis: KNOWN_CLIS,
  defaultCli: 'claude',
  coordinatorCli: 'opencode',
  launchPreferenceClis: ['claude', 'codex', 'cursor'],
};

test('target: bare issue number resolves', () => {
  assert.deepEqual(parseChainTarget('208'), { ok: true, kind: 'issue', number: 208 });
});

test('target: #-prefixed issue number normalizes', () => {
  assert.deepEqual(parseChainTarget('#208'), { ok: true, kind: 'issue', number: 208 });
});

test('target: @-prefixed markdown reference resolves', () => {
  assert.deepEqual(parseChainTarget('@.tmp/plan-208.md'), { ok: true, kind: 'local-ref', ref: '.tmp/plan-208.md' });
});

test('target: title text is rejected, never inferred', () => {
  const result = parseChainTarget('Add checkout button');
  assert.equal(result.ok, false);
  assert.match(result.error, /refusing to infer/);
});

test('target: branch-shaped text is rejected, never inferred', () => {
  const result = parseChainTarget('issue-208-planner');
  assert.equal(result.ok, false);
  assert.match(result.error, /unresolvable chain target/);
});

test('target: empty and zero/negative numbers are rejected', () => {
  assert.match(parseChainTarget('').error, /empty chain target/);
  assert.match(parseChainTarget('   ').error, /empty chain target/);
  assert.match(parseChainTarget('@').error, /empty markdown reference/);
  assert.match(parseChainTarget('0').error, /positive integer/);
});

test('local-ref: absolute paths, escapes, URLs, and non-markdown are rejected', () => {
  assert.equal(validateLocalRef('.tmp/plan-208.md').ok, true);
  assert.equal(validateLocalRef('docs/notes/plan.md').ok, true);
  assert.match(validateLocalRef('/tmp/plan.md').error, /repository-relative/);
  assert.match(validateLocalRef('../outside.md').error, /escapes the repository/);
  assert.match(validateLocalRef('docs/../../outside.md').error, /escapes the repository/);
  assert.match(validateLocalRef('https://example.com/plan.md').error, /not repository-local/);
  assert.match(validateLocalRef('.tmp/plan-208.txt').error, /must name a Markdown/);
  assert.match(validateLocalRef('').error, /empty markdown reference/);
});

test('local-ref: inner .. that stays inside resolves lexically', () => {
  assert.deepEqual(validateLocalRef('docs/../.tmp/plan-208.md'), { ok: true, relative: '.tmp/plan-208.md' });
});

test('issue: open passes, closed and unknown fail closed', () => {
  const parsed = parseChainTarget('208');
  assert.deepEqual(validateIssueTarget(parsed, 'OPEN'), { ok: true, number: 208 });
  assert.deepEqual(validateIssueTarget(parsed, 'open'), { ok: true, number: 208 });
  assert.match(validateIssueTarget(parsed, 'CLOSED').error, /is closed/);
  assert.match(validateIssueTarget(parsed, null).error, /nonexistent or unreachable/);
  assert.match(validateIssueTarget(parsed, undefined).error, /nonexistent or unreachable/);
  assert.match(validateIssueTarget(parsed, 'WEIRD').error, /failing closed/);
});

test('invocation: issue target defaults to plan mode, observably', () => {
  const result = parseChainInvocation(['208']);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'plan');
  assert.equal(result.modeSource, 'default');
  assert.equal(result.autoMerge, true);
  assert.deepEqual(result.slots, {});
});

test('invocation: explicit build mode and slot flags parse', () => {
  const result = parseChainInvocation(['208', '--mode', 'build', '--worker', 'opencode:opencode-go/muse-spark-1.3-contributor', '--no-auto-merge']);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'build');
  assert.equal(result.modeSource, 'explicit');
  assert.equal(result.autoMerge, false);
  assert.equal(result.slots.worker, 'opencode:opencode-go/muse-spark-1.3-contributor');
});

test('invocation: --plan/--build shorthands work, conflicts fail', () => {
  assert.equal(parseChainInvocation(['208', '--build']).mode, 'build');
  assert.equal(parseChainInvocation(['208', '--plan']).mode, 'plan');
  assert.match(parseChainInvocation(['208', '--plan', '--build']).error, /conflicting mode/);
  assert.match(parseChainInvocation(['208', '--mode', 'plan', '--build']).error, /conflicting mode/);
  assert.match(parseChainInvocation(['208', '--mode', 'deploy']).error, /invalid chain mode/);
});

test('invocation: malformed and ambiguous combinations are rejected before side effects', () => {
  assert.match(parseChainInvocation([]).error, /missing chain target/);
  assert.match(parseChainInvocation(['--mode', 'build']).error, /missing chain target/);
  assert.match(parseChainInvocation(['208', '--bogus']).error, /unknown chain option/);
  assert.match(parseChainInvocation(['208', 'extra-positional']).error, /exactly one target/);
  assert.match(parseChainInvocation(['208', '--worker', 'a', '--worker', 'b']).error, /duplicate worker/);
  assert.match(parseChainInvocation(['208', '--mode']).error, /requires a value/);
  assert.match(parseChainInvocation(['208', '--no-auto-merge', '--no-auto-merge']).error, /duplicate --no-auto-merge/);
});

test('slots: canonical and legacy tuples resolve with strategy and source reported', () => {
  const result = resolveChainSlots(
    { planner: 'claude:claude-sonnet-5:high', worker: 'opencode:opencode-go/muse-spark-1.3-contributor' },
    SLOT_CTX,
  );
  assert.equal(result.ok, true);
  assert.equal(result.resolved.planner.strategy, 'orca-pty');
  assert.equal(result.resolved.planner.source, 'canonical');
  assert.equal(result.resolved.worker.strategy, 'orca-interactive');
  assert.equal(result.resolved.reviewer.unset, true);
  assert.match(result.report, /\(canonical\)/);
  assert.match(result.report, /unset — coordinator fallback/);
});

test('slots: malformed tuple fails the whole resolution closed', () => {
  const result = resolveChainSlots({ worker: 'claude:' }, SLOT_CTX);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('; '), /slot "worker"/);
});

test('slots: missing strategy context fails closed instead of guessing', () => {
  const result = resolveChainSlots({ worker: 'claude:model' }, { knownClis: KNOWN_CLIS });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('; '), /cannot classify dispatch strategy/);
});

test('slots: missing knownClis fails closed', () => {
  const result = resolveChainSlots({ worker: 'claude:model' }, {});
  assert.equal(result.ok, false);
  assert.match(result.errors.join('; '), /knownClis/);
});

test('topology: one exact selector passes, siblings fail', () => {
  const one = assertSingleWorktree('208', ['id:repo::/path/a', 'id:repo::/path/a']);
  assert.equal(one.ok, true);
  assert.equal(one.selector, 'id:repo::/path/a');
  const none = assertSingleWorktree('208', []);
  assert.equal(none.ok, true);
  assert.equal(none.selector, undefined);
  const siblings = assertSingleWorktree('208', ['id:repo::/path/a', 'id:repo::/path/b']);
  assert.equal(siblings.ok, false);
  assert.match(siblings.error, /refusing sibling/);
});
