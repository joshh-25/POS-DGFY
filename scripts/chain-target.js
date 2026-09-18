#!/usr/bin/env node

// Pure helpers for the /chain single-worktree campaign skill (#1971).
//
// Covers target resolution/validation (open GitHub issue vs repository-local
// Markdown reference), invocation mode/config parsing, per-slot model
// resolution reporting, and the one-exact-worktree topology decision.
//
// Deliberately has NO knowledge of the `orca` CLI, the network, or GitHub:
// issue open-state and Markdown readability are supplied by the caller (the
// coordinator, which already holds that live evidence), so unit tests never
// need a live Orca server. Slot parsing/strategy reuse
// `scripts/conduct-model-slot.js` rather than cloning its contract.

const {
  parseModelSlot,
  resolveDispatchStrategy,
  formatReportRow,
} = require('./conduct-model-slot');

const CHAIN_MODES = Object.freeze(['plan', 'build']);
const CHAIN_SLOT_NAMES = Object.freeze(['planner', 'worker', 'reviewer']);

// Parses the leading `/chain` target token into { kind: 'issue', number } or
// { kind: 'local-ref', ref }. Never infers a target from a title, branch, or
// nearby issue: anything that is not a bare issue number (or #number) or an
// @-prefixed reference is rejected.
function parseChainTarget(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) {
    return { ok: false, error: 'empty chain target: expected <open-issue-number> or @<repository-local-markdown>' };
  }
  if (text.startsWith('@')) {
    const ref = text.slice(1).trim();
    if (!ref) {
      return { ok: false, error: 'empty markdown reference after "@": expected @<repository-local-markdown>' };
    }
    return { ok: true, kind: 'local-ref', ref };
  }
  const issueMatch = text.match(/^#?(\d+)$/);
  if (issueMatch) {
    const number = Number(issueMatch[1]);
    if (!Number.isSafeInteger(number) || number < 1) {
      return { ok: false, error: `invalid issue number "${text}": expected a positive integer` };
    }
    return { ok: true, kind: 'issue', number };
  }
  return {
    ok: false,
    error: `unresolvable chain target "${text}": expected <open-issue-number> or @<repository-local-markdown>; refusing to infer a target from a title, branch, or nearby issue`,
  };
}

// Validates a repository-local Markdown reference lexically: it must stay
// inside the repository and name a Markdown file. Existence/readability is the
// coordinator's runtime step (a failed read fails the target closed); this
// stays pure so the boundary rule itself is unit-testable.
function validateLocalRef(ref, _options) {
  const text = typeof ref === 'string' ? ref.trim() : '';
  if (!text) {
    return { ok: false, error: 'empty markdown reference' };
  }
  if (text.includes('\0')) {
    return { ok: false, error: `invalid markdown reference "${ref}": contains a NUL byte` };
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(text)) {
    return { ok: false, error: `markdown reference "${ref}" is not repository-local (scheme or absolute URI)` };
  }
  if (text.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(text) || text.startsWith('~')) {
    return { ok: false, error: `markdown reference "${ref}" must be repository-relative, not absolute` };
  }
  if (!text.toLowerCase().endsWith('.md')) {
    return { ok: false, error: `markdown reference "${ref}" must name a Markdown (.md) file` };
  }
  const segments = text.split('/');
  const resolved = [];
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (resolved.length === 0) {
        return { ok: false, error: `markdown reference "${ref}" escapes the repository` };
      }
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  if (resolved.length === 0) {
    return { ok: false, error: `markdown reference "${ref}" names no file` };
  }
  return { ok: true, relative: resolved.join('/') };
}

