const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CHAIN_STATE_VERSION,
  createCampaign,
  recordWorktree,
  recordSlotReport,
  recordPlan,
  recordTab,
  recordPr,
  transition,
  recordFeedbackRound,
  recordAddressingCommit,
  approve,
  merge,
  stopAfterApproval,
  stop,
  block,
  resume,
  summarize,
  serialize,
  deserialize,
} = require('./chain-state');

const AT = '2026-09-18T00:00:00.000Z';

function freshCampaign(overrides) {
  const created = createCampaign({
    target: { kind: 'issue', number: 208 },
    mode: 'build',
    ...(overrides || {}),
    at: AT,
  });
  assert.equal(created.ok, true);
  return created.campaign;
}

function driveToReview() {
  const c = freshCampaign();
  assert.equal(recordWorktree(c, { selector: 'id:repo::/work/208' }).ok, true);
  assert.equal(recordPlan(c, { path: '.tmp/plan-208.md', status: 'ready' }).ok, true);
  assert.equal(transition(c, 'plan-ready', { at: AT }).ok, true);
  assert.equal(transition(c, 'worker-active', { at: AT }).ok, true);
  assert.equal(recordPr(c, { number: 42, branch: 'feature/chain-208' }).ok, true);
  assert.equal(transition(c, 'review-active', { at: AT }).ok, true);
  return c;
}

test('create: defaults to build-safe shape and rejects bad input', () => {
  const c = freshCampaign({ mode: 'plan' });
  assert.equal(c.version, CHAIN_STATE_VERSION);
  assert.equal(c.state, 'target-resolved');
  assert.equal(c.autoMerge, true);
  assert.match(createCampaign({ mode: 'build' }).error, /resolved target/);
  assert.match(createCampaign({ target: { kind: 'issue', number: 1 }, mode: 'deploy' }).error, /invalid chain mode/);
});

test('happy path: plan -> worker -> review -> approve -> merge', () => {
  const c = driveToReview();
  assert.equal(approve(c, { verdict: 'APPROVE', verdictRef: 'review-comment-1', at: AT }).ok, true);
  assert.equal(c.state, 'approved');
  assert.equal(merge(c, { mergeRef: 'merge-commit-sha', base: 'develop', at: AT }).ok, true);
  assert.equal(c.state, 'merged');
  assert.match(transition(c, 'worker-active', { at: AT }).error, /terminal/);
});

test('auto-merge opt-out: merge refuses, explicit stop records evidence', () => {
  const c = driveToReview();
  c.autoMerge = false;
  assert.equal(approve(c, { verdict: 'APPROVE', verdictRef: 'review-comment-1', at: AT }).ok, true);
  assert.match(merge(c, { mergeRef: 'x', at: AT }).error, /auto-merge is disabled/);
  assert.equal(stopAfterApproval(c, { reason: '--no-auto-merge: stopping after approval', at: AT }).ok, true);
  assert.equal(c.state, 'stopped');
  assert.equal(c.stop.afterApproval, true);
});

test('merge: main is never a chain merge base', () => {
  const c = driveToReview();
  assert.equal(approve(c, { verdict: 'APPROVE', verdictRef: 'r1', at: AT }).ok, true);
  assert.match(merge(c, { mergeRef: 'x', base: 'main', at: AT }).error, /never merges main/);
});

test('gates: worker waits for ready plan, reviewer waits for pushed PR', () => {
  const c = freshCampaign();
  assert.equal(recordWorktree(c, { selector: 'id:repo::/work/208' }).ok, true);
  assert.match(transition(c, 'plan-ready', { at: AT }).error, /before the plan is ready/);
  assert.equal(recordPlan(c, { path: '.tmp/plan-208.md', status: 'needs-decision' }).ok, true);
  assert.match(transition(c, 'plan-ready', { at: AT }).error, /before the plan is ready/);
  assert.equal(recordPlan(c, { path: '.tmp/plan-208.md', status: 'ready' }).ok, true);
  assert.equal(transition(c, 'plan-ready', { at: AT }).ok, true);
  assert.equal(transition(c, 'worker-active', { at: AT }).ok, true);
  assert.match(transition(c, 'review-active', { at: AT }).error, /pushed a PR/);
  assert.match(transition(c, 'review-active', { at: AT }).error, /pushed a PR/);
});

