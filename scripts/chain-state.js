#!/usr/bin/env node

// Pure Chain campaign lifecycle state for the /chain single-worktree skill
// (#1971). A small versioned machine-readable schema with explicit states for
// target-resolved, plan-ready, worker-active/PR-open, review-active,
// feedback-pending, approved, merged, stopped, and blocked.
//
// Transitions are monotonic and evidence-gated: every editing handoff requires
// the durable artifact the next owner depends on (ready plan before Worker,
// pushed PR before Reviewer, structured findings before Worker follow-up,
// pushed feedback commit before re-review). History is append-only; the only
// backward edge is blocked -> resumable-state recovery, which preserves all
// evidence. No Orca calls happen here — persistence is plain JSON the
// coordinator reads/writes to an ignored local state file.

const CHAIN_STATE_VERSION = 'dgfy-chain-state/v1';

const STATES = Object.freeze([
  'target-resolved',
  'plan-ready',
  'worker-active',
  'review-active',
  'feedback-pending',
  'approved',
  'merged',
  'stopped',
  'blocked',
]);

const TERMINAL_STATES = Object.freeze(['merged', 'stopped']);

// Forward edges enforced by transition(). Edges into feedback-pending,
// approved, merged, stopped, and blocked are wrapper-only (recordFeedbackRound,
// approve, merge, stop/stopAfterApproval, block) so the required evidence is
// always attached; transition() rejects them with a pointer to the wrapper.
const TRANSITIONS = Object.freeze({
  'target-resolved': Object.freeze(['plan-ready']),
  'plan-ready': Object.freeze(['worker-active']),
  'worker-active': Object.freeze(['review-active']),
  'review-active': Object.freeze([]),
  'feedback-pending': Object.freeze(['worker-active']),
  approved: Object.freeze([]),
  merged: Object.freeze([]),
  stopped: Object.freeze([]),
  blocked: Object.freeze([]),
});

function now(at) {
  return at || new Date().toISOString();
}

function fail(error) {
  return { ok: false, error };
}

function createCampaign({ target, mode, autoMerge, worktreeSelector, at } = {}) {
  if (!target || (target.kind !== 'issue' && target.kind !== 'local-ref')) {
    return fail('chain campaign requires a resolved target ({ kind: issue|local-ref, ... })');
  }
  if (mode !== 'plan' && mode !== 'build') {
    return fail(`invalid chain mode "${mode}": expected plan or build`);
  }
  const campaign = {
    version: CHAIN_STATE_VERSION,
    target,
    mode,
    autoMerge: autoMerge !== false,
    state: 'target-resolved',
    worktreeSelector: worktreeSelector || undefined,
    slots: undefined,
    plan: undefined,
    tabs: [],
    branch: undefined,
    pr: undefined,
    feedbackRounds: [],
    verdicts: [],
    merge: undefined,
    stop: undefined,
    blocker: undefined,
    resumableState: undefined,
    history: [{ from: undefined, to: 'target-resolved', at: now(at), reason: 'target resolved' }],
  };
  return { ok: true, campaign };
}

function recordWorktree(campaign, { selector } = {}) {
  if (!selector || !String(selector).trim()) {
    return fail('chain worktree recording requires an exact non-empty worktree selector');
  }
  const next = String(selector).trim();
  if (campaign.worktreeSelector && campaign.worktreeSelector !== next) {
    return fail(`chain worktree selector is already "${campaign.worktreeSelector}" — refusing sibling worktree "${next}" for one target`);
  }
  campaign.worktreeSelector = next;
  return { ok: true, campaign };
}

function recordSlotReport(campaign, { report } = {}) {
  if (!campaign || (campaign.state !== 'target-resolved' && campaign.state !== 'plan-ready')) {
    return fail(`slot report must be recorded before worker start (current state: ${campaign && campaign.state})`);
  }
  if (!report || !String(report).trim()) {
    return fail('slot report recording requires the resolved slot report text');
  }
  campaign.slots = { report: String(report) };
  return { ok: true, campaign };
}