// Validates an already-parsed issue target against caller-supplied live issue
// state ('OPEN' / 'CLOSED' / null-or-unknown). Closed, nonexistent, and
// unreachable targets all fail closed before any tab or worktree is created.
function validateIssueTarget(parsedTarget, issueState) {
  if (!parsedTarget || parsedTarget.kind !== 'issue') {
    return { ok: false, error: 'issue validation requires a parsed issue target' };
  }
  const state = typeof issueState === 'string' ? issueState.trim().toUpperCase() : '';
  if (!state) {
    return { ok: false, error: `could not resolve issue #${parsedTarget.number} (nonexistent or unreachable) — refusing to start a campaign` };
  }
  if (state === 'OPEN') {
    return { ok: true, number: parsedTarget.number };
  }
  if (state === 'CLOSED') {
    return { ok: false, error: `issue #${parsedTarget.number} is closed — refusing to start a campaign` };
  }
  return { ok: false, error: `unexpected issue state "${issueState}" for #${parsedTarget.number} — failing closed` };
}

const SLOT_FLAGS = Object.freeze({
  '--planner': 'planner',
  '--worker': 'worker',
  '--reviewer': 'reviewer',
});

// Parses `/chain` invocation tokens (everything after `/chain`):
//   /chain 208 --mode build --planner opencode:provider/model --no-auto-merge
//   /chain @.tmp/plan-208.md --plan
//
// Grammar: exactly one leading target positional, then flags only. Mode
// defaults to `plan` (side-effect bounded) and the default is reported via
// modeSource so no mode ever silently creates Worker/Reviewer tabs.
function parseChainInvocation(tokens) {
  const args = Array.isArray(tokens) ? tokens.slice() : [];
  if (args.length === 0) {
    return { ok: false, error: 'missing chain target: expected /chain <open-issue-number> or /chain @<repository-local-markdown>' };
  }
  if (args[0].startsWith('-')) {
    return { ok: false, error: 'missing chain target: the first positional must be <open-issue-number> or @<repository-local-markdown>, not a flag' };
  }
  const target = parseChainTarget(args[0]);
  if (!target.ok) {
    return target;
  }

  let mode;
  let modeSource = 'default';
  const slots = {};
  let autoMerge = true;
  const seenMode = [];
  const seenSlots = new Set();
  let seenNoAutoMerge = false;

  const takeValue = (flag, i) => {
    const value = args[i + 1];
    if (value === undefined || value.startsWith('-')) {
      return { ok: false, error: `option ${flag} requires a value` };
    }
    return { ok: true, value };
  };

  for (let i = 1; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--mode') {
      const taken = takeValue(token, i);
      if (!taken.ok) return taken;
      seenMode.push(taken.value);
      i += 1;
    } else if (token === '--plan' || token === '--build') {
      seenMode.push(token.slice(2));
    } else if (Object.prototype.hasOwnProperty.call(SLOT_FLAGS, token)) {
      const slot = SLOT_FLAGS[token];
      const taken = takeValue(token, i);
      if (!taken.ok) return taken;
      if (seenSlots.has(slot)) {
        return { ok: false, error: `duplicate ${slot} slot specification — refusing ambiguous configuration` };
      }
      if (!taken.value.trim()) {
        return { ok: false, error: `option ${token} requires a non-empty slot tuple (cli:model[:effort])` };
      }
      seenSlots.add(slot);
      slots[slot] = taken.value.trim();
      i += 1;
    } else if (token === '--no-auto-merge') {
      if (seenNoAutoMerge) {
        return { ok: false, error: 'duplicate --no-auto-merge — refusing ambiguous configuration' };
      }
      seenNoAutoMerge = true;
      autoMerge = false;
    } else if (token.startsWith('-')) {
      return { ok: false, error: `unknown chain option "${token}": supported options are --mode plan|build, --plan, --build, --planner/--worker/--reviewer <cli:model[:effort]>, --no-auto-merge` };
    } else {
      return { ok: false, error: `unexpected positional "${token}": /chain takes exactly one target; slot configuration uses --planner/--worker/--reviewer flags` };
    }
  }

  if (seenMode.length > 1) {
    return { ok: false, error: `conflicting mode specifications (${seenMode.join(', ')}) — specify at most one of --mode, --plan, --build` };
  }
  if (seenMode.length === 1) {
    const normalized = String(seenMode[0]).toLowerCase();
    if (!CHAIN_MODES.includes(normalized)) {
      return { ok: false, error: `invalid chain mode "${seenMode[0]}": expected plan or build` };
    }
    mode = normalized;
    modeSource = 'explicit';
  } else {
    mode = 'plan';
  }

  return { ok: true, target, mode, modeSource, slots, autoMerge };
}

