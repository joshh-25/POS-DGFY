const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CLI_ALIASES,
  formatReportRow,
  normalizeCliAlias,
  parseModelSlot,
  resolveDispatchStrategy,
} = require('./conduct-model-slot');

const KNOWN_CLIS = ['claude', 'codex', 'opencode', 'gemini', 'droid', 'grok', 'cursor', 'antigravity'];

test('canonical: cli:model (2 segments)', () => {
  const result = parseModelSlot('claude:claude-sonnet-5', { knownClis: KNOWN_CLIS });
  assert.deepEqual(result, {
    ok: true,
    cli: 'claude',
    model: 'claude-sonnet-5',
    effort: undefined,
    source: 'canonical',
  });
});

test('canonical: cli:model:effort (3 segments)', () => {
  const result = parseModelSlot('codex:gpt-5.6-luna:medium', { knownClis: KNOWN_CLIS });
  assert.deepEqual(result, {
    ok: true,
    cli: 'codex',
    model: 'gpt-5.6-luna',
    effort: 'medium',
    source: 'canonical',
  });
});

test('legacy: bare model (1 segment), CLI inferred from orchestrator default', () => {
  const result = parseModelSlot('claude-sonnet-5', { knownClis: KNOWN_CLIS, defaultCli: 'claude' });
  assert.equal(result.ok, true);
  assert.equal(result.cli, 'claude');
  assert.equal(result.model, 'claude-sonnet-5');
  assert.equal(result.effort, undefined);
  assert.match(result.source, /^legacy/);
});

test('legacy: model:effort (2 segments), segment 1 is not a known CLI id', () => {
  // The issue's own worked example: claude-sonnet-5:high must NOT be reinterpreted as
  // CLI "claude-sonnet-5" -- it falls to legacy because that string isn't a known dispatch agent.
  const result = parseModelSlot('claude-sonnet-5:high', { knownClis: KNOWN_CLIS, defaultCli: 'claude' });
  assert.equal(result.ok, true);
  assert.equal(result.cli, 'claude');
  assert.equal(result.model, 'claude-sonnet-5');
  assert.equal(result.effort, 'high');
  assert.match(result.source, /^legacy/);
});

test('malformed: empty cli segment', () => {
  const result = parseModelSlot(':claude-sonnet-5', { knownClis: KNOWN_CLIS });
  assert.equal(result.ok, false);
  assert.match(result.error, /empty segment/);
});

test('malformed: empty model segment', () => {
  const result = parseModelSlot('claude:', { knownClis: KNOWN_CLIS });
  assert.equal(result.ok, false);
  assert.match(result.error, /empty segment/);
});

test('malformed: empty effort segment', () => {
  const result = parseModelSlot('claude:claude-sonnet-5:', { knownClis: KNOWN_CLIS });
  assert.equal(result.ok, false);
  assert.match(result.error, /empty segment/);
});

test('malformed: more than 3 segments', () => {
  const result = parseModelSlot('claude:claude-sonnet-5:high:extra', { knownClis: KNOWN_CLIS });
  assert.equal(result.ok, false);
  assert.match(result.error, /more than 3 segments/);
});

test('malformed: empty string', () => {
  const result = parseModelSlot('', { knownClis: KNOWN_CLIS });
  assert.equal(result.ok, false);
  assert.match(result.error, /empty slot value/);
});

test('unavailable CLI: rejected before dispatch, never silently substituted', () => {
  const result = parseModelSlot('copilot:claude-sonnet-5:high', { knownClis: KNOWN_CLIS });
  // "copilot" isn't in the supplied knownClis fixture, so segment 1 doesn't match a known
  // dispatch agent id -> falls to the legacy branch -> requires a resolvable default CLI.
  assert.equal(result.ok, false);
  assert.match(result.error, /more than 2 segments|no CLI segment|not a currently available/);
});

test('unavailable CLI: canonical shape but CLI not in knownClis (2-segment ambiguous case)', () => {
  // A 2-segment value whose segment 1 is NOT a known CLI is legacy, so "copilot:high" would be
  // read as model="copilot", effort="high" with the inferred default CLI. To exercise a real
  // "malformed CLI, fail before dispatch" case, use 3 segments so it can't fall back to legacy.
  const result = parseModelSlot('copilot:claude-sonnet-5:high', { knownClis: KNOWN_CLIS, defaultCli: 'claude' });
  assert.equal(result.ok, false);
  assert.match(result.error, /more than 2 segments/);
});