function recordPlan(campaign, { path, status } = {}) {
  if (campaign.state !== 'target-resolved' && campaign.state !== 'plan-ready') {
    return fail(`plan artifact must be recorded before worker start (current state: ${campaign.state})`);
  }
  if (!path || !String(path).trim()) {
    return fail('plan recording requires an artifact path');
  }
  if (!status || !String(status).trim()) {
    return fail('plan recording requires a readiness status');
  }
  campaign.plan = { path: String(path).trim(), status: String(status).trim() };
  return { ok: true, campaign };
}

function recordTab(campaign, { role, terminalHandle, dispatchId } = {}) {
  if (!['planner', 'worker', 'reviewer'].includes(role)) {
    return fail(`invalid chain tab role "${role}": expected planner, worker, or reviewer`);
  }
  if (!terminalHandle && !dispatchId) {
    return fail('tab recording requires a terminal handle and/or dispatch id');
  }
  campaign.tabs.push({ role, terminalHandle, dispatchId });
  return { ok: true, campaign };
}

function recordPr(campaign, { number, branch, url } = {}) {
  if (campaign.state !== 'worker-active') {
    return fail(`PR must be recorded while the worker owns the worktree (current state: ${campaign.state})`);
  }
  if (!Number.isSafeInteger(number) || number < 1) {
    return fail('PR recording requires a positive PR number (the pushed PR, not a local commit)');
  }
  if (!branch || !String(branch).trim()) {
    return fail('PR recording requires the pushed branch');
  }
  campaign.pr = { number, branch: String(branch).trim(), ...(url ? { url: String(url) } : {}) };
  campaign.branch = campaign.pr.branch;
  return { ok: true, campaign };
}

function applyTransition(campaign, to, { reason, at } = {}) {
  const from = campaign.state;
  campaign.state = to;
  campaign.history.push({ from, to, at: now(at), ...(reason ? { reason: String(reason) } : {}) });
  return { ok: true, campaign };
}

// Generic forward transition with per-target evidence gates. Wrapper-only
// targets are rejected here so findings, verdicts, and merge/stop evidence
// can never be skipped.
function transition(campaign, to, options) {
  if (!STATES.includes(to)) {
    return fail(`unknown chain state "${to}": expected one of ${STATES.join(', ')}`);
  }
  if (TERMINAL_STATES.includes(campaign.state)) {
    return fail(`chain campaign is terminal (${campaign.state}) — no further transitions`);
  }
  if (campaign.state === 'blocked') {
    return fail('chain campaign is blocked — use resume() with a reason, not a raw transition');
  }
  if (['feedback-pending', 'approved', 'merged', 'stopped', 'blocked'].includes(to)) {
    return fail(`transition to "${to}" requires its evidence wrapper (recordFeedbackRound, approve, merge, stop/stopAfterApproval, block)`);
  }
  const allowed = TRANSITIONS[campaign.state] || [];
  if (!allowed.includes(to)) {
    return fail(`illegal chain transition ${campaign.state} -> ${to}: only one editing owner at a time, in campaign order`);
  }
  if (to === 'plan-ready') {
    if (!campaign.plan || campaign.plan.status !== 'ready') {
      return fail('worker must not start before the plan is ready: record a plan artifact with status "ready" first');
    }
  }
  if (to === 'worker-active' && !campaign.worktreeSelector) {
    return fail('worker must not start without the exact single-worktree selector recorded');
  }
  if (to === 'review-active') {
    if (!campaign.pr || !campaign.pr.number) {
      return fail('reviewer must not start before the worker has pushed a PR: record the PR first');
    }
    const lastRound = campaign.feedbackRounds[campaign.feedbackRounds.length - 1];
    if (campaign.feedbackRounds.length > 0 && (!lastRound.addressingCommit || lastRound.addressingCommit.pushed !== true)) {
      return fail('reviewer re-review must not start until the worker has pushed its feedback commit');
    }
  }
  return applyTransition(campaign, to, options);
}

