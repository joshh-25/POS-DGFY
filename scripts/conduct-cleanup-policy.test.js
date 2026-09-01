const test = require('node:test');
const assert = require('node:assert/strict');

const { decideCleanup } = require('./conduct-cleanup-policy');

function baseInput(overrides = {}) {
  return {
    dispatch: { status: 'succeeded' },
    worktree: { path: '/tmp/wt-child-1' },
    trackedByThisRun: true,
    terminalState: 'settled',
    role: 'builder',
    hasUnpushedCommits: false,
    isDirty: false,
    handoffEvidenceRecorded: true,
    isCurrentOrRoot: false,
    ...overrides,
  };
}

test('success cleanup: clean, pushed, tracked, settled -> close session and remove worktree', () => {
  const result = decideCleanup(baseInput());
  assert.deepEqual(result.actions, ['close-session', 'remove-worktree']);
});

test('active-worker refusal: terminalState active -> retain, regardless of everything else', () => {
  const result = decideCleanup(baseInput({ terminalState: 'active' }));
  assert.deepEqual(result.actions, ['retain']);
  assert.match(result.reason, /active/);
});

test('dirty-worktree refusal: isDirty true -> session closed, worktree retained', () => {
  const result = decideCleanup(baseInput({ isDirty: true }));
  assert.deepEqual(result.actions, ['close-session']);
  assert.match(result.reason, /uncommitted/);
});

test('unrelated-root protection: not tracked by this run -> retain, unconditionally even if clean', () => {
  const result = decideCleanup(baseInput({ trackedByThisRun: false }));
  assert.deepEqual(result.actions, ['retain']);
  assert.match(result.reason, /not tracked/);
});

test('current/root worktree is never manageable, even if every other field looks clean', () => {
  const result = decideCleanup(baseInput({ isCurrentOrRoot: true }));
  assert.deepEqual(result.actions, ['retain']);
  assert.match(result.reason, /current or root/);
});

test('unsettled dispatch -> retain', () => {
  const result = decideCleanup(baseInput({ dispatch: { status: 'running' } }));
  assert.deepEqual(result.actions, ['retain']);
  assert.match(result.reason, /has not settled/);
});

test('failed dispatch -> retain, never force-deleted', () => {
  const result = decideCleanup(baseInput({ dispatch: { status: 'failed' } }));
  assert.deepEqual(result.actions, ['retain']);
  assert.match(result.reason, /failed dispatch/);
});

test('missing handoff evidence -> retain even if settled and clean', () => {
  const result = decideCleanup(baseInput({ handoffEvidenceRecorded: false }));
  assert.deepEqual(result.actions, ['retain']);
  assert.match(result.reason, /handoff evidence/);
});

test('builder with unpushed commits -> session closed, worktree retained (never PR-less removal)', () => {
  const result = decideCleanup(baseInput({ role: 'builder', hasUnpushedCommits: true }));
  assert.deepEqual(result.actions, ['close-session']);
  assert.match(result.reason, /not yet pushed/);
});

test('planner role with no commits skips the push check entirely', () => {
  const result = decideCleanup(baseInput({ role: 'planner', hasUnpushedCommits: true }));
  assert.deepEqual(result.actions, ['close-session', 'remove-worktree']);
});

test('dispatch with no worktree tracked -> close session only', () => {
  const result = decideCleanup(baseInput({ worktree: null }));
  assert.deepEqual(result.actions, ['close-session']);
  assert.match(result.reason, /no worktree tracked/);
});