test('per-slot override parses through the identical function', () => {
  const envValue = parseModelSlot('claude:claude-sonnet-5:high', { knownClis: KNOWN_CLIS });
  const overrideValue = parseModelSlot('codex:gpt-5.6-luna:medium', { knownClis: KNOWN_CLIS });
  assert.equal(envValue.ok, true);
  assert.equal(overrideValue.ok, true);
  assert.notEqual(envValue.cli, overrideValue.cli);
});

test('formatReportRow: canonical row has no legacy callout', () => {
  const parsed = parseModelSlot('claude:claude-sonnet-5:high', { knownClis: KNOWN_CLIS });
  const row = formatReportRow('WORKER_PLANNER', parsed, 'env');
  assert.match(row, /\(canonical\)/);
  assert.doesNotMatch(row, /legacy/);
});

test('formatReportRow: legacy row carries the mandatory verify callout', () => {
  const parsed = parseModelSlot('gpt-5.6-luna:medium', { knownClis: KNOWN_CLIS, defaultCli: 'claude' });
  const row = formatReportRow('REVIEWER', parsed, 'env');
  assert.match(row, /\*\*legacy\*\*/);
  assert.match(row, /verify/);
});

test('formatReportRow: error row surfaces the failure, never silently omitted', () => {
  const parsed = parseModelSlot('claude:claude-sonnet-5:high:extra', { knownClis: KNOWN_CLIS });
  const row = formatReportRow('WORKER_BUILDER', parsed, 'env');
  assert.match(row, /ERROR/);
});

test('alias canonical: agy:claude-sonnet-5:high normalizes to antigravity', () => {
  const result = parseModelSlot('agy:claude-sonnet-5:high', { knownClis: KNOWN_CLIS });
  assert.equal(result.ok, true);
  assert.equal(result.cli, 'antigravity');
  assert.notEqual(result.cli, 'agy');
});

test('alias canonical: agy:claude-sonnet-5 normalizes to antigravity', () => {
  const result = parseModelSlot('agy:claude-sonnet-5', { knownClis: KNOWN_CLIS });
  assert.equal(result.ok, true);
  assert.equal(result.cli, 'antigravity');
  assert.equal(result.effort, undefined);
});

test('alias legacy default CLI normalizes to antigravity', () => {
  const result = parseModelSlot('claude-sonnet-5:high', { knownClis: KNOWN_CLIS, defaultCli: 'agy' });
  assert.equal(result.ok, true);
  assert.equal(result.cli, 'antigravity');
  assert.match(result.source, /^legacy/);
});

test('alias unavailable: normalization does not bypass known CLI gate', () => {
  const knownWithoutAntigravity = KNOWN_CLIS.filter((cli) => cli !== 'antigravity');
  const result = parseModelSlot('agy:claude-sonnet-5:high', { knownClis: knownWithoutAntigravity });
  assert.equal(result.ok, false);
  assert.match(result.error, /more than 2 segments/);
});

test('normalizeCliAlias maps agy to antigravity', () => {
  assert.equal(normalizeCliAlias('agy'), 'antigravity');
  assert.equal(CLI_ALIASES.agy, 'antigravity');
});

test('normalizeCliAlias passes through non-aliased CLI ids', () => {
  assert.equal(normalizeCliAlias('claude'), 'claude');
});

test('normalizeCliAlias trims before mapping', () => {
  assert.equal(normalizeCliAlias('  agy  '), 'antigravity');
});

test('resolveDispatchStrategy: coordinator match is Tier 1 short-circuit', () => {
  const result = resolveDispatchStrategy(
    { cli: 'antigravity' },
    { coordinatorCli: 'antigravity', launchPreferenceClis: ['claude', 'codex', 'cursor'] },
  );
  assert.equal(result.strategy, 'in-session');
});

test('resolveDispatchStrategy: launch preference match is Tier 2', () => {
  const result = resolveDispatchStrategy(
    { cli: 'claude' },
    { coordinatorCli: 'codex', launchPreferenceClis: ['claude', 'codex', 'cursor'] },
  );
  assert.equal(result.strategy, 'orca-pty');
});