function recordFeedbackRound(campaign, { findings, reviewerDispatch, at } = {}) {
  if (campaign.state !== 'review-active') {
    return fail(`feedback rounds start from reviewer findings (current state: ${campaign.state})`);
  }
  if (!findings || !String(findings).trim()) {
    return fail('feedback round requires durable structured reviewer findings — raw terminal text is not a handoff');
  }
  if (!reviewerDispatch || !String(reviewerDispatch).trim()) {
    return fail('feedback round requires the reviewer dispatch handle that produced the findings');
  }
  campaign.feedbackRounds.push({
    findings: String(findings).trim(),
    reviewerDispatch: String(reviewerDispatch).trim(),
    addressingCommit: undefined,
    at: now(at),
  });
  return applyTransition(campaign, 'feedback-pending', { reason: 'reviewer findings delivered', at });
}

function recordAddressingCommit(campaign, { commit, pushed, at } = {}) {
  if (campaign.state !== 'worker-active') {
    return fail(`addressing commits are recorded while the worker owns the worktree (current state: ${campaign.state})`);
  }
  const lastRound = campaign.feedbackRounds[campaign.feedbackRounds.length - 1];
  if (!lastRound) {
    return fail('no feedback round is awaiting a worker follow-up');
  }
  if (lastRound.addressingCommit) {
    return fail('the latest feedback round already has an addressing commit');
  }
  if (!commit || !String(commit).trim()) {
    return fail('addressing commit recording requires the commit SHA');
  }
  if (pushed !== true) {
    return fail('worker follow-up must be pushed before re-review: unpushed addressing commits are not handoff evidence');
  }
  lastRound.addressingCommit = { commit: String(commit).trim(), pushed: true, at: now(at) };
  return { ok: true, campaign };
}

function approve(campaign, { verdict, verdictRef, at } = {}) {
  if (campaign.state !== 'review-active') {
    return fail(`approval lands from reviewer verdict (current state: ${campaign.state})`);
  }
  if (String(verdict || '').trim().toUpperCase() !== 'APPROVE') {
    return fail('only a canonical APPROVE verdict advances a chain campaign — BLOCK findings need recordFeedbackRound');
  }
  if (!verdictRef || !String(verdictRef).trim()) {
    return fail('approval requires the canonical verdict reference (review comment) as durable evidence');
  }
  campaign.verdicts.push({ verdict: 'APPROVE', ref: String(verdictRef).trim(), at: now(at) });
  return applyTransition(campaign, 'approved', { reason: 'reviewer APPROVE', at });
}

function merge(campaign, { mergeRef, base, at } = {}) {
  if (campaign.state !== 'approved') {
    return fail(`merge follows approval (current state: ${campaign.state})`);
  }
  if (campaign.autoMerge === false) {
    return fail('auto-merge is disabled for this campaign (--no-auto-merge): stop after approval with stopAfterApproval() instead');
  }
  if (!mergeRef || !String(mergeRef).trim()) {
    return fail('merge requires the merge result reference as durable evidence');
  }
  if (base && String(base).trim().toLowerCase() === 'main') {
    return fail('chain never merges main: production promotion is a human decision outside this campaign');
  }
  campaign.merge = { ref: String(mergeRef).trim(), ...(base ? { base: String(base).trim() } : {}), at: now(at) };
  return applyTransition(campaign, 'merged', { reason: 'merged under the existing pr-reviewer policy', at });
}

function stopAfterApproval(campaign, { reason, at } = {}) {
  if (campaign.state !== 'approved') {
    return fail(`explicit no-auto-merge stop follows approval (current state: ${campaign.state})`);
  }
  if (!reason || !String(reason).trim()) {
    return fail('explicit stop requires the reason as evidence (e.g. --no-auto-merge)');
  }
  campaign.stop = { reason: String(reason).trim(), afterApproval: true, at: now(at) };
  return applyTransition(campaign, 'stopped', { reason: campaign.stop.reason, at });
}

function stop(campaign, { reason, at } = {}) {
  if (TERMINAL_STATES.includes(campaign.state) || campaign.state === 'blocked') {
    return fail(`cannot stop from ${campaign.state}: terminal campaigns stay terminal, blocked campaigns resume or stop after resume`);
  }
  if (!reason || !String(reason).trim()) {
    return fail('stop requires the reason as evidence');
  }
  campaign.stop = { reason: String(reason).trim(), afterApproval: false, at: now(at) };
  return applyTransition(campaign, 'stopped', { reason: campaign.stop.reason, at });
}

