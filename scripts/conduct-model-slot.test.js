const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CLI_ALIASES,
  INTERACTIVE_ADAPTERS,
  buildInteractiveCommand,
  formatReportRow,
  getInteractiveAdapter,
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

test('resolveDispatchStrategy: coordinator match is Tier 1 only when no interactive adapter is enabled', () => {
  // `grok` has no launch-preference support and no registered interactive adapter, so a
  // matching coordinator is still Tier 1. (For adapter-backed CLIs see the #1964 cases
  // below: interactive launch wins over coordinator match.)
  const result = resolveDispatchStrategy(
    { cli: 'grok' },
    { coordinatorCli: 'grok', launchPreferenceClis: ['claude', 'codex', 'cursor'] },
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

test('resolveDispatchStrategy: no launch preference and no interactive adapter is Tier 3', () => {
  // `grok` has neither launch-preference support nor a registered interactive adapter.
  const result = resolveDispatchStrategy(
    { cli: 'grok' },
    { coordinatorCli: 'codex', launchPreferenceClis: ['claude', 'codex', 'cursor'] },
  );
  assert.equal(result.strategy, 'direct-cli');
});

test('resolveDispatchStrategy normalizes alias input independently', () => {
  const result = resolveDispatchStrategy(
    { cli: 'agy', model: 'gemini-3.8-flash' },
    { coordinatorCli: 'antigravity', launchPreferenceClis: ['claude', 'codex', 'cursor'] },
  );
  assert.equal(result.strategy, 'orca-interactive');
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

test('resolveDispatchStrategy: antigravity coordinator + antigravity slot uses Tier 2B -- interactive launch wins over in-session (#1964)', () => {
  // Supersedes the pre-#1964 expectation: Orca can launch `agy --model ...` interactively
  // in a visible terminal, so falling back to in-session would silently substitute the
  // coordinator's model and lose the visible external session -- the same fidelity argument
  // as #1826, applied to custom-command launch.
  const result = resolveDispatchStrategy(
    { cli: 'antigravity', model: 'gemini-3.8-flash', effort: 'medium' },
    { coordinatorCli: 'antigravity', launchPreferenceClis: ['claude', 'codex', 'cursor'] },
  );
  assert.equal(result.strategy, 'orca-interactive');
  assert.match(result.command, /agy --model gemini-3\.8-flash --effort medium/);
});

test('resolveDispatchStrategy: explicitly disabled interactive list preserves Tier 1 for a matching coordinator', () => {
  const result = resolveDispatchStrategy(
    { cli: 'antigravity' },
    { coordinatorCli: 'antigravity', launchPreferenceClis: ['claude', 'codex', 'cursor'], interactiveClis: [] },
  );
  assert.equal(result.strategy, 'in-session');
});

test('resolveDispatchStrategy: explicitly disabled interactive list preserves Tier 3 otherwise', () => {
  const result = resolveDispatchStrategy(
    { cli: 'antigravity' },
    { coordinatorCli: 'codex', launchPreferenceClis: ['claude', 'codex', 'cursor'], interactiveClis: [] },
  );
  assert.equal(result.strategy, 'direct-cli');
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

// #1964: interactive custom-command launch (Tier 2B, `orca-interactive`) for CLIs whose
// model/effort argv Orca's `worker-start` cannot express but whose own TUI accepts.

test('resolveDispatchStrategy: opencode resolves to orca-interactive with the exact model command', () => {
  const result = resolveDispatchStrategy(
    { cli: 'opencode', model: 'opencode-go/muse-spark-1.3-contributor' },
    { coordinatorCli: 'codex', launchPreferenceClis: ['claude', 'codex', 'cursor'] },
  );
  assert.equal(result.strategy, 'orca-interactive');
  assert.equal(result.command, 'opencode --model opencode-go/muse-spark-1.3-contributor');
  assert.match(result.reason, /Tier 2B/);
});

test('resolveDispatchStrategy: opencode wins over coordinator match too (visible session, exact model)', () => {
  const result = resolveDispatchStrategy(
    { cli: 'opencode', model: 'opencode-go/muse-spark-1.3-contributor' },
    { coordinatorCli: 'opencode', launchPreferenceClis: ['claude', 'codex', 'cursor'] },
  );
  assert.equal(result.strategy, 'orca-interactive');
});

test('resolveDispatchStrategy: launch-preference support still wins over interactive (Tier 2 over Tier 2B)', () => {
  // Synthetic overlap: even if a launch-preference CLI were also adapter-backed,
  // supervised `worker-start` remains the standard path.
  const result = resolveDispatchStrategy(
    { cli: 'claude', model: 'claude-sonnet-5' },
    {
      coordinatorCli: 'codex',
      launchPreferenceClis: ['claude', 'codex', 'cursor'],
      interactiveClis: ['claude', 'opencode', 'antigravity'],
    },
  );
  assert.equal(result.strategy, 'orca-pty');
});

test('resolveDispatchStrategy: narrowed interactive list excludes unlisted adapters', () => {
  const result = resolveDispatchStrategy(
    { cli: 'opencode', model: 'opencode-go/muse-spark-1.3-contributor' },
    {
      coordinatorCli: 'codex',
      launchPreferenceClis: ['claude', 'codex', 'cursor'],
      interactiveClis: ['antigravity'],
    },
  );
  assert.equal(result.strategy, 'direct-cli');
});

test('resolveDispatchStrategy: enabled-but-unregistered interactive CLI fails closed, never substitutes', () => {
  const result = resolveDispatchStrategy(
    { cli: 'grok' },
    {
      coordinatorCli: 'codex',
      launchPreferenceClis: ['claude', 'codex', 'cursor'],
      interactiveClis: ['grok'],
    },
  );
  assert.equal(result.strategy, undefined);
  assert.match(result.reason, /fail closed/);
});

test('resolveDispatchStrategy: orca-interactive reason distinguishes launch-preference, interactive, and headless paths', () => {
  const interactive = resolveDispatchStrategy(
    { cli: 'opencode', model: 'opencode-go/muse-spark-1.3-contributor' },
    { coordinatorCli: 'codex', launchPreferenceClis: ['claude', 'codex', 'cursor'] },
  );
  const headless = resolveDispatchStrategy(
    { cli: 'grok' },
    { coordinatorCli: 'codex', launchPreferenceClis: ['claude', 'codex', 'cursor'] },
  );
  assert.match(interactive.reason, /no launch-preference support.*registered interactive adapter/);
  assert.match(headless.reason, /no launch-preference support and no enabled interactive adapter/);
  assert.notEqual(interactive.reason, headless.reason);
});

test('buildInteractiveCommand: opencode forwards the exact provider/model', () => {
  const built = buildInteractiveCommand('opencode', { model: 'opencode-go/muse-spark-1.3-contributor' });
  assert.equal(built.ok, true);
  assert.deepEqual(built.argv, ['opencode', '--model', 'opencode-go/muse-spark-1.3-contributor']);
  assert.equal(built.command, 'opencode --model opencode-go/muse-spark-1.3-contributor');
});

test('buildInteractiveCommand: opencode records but never forwards effort (no TUI flag exists)', () => {
  const built = buildInteractiveCommand('opencode', { model: 'opencode-go/muse-spark-1.3-contributor', effort: 'high' });
  assert.equal(built.ok, true);
  assert.deepEqual(built.argv, ['opencode', '--model', 'opencode-go/muse-spark-1.3-contributor']);
  assert.match(built.effortNote, /recorded, not forwarded/);
});

test('buildInteractiveCommand: antigravity forwards model and effort', () => {
  const built = buildInteractiveCommand('antigravity', { model: 'gemini-3.8-flash', effort: 'medium' });
  assert.equal(built.ok, true);
  assert.equal(built.command, 'agy --model gemini-3.8-flash --effort medium');
});

test('buildInteractiveCommand: antigravity omits effort when unset (inherits CLI default)', () => {
  const built = buildInteractiveCommand('agy', { model: 'gemini-3.8-flash' });
  assert.equal(built.ok, true);
  assert.equal(built.command, 'agy --model gemini-3.8-flash');
});

test('buildInteractiveCommand: antigravity rejects unsupported effort instead of forwarding it', () => {
  const built = buildInteractiveCommand('antigravity', { model: 'gemini-3.8-flash', effort: 'xhigh' });
  assert.equal(built.ok, false);
  assert.match(built.error, /unsupported antigravity effort.*low\|medium\|high/);
});

test('buildInteractiveCommand: missing model fails closed', () => {
  const built = buildInteractiveCommand('opencode', {});
  assert.equal(built.ok, false);
  assert.match(built.error, /requires an exact model/);
});

test('buildInteractiveCommand: unregistered CLI fails closed', () => {
  const built = buildInteractiveCommand('grok', { model: 'grok-4' });
  assert.equal(built.ok, false);
  assert.match(built.error, /no registered interactive adapter/);
});

test('buildInteractiveCommand quotes argv with shell-special characters', () => {
  const built = buildInteractiveCommand('opencode', { model: 'my provider/model v2' });
  assert.equal(built.ok, true);
  assert.equal(built.command, `opencode --model 'my provider/model v2'`);
});

test('getInteractiveAdapter normalizes aliases and returns undefined for unknown CLIs', () => {
  assert.equal(getInteractiveAdapter('agy'), INTERACTIVE_ADAPTERS.antigravity);
  assert.equal(getInteractiveAdapter('opencode'), INTERACTIVE_ADAPTERS.opencode);
  assert.equal(getInteractiveAdapter('grok'), undefined);
});

test('interactive adapter aliases stay in sync with CLI_ALIASES', () => {
  const adapterAliases = Object.fromEntries(
    Object.values(INTERACTIVE_ADAPTERS).flatMap((adapter) =>
      adapter.aliases.map((alias) => [alias, adapter.cli]),
    ),
  );
  assert.deepEqual(adapterAliases, { ...CLI_ALIASES });
});

test('interactive adapters expose readiness, trust, and fallback contract fields', () => {
  for (const adapter of Object.values(INTERACTIVE_ADAPTERS)) {
    assert.equal(typeof adapter.executable, 'string');
    assert.equal(adapter.readiness.waitFor, 'tui-idle');
    assert.equal(typeof adapter.readiness.timeoutMs, 'number');
    assert.equal(typeof adapter.trust, 'string');
    assert.equal(typeof adapter.fallback, 'string');
    assert.equal(typeof adapter.buildArgs, 'function');
  }
});
