#!/usr/bin/env node

// Pure decision logic for Conduct's post-completion session/worktree cleanup (#1306, section 1.8
// of .agents/skills/conduct/SKILL.md). Given a structured snapshot of one tracked dispatch, decides
// which of close-session / remove-worktree actually apply, or retains with a stated reason.
// Deliberately has NO knowledge of the `orca` CLI itself -- the actual `orca orchestration
// worker-release` / `orca worktree rm` calls, and the JSON->input mapping from real `orca` output,
// are not automated here by design (see the SKILL.md section this implements for why: it needs a
// live Orca runtime, real dispatches, real worktrees -- mocking that surface is high-maintenance
// for low signal). This is what a real run's mapped snapshot is checked against before any of
// those commands are issued.
//
// Returns { actions: string[], reason }. `actions` is a subset of
// ['close-session', 'remove-worktree'], or exactly ['retain'] when nothing may proceed --
// `reason` always names why, whether that's a retain reason or a summary of what was decided.

function retain(reason) {
  return { actions: ['retain'], reason };
}

function decideCleanup({
  dispatch,
  worktree,
  trackedByThisRun,
  terminalState,
  role,
  hasUnpushedCommits,
  isDirty,
  handoffEvidenceRecorded,
  isCurrentOrRoot,
} = {}) {
  // Absolute prohibitions first -- unconditional, even if every other field looks clean.
  if (isCurrentOrRoot) {
    return retain('current or root worktree/session is never this run\'s to manage');
  }
  if (!trackedByThisRun) {
    return retain('not tracked as created/opened by this run -- no fallback scan');
  }
  if (terminalState === 'active') {
    return retain('session is still active -- a heartbeat or visible activity means alive, not done');
  }

  const settled = dispatch?.status === 'succeeded' || dispatch?.status === 'failed';
  if (!settled) {
    return retain(`dispatch has not settled (status: ${dispatch?.status ?? 'unknown'})`);
  }
  if (dispatch.status === 'failed') {
    return retain('failed dispatch -- retained and reported, never force-deleted');
  }
  if (!handoffEvidenceRecorded) {
    return retain(`role-appropriate handoff evidence not yet recorded for role "${role}"`);
  }

  // Session close only needs settlement + evidence, independent of any worktree state.
  const actions = ['close-session'];

  if (!worktree) {
    return { actions, reason: 'settled, evidence recorded, no worktree tracked for this dispatch -- closing session only' };
  }
  if (isDirty) {
    return { actions, reason: 'session closed; worktree retained -- uncommitted changes (git status --porcelain not empty)' };
  }
  if (role === 'builder' && hasUnpushedCommits) {
    return { actions, reason: 'session closed; worktree retained -- builder commits not yet pushed to the remote' };
  }

  actions.push('remove-worktree');
  return { actions, reason: 'clean, handoff-safe, tracked by this run, session settled -- closing session and removing worktree' };
}

module.exports = { decideCleanup };