// Resolves the configured per-slot tuples through the shared Conduct slot
// parser and dispatch-strategy classifier. Any malformed tuple, unavailable
// CLI, or unclassifiable strategy fails the whole resolution closed: Chain
// never silently substitutes the coordinator runtime, CLI, model, or
// headless strategy. Unset slots are reported (not guessed) for the
// coordinator's documented fallback.
function resolveChainSlots(slotValues, context) {
  const ctx = context || {};
  const knownClis = Array.isArray(ctx.knownClis) ? ctx.knownClis : [];
  if (knownClis.length === 0) {
    return { ok: false, errors: ['slot resolution requires knownClis from the freshly loaded orchestration guide — refusing to validate CLI availability from memory'] };
  }
  const resolved = {};
  const errors = [];
  for (const slot of CHAIN_SLOT_NAMES) {
    const value = slotValues ? slotValues[slot] : undefined;
    if (value === undefined) {
      resolved[slot] = { unset: true };
      continue;
    }
    const parsed = parseModelSlot(value, { knownClis, defaultCli: ctx.defaultCli });
    if (!parsed.ok) {
      errors.push(`slot "${slot}": ${parsed.error}`);
      continue;
    }
    const strategy = resolveDispatchStrategy(parsed, {
      coordinatorCli: ctx.coordinatorCli,
      launchPreferenceClis: ctx.launchPreferenceClis,
      interactiveClis: ctx.interactiveClis,
    });
    if (!strategy.strategy) {
      errors.push(`slot "${slot}": cannot classify dispatch strategy (${strategy.reason}) — failing closed`);
      continue;
    }
    resolved[slot] = {
      ...parsed,
      strategy: strategy.strategy,
      strategyReason: strategy.reason,
      ...(strategy.command ? { interactiveCommand: strategy.command } : {}),
    };
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const lines = ['| Slot | CLI | Model | Effort | Strategy | Source |'];
  for (const slot of CHAIN_SLOT_NAMES) {
    const entry = resolved[slot];
    if (entry.unset) {
      lines.push(`| ${slot.toUpperCase()} | — | — | — | — | unset — coordinator fallback (cheapest/fastest; reviewer differs from builder) |`);
    } else {
      lines.push(formatReportRow(slot.toUpperCase(), entry, 'invocation override'));
    }
  }
  return { ok: true, resolved, report: lines.join('\n') };
}

// Enforces the one-target-one-worktree topology: every Planner, Worker, and
// Reviewer dispatch for a single Chain target must name the same exact Orca
// worktree selector. More than one distinct selector is a sibling-worktree
// violation, never something to reconcile silently.
function assertSingleWorktree(targetLabel, selectors) {
  const list = Array.isArray(selectors) ? selectors : [];
  const distinct = [...new Set(list.filter((s) => typeof s === 'string' && s.length > 0))];
  if (distinct.length > 1) {
    return {
      ok: false,
      error: `chain target "${targetLabel}" uses ${distinct.length} distinct worktree selectors (${distinct.join(', ')}) — refusing sibling planner/worker/reviewer worktrees for one target`,
    };
  }
  return { ok: true, selector: distinct[0], count: list.length };
}

module.exports = {
  CHAIN_MODES,
  CHAIN_SLOT_NAMES,
  parseChainTarget,
  validateLocalRef,
  validateIssueTarget,
  parseChainInvocation,
  resolveChainSlots,
  assertSingleWorktree,
};
