const test = require('node:test');
const assert = require('node:assert/strict');

const { parseModelSlot, formatReportRow } = require('./conduct-model-slot');

const KNOWN_CLIS = ['claude', 'codex', 'opencode', 'gemini', 'droid', 'grok', 'cursor'];

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