function block(campaign, { blocker, at } = {}) {
  if (TERMINAL_STATES.includes(campaign.state) || campaign.state === 'blocked') {
    return fail(`cannot block from ${campaign.state}`);
  }
  if (!blocker || !String(blocker).trim()) {
    return fail('blocking a campaign requires the unresolved blocker as evidence');
  }
  campaign.resumableState = campaign.state;
  campaign.blocker = String(blocker).trim();
  return applyTransition(campaign, 'blocked', { reason: campaign.blocker, at });
}

function resume(campaign, { reason, at } = {}) {
  if (campaign.state !== 'blocked') {
    return fail(`only a blocked campaign resumes (current state: ${campaign.state})`);
  }
  if (!reason || !String(reason).trim()) {
    return fail('resume requires the reason the blocker is cleared');
  }
  const backTo = campaign.resumableState;
  campaign.blocker = undefined;
  campaign.resumableState = undefined;
  return applyTransition(campaign, backTo, { reason: String(reason).trim(), at });
}

// Renders the recoverable lifecycle report: everything a coordinator (or a
// later session) needs to recover or hand off a paused campaign without
// reconstructing state from terminal titles or tab order.
function summarize(campaign) {
  const lines = [
    `Target: ${campaign.target.kind === 'issue' ? `#${campaign.target.number}` : campaign.target.ref} (mode: ${campaign.mode}, auto-merge: ${campaign.autoMerge !== false ? 'on' : 'off'})`,
    `State: ${campaign.state}`,
    `Worktree: ${campaign.worktreeSelector || '—'}`,
    `Plan: ${campaign.plan ? `${campaign.plan.path} (${campaign.plan.status})` : '—'}`,
    `Branch/PR: ${campaign.pr ? `${campaign.branch} #${campaign.pr.number}` : '—'}`,
    `Tabs: ${campaign.tabs.length > 0 ? campaign.tabs.map((t) => `${t.role}@${t.terminalHandle || t.dispatchId || '?'}`).join(', ') : '—'}`,
    `Feedback rounds: ${campaign.feedbackRounds.length}`,
  ];
  campaign.feedbackRounds.forEach((round, index) => {
    lines.push(`  Round ${index + 1}: findings from ${round.reviewerDispatch} -> ${round.addressingCommit ? round.addressingCommit.commit : 'awaiting worker follow-up'}`);
  });
  lines.push(`Verdicts: ${campaign.verdicts.length > 0 ? campaign.verdicts.map((v) => v.verdict).join(', ') : '—'}`);
  if (campaign.merge) lines.push(`Merge: ${campaign.merge.ref}${campaign.merge.base ? ` (base ${campaign.merge.base})` : ''}`);
  if (campaign.stop) lines.push(`Stop: ${campaign.stop.reason}`);
  if (campaign.blocker) lines.push(`Blocker: ${campaign.blocker}`);
  return lines.join('\n');
}

function serialize(campaign) {
  return JSON.stringify(campaign);
}

function deserialize(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return fail('chain state is not valid JSON — refusing to recover');
  }
  if (!parsed || parsed.version !== CHAIN_STATE_VERSION) {
    return fail(`unsupported chain state version "${parsed && parsed.version}" — expected ${CHAIN_STATE_VERSION}`);
  }
  if (!STATES.includes(parsed.state)) {
    return fail(`unknown chain state "${parsed.state}" in stored state — refusing to recover`);
  }
  if (!Array.isArray(parsed.history) || !Array.isArray(parsed.feedbackRounds)) {
    return fail('stored chain state is missing history or feedback rounds — refusing to recover');
  }
  return { ok: true, campaign: parsed };
}

module.exports = {
  CHAIN_STATE_VERSION,
  STATES,
  TERMINAL_STATES,
  TRANSITIONS,
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
};