test('resolveDispatchStrategy: no launch preference is Tier 3', () => {
  const result = resolveDispatchStrategy(
    { cli: 'antigravity' },
    { coordinatorCli: 'codex', launchPreferenceClis: ['claude', 'codex', 'cursor'] },
  );
  assert.equal(result.strategy, 'direct-cli');
});

test('resolveDispatchStrategy normalizes alias input independently', () => {
  const result = resolveDispatchStrategy(
    { cli: 'agy' },
    { coordinatorCli: 'antigravity', launchPreferenceClis: ['claude', 'codex', 'cursor'] },
  );
  assert.equal(result.strategy, 'in-session');
});

// #1826: the defect this guards against. A Claude coordinator resolving a slot to `claude` (or a
// Codex coordinator resolving a slot to `codex`) must NOT fall back to in-session Tier 1 just
// because the coordinator happens to already be that CLI -- in-session native-subagent dispatch
// does not reliably honor a per-slot --model override (it inherits the coordinating session's own
// model), so a configured "claude:claude-sonnet-5" slot would silently run as whatever model the
// coordinator itself happens to be (e.g. Opus). Orca's external worker-start does honor --model,
// so Tier 2 must win whenever Orca can dispatch the resolved cli at all.
test('resolveDispatchStrategy: launch-preference support wins over coordinator match (Tier 2 over Tier 1) for claude', () => {
  const result = resolveDispatchStrategy(
    { cli: 'claude' },
    { coordinatorCli: 'claude', launchPreferenceClis: ['claude', 'codex', 'cursor'] },
  );
  assert.equal(result.strategy, 'orca-pty');
});

test('resolveDispatchStrategy: launch-preference support wins over coordinator match (Tier 2 over Tier 1) for codex', () => {
  const result = resolveDispatchStrategy(
    { cli: 'codex' },
    { coordinatorCli: 'codex', launchPreferenceClis: ['claude', 'codex', 'cursor'] },
  );
  assert.equal(result.strategy, 'orca-pty');
});

test('resolveDispatchStrategy: antigravity coordinator + antigravity slot still uses Tier 1 -- Orca has no launch-preference support for it, unaffected by the #1826 fix', () => {
  const result = resolveDispatchStrategy(
    { cli: 'antigravity' },
    { coordinatorCli: 'antigravity', launchPreferenceClis: ['claude', 'codex', 'cursor'] },
  );
  assert.equal(result.strategy, 'in-session');
});

test('resolveDispatchStrategy reports missing launch preferences without guessing', () => {
  const result = resolveDispatchStrategy({ cli: 'claude' }, { coordinatorCli: 'codex' });
  assert.equal(result.strategy, undefined);
  assert.match(result.reason, /launchPreferenceClis/);
});

test('resolveDispatchStrategy reports missing CLI without guessing', () => {
  const result = resolveDispatchStrategy({}, { coordinatorCli: 'codex', launchPreferenceClis: ['claude'] });
  assert.equal(result.strategy, undefined);
  assert.match(result.reason, /no cli/);
});

test('resolveDispatchStrategy accepts omitted coordinator CLI', () => {
  const result = resolveDispatchStrategy({ cli: 'claude' }, { launchPreferenceClis: ['claude'] });
  assert.equal(result.strategy, 'orca-pty');
});

test('formatReportRow surfaces computed strategy', () => {
  const parsed = parseModelSlot('claude:claude-sonnet-5:high', { knownClis: KNOWN_CLIS });
  const row = formatReportRow(
    'WORKER_PLANNER',
    {
      ...parsed,
      strategy: 'orca-pty',
      strategyReason: 'Tier 2 standard supervised dispatch',
    },
    'env',
  );
  assert.match(row, /orca-pty \(Tier 2 standard supervised dispatch\)/);
});

test('formatReportRow uses a placeholder when strategy is not computed', () => {
  const parsed = parseModelSlot('claude:claude-sonnet-5:high', { knownClis: KNOWN_CLIS });
  const row = formatReportRow('WORKER_PLANNER', parsed, 'env');
  assert.match(row, /\| — \| env/);
  assert.doesNotMatch(row, /undefined/);
});

test('formatReportRow error row keeps a consistent six-column shape', () => {
  const parsed = parseModelSlot('claude:claude-sonnet-5:high:extra', { knownClis: KNOWN_CLIS });
  const row = formatReportRow('WORKER_BUILDER', parsed, 'env');
  assert.equal(row.split('|').length, 8);
});