test('gates: worker follow-up waits for durable findings; re-review waits for pushed commit', () => {
  const c = driveToReview();
  assert.match(recordFeedbackRound(c, { findings: '  ', reviewerDispatch: 'd1', at: AT }).error, /durable structured/);
  assert.equal(recordFeedbackRound(c, { findings: 'RF-1 blocker: fix X', reviewerDispatch: 'dispatch:1', at: AT }).ok, true);
  assert.equal(c.state, 'feedback-pending');
  assert.match(transition(c, 'review-active', { at: AT }).error, /one editing owner/);
  assert.equal(transition(c, 'worker-active', { at: AT }).ok, true);
  assert.match(transition(c, 'review-active', { at: AT }).error, /pushed its feedback commit/);
  assert.match(recordAddressingCommit(c, { commit: 'abc', pushed: false, at: AT }).error, /must be pushed/);
  assert.equal(recordAddressingCommit(c, { commit: 'abc123', pushed: true, at: AT }).ok, true);
  assert.equal(transition(c, 'review-active', { at: AT }).ok, true);
  assert.equal(approve(c, { verdict: 'APPROVE', verdictRef: 'r2', at: AT }).ok, true);
  assert.equal(c.feedbackRounds.length, 1);
  assert.equal(c.feedbackRounds[0].addressingCommit.commit, 'abc123');
});

test('approve: non-approve verdicts stay in the feedback loop', () => {
  const c = driveToReview();
  assert.match(approve(c, { verdict: 'BLOCK', verdictRef: 'r1', at: AT }).error, /canonical APPROVE/);
  assert.match(approve(c, { verdict: 'APPROVE', at: AT }).error, /verdict reference/);
  assert.equal(c.state, 'review-active');
});

test('blocked: recovery preserves evidence and returns to the prior owner', () => {
  const c = driveToReview();
  assert.equal(block(c, { blocker: 'orca unavailable', at: AT }).ok, true);
  assert.equal(c.state, 'blocked');
  assert.match(transition(c, 'worker-active', { at: AT }).error, /use resume/);
  assert.match(resume(c, { at: AT }).error, /requires the reason/);
  assert.equal(resume(c, { reason: 'orca back', at: AT }).ok, true);
  assert.equal(c.state, 'review-active');
  assert.equal(c.blocker, undefined);
});

test('stop: active campaigns stop with a reason; terminal ones stay terminal', () => {
  const c = freshCampaign();
  assert.match(stop(c, { at: AT }).error, /requires the reason/);
  assert.equal(stop(c, { reason: 'target invalid', at: AT }).ok, true);
  assert.equal(c.state, 'stopped');
  assert.match(stop(c, { reason: 'again', at: AT }).error, /terminal/);
});

test('worktree: selector is set once and never swapped mid-campaign', () => {
  const c = freshCampaign();
  assert.equal(recordWorktree(c, { selector: 'id:repo::/work/208' }).ok, true);
  assert.equal(recordWorktree(c, { selector: 'id:repo::/work/208' }).ok, true);
  assert.match(recordWorktree(c, { selector: 'id:repo::/work/other' }).error, /refusing sibling worktree/);
});

test('wrappers: direct transitions cannot skip evidence', () => {
  const c = driveToReview();
  assert.match(transition(c, 'feedback-pending', { at: AT }).error, /recordFeedbackRound/);
  assert.match(transition(c, 'approved', { at: AT }).error, /approve/);
  assert.match(transition(c, 'merged', { at: AT }).error, /merge/);
  assert.match(transition(c, 'blocked', { at: AT }).error, /block/);
  assert.match(transition(c, 'bogus', { at: AT }).error, /unknown chain state/);
});

test('evidence: recorders validate role, PR shape, and plan timing', () => {
  const c = freshCampaign();
  assert.match(recordTab(c, { role: 'builder' }).error, /invalid chain tab role/);
  assert.match(recordTab(c, { role: 'worker' }).error, /terminal handle/);
  assert.equal(recordTab(c, { role: 'worker', terminalHandle: 'term_1', dispatchId: 'd1' }).ok, true);
  assert.match(recordPr(c, { number: 1, branch: 'b' }).error, /while the worker owns/);
  assert.match(recordSlotReport(c, {}).error, /slot report recording requires/);
  assert.equal(recordSlotReport(c, { report: '| Slot | … |' }).ok, true);
});

test('summarize: reports recoverable lifecycle evidence without tab titles', () => {
  const c = driveToReview();
  const summary = summarize(c);
  assert.match(summary, /Target: #208/);
  assert.match(summary, /State: review-active/);
  assert.match(summary, /Worktree: id:repo::\/work\/208/);
  assert.match(summary, /\.tmp\/plan-208\.md \(ready\)/);
  assert.match(summary, /feature\/chain-208 #42/);
});

test('persistence: serialize round-trips; foreign versions fail closed', () => {
  const c = driveToReview();
  const back = deserialize(serialize(c));
  assert.equal(back.ok, true);
  assert.equal(back.campaign.state, 'review-active');
  assert.equal(back.campaign.pr.number, 42);
  assert.match(deserialize('not json').error, /not valid JSON/);
  assert.match(deserialize(JSON.stringify({ version: 'v0', state: 'review-active', history: [], feedbackRounds: [] })).error, /unsupported chain state version/);
});
