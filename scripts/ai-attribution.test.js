'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const {
  extractPayload,
  formatTag,
  identityLabel,
  readRecord,
  runtimeLabel,
  valid,
  writeRecord,
} = require('./ai-attribution');

function worktree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgfy-ai-attribution-'));
  execFileSync('git', ['init', '--quiet'], { cwd: dir });
  return dir;
}

test('extracts runtime and canonical model identity for every supported runtime', () => {
  assert.deepEqual(extractPayload('claude-code', { model: 'claude-opus-4-1', session_id: 'a', cwd: '/work' }), {
    runtime: 'claude-code', sessionId: 'a', worktree: '/work', modelId: 'claude-opus-4-1',
  });
  assert.equal(extractPayload('codex', { model: 'gpt-5.6-terra', sessionId: 'b', cwd: '/work' }).modelId, 'gpt-5.6-terra');
  assert.equal(extractPayload('antigravity', { modelName: 'gemini-3-pro', id: 'c', cwd: '/work' }).modelId, 'gemini-3-pro');
  assert.deepEqual(extractPayload('opencode', { providerID: 'openai', modelID: 'gpt-5.6-terra', id: 'd', cwd: '/work' }), {
    runtime: 'opencode', sessionId: 'd', worktree: '/work', providerId: 'openai', modelId: 'gpt-5.6-terra',
  });
  assert.equal(extractPayload('cursor', { model_id: 'cursor-model', session_id: 'e', cwd: '/work' }).modelId, 'cursor-model');
  assert.equal(extractPayload('cursor', { model: 'fallback-model', session_id: 'f', cwd: '/work' }).modelId, 'fallback-model');
});
test('formats runtime and canonical identity without friendly-name guessing', () => {
  const codex = { runtime: 'codex', identities: [{ modelId: 'gpt-5.6-terra' }] };
  const opencode = { runtime: 'opencode', identities: [{ providerId: 'opencode-go', modelId: 'muse-spark-1.3-contributor' }] };
  assert.equal(runtimeLabel('claude-code'), 'Claude Code');
  assert.equal(identityLabel(codex), 'gpt-5.6-terra');
  assert.equal(formatTag(codex, 'Opened', 'worker'), 'Opened by (Codex, gpt-5.6-terra, worker)');
  assert.equal(formatTag(opencode, 'Review', 'pr-reviewer'), 'Review (OpenCode, opencode-go/muse-spark-1.3-contributor, pr-reviewer)');
});
test('refuses blank, expired, and stale records', () => {
  assert.equal(extractPayload('codex', { model: '   ', sessionId: 'x', cwd: '/work' }).modelId, '');
  assert.equal(extractPayload('opencode', { modelID: 'muse-spark-1.3-contributor', sessionId: 'x', cwd: '/work' }).providerId, undefined);
  assert.equal(formatTag(null, 'Opened', 'worker'), '');
  assert.equal(valid({ version: 1, runtime: 'codex', sessionId: 'x', model: 'm', expiresAt: 0 }, Date.now()), false);
});
test('OpenCode refuses a model without a provider identity', () => {
  const cwd = worktree();
  try {
    assert.equal(writeRecord({ runtime: 'opencode', sessionId: 'missing-provider', modelID: 'muse-spark-1.3-contributor', worktree: cwd }, cwd), null);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
test('records are isolated per repo clone and reject a different clone', () => {
  const first = worktree();
  const second = worktree();
  try {
    assert.ok(writeRecord({ runtime: 'codex', sessionId: 'same-session', model: 'gpt-5.6-terra', worktree: first }, first));
    assert.equal(readRecord({ runtime: 'codex', sessionId: 'same-session' }, first)?.identities[0].modelId, 'gpt-5.6-terra');
    assert.equal(readRecord({ runtime: 'codex', sessionId: 'same-session' }, second), null);
    assert.equal(writeRecord({ runtime: 'codex', sessionId: 'bad-tree', model: 'gpt-5.6-terra', worktree: first }, second), null);
  } finally {
    fs.rmSync(first, { recursive: true, force: true });
    fs.rmSync(second, { recursive: true, force: true });
  }
});
test('records are visible across worktrees of the same repo clone', () => {
  // This is the concrete scenario implement/pr-reviewer/promoter/incident-responder all produce:
  // the top-level session runs in the main worktree, then does the actual work (or a subagent
  // does) in a separate `git worktree add` directory of the same clone.
  const main = worktree();
  const linked = path.join(main, 'linked');
  const identity = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  try {
    execFileSync('git', ['commit', '--allow-empty', '--quiet', '-m', 'init'], { cwd: main, env: { ...process.env, ...identity } });
    execFileSync('git', ['worktree', 'add', '--quiet', linked, '-b', 'linked-branch'], { cwd: main });
    assert.ok(writeRecord({ runtime: 'codex', sessionId: 'shared-session', model: 'gpt-5.6-terra', worktree: main }, main));
    assert.equal(readRecord({ runtime: 'codex', sessionId: 'shared-session' }, linked)?.identities[0].modelId, 'gpt-5.6-terra');
  } finally {
    fs.rmSync(linked, { recursive: true, force: true });
    fs.rmSync(main, { recursive: true, force: true });
  }
});
test('Claude SessionStart adapter emits plain text naming the session and the ready format command', () => {
  const cwd = worktree();
  const root = path.resolve(__dirname, '..');
  try {
    const hook = path.join(root, '.claude', 'hooks', 'record-ai-attribution.js');
    const formatter = path.join(root, 'scripts', 'ai-attribution.js');
    const payload = JSON.stringify({ session_id: 'claude-fixture', cwd, model: 'claude-sonnet-4-5' });
    const out = execFileSync(process.execPath, [hook], { cwd, input: payload, encoding: 'utf8' });
    // Must not start with "{" — Claude Code parses a leading "{" as (invalid, here) hook JSON
    // output and drops it instead of adding it to Claude's context. See the hook's own comment.
    assert.ok(!out.startsWith('{'), 'plain-text hook output must not start with "{"');
    assert.match(out, /claude-fixture/);
    assert.match(out, /ai-attribution\.js format claude-code claude-fixture/);
    assert.match(out, /runtime=Claude Code/);
    assert.match(out, /identity=claude-sonnet-4-5/);
    const line = execFileSync(process.execPath, [formatter, 'format', 'claude-code', 'claude-fixture', 'Opened', 'worker'], { cwd, encoding: 'utf8' });
    assert.equal(line, 'Opened by (Claude Code, claude-sonnet-4-5, worker)');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
test('Codex SessionStart adapter emits plain text naming the session and the ready format command', () => {
  const cwd = worktree();
  const root = path.resolve(__dirname, '..');
  try {
    const hook = path.join(root, '.codex', 'hooks', 'session-start.js');
    const formatter = path.join(root, 'scripts', 'ai-attribution.js');
    const payload = JSON.stringify({ session_id: 'codex-fixture', cwd, model: 'gpt-5.6-terra' });
    const out = execFileSync(process.execPath, [hook], { cwd, input: payload, encoding: 'utf8' });
    assert.ok(!out.startsWith('{'), 'plain-text hook output must not start with "{"');
    assert.match(out, /codex-fixture/);
    assert.match(out, /ai-attribution\.js format codex codex-fixture/);
    assert.match(out, /runtime=Codex/);
    assert.match(out, /identity=gpt-5\.6-terra/);
    const line = execFileSync(process.execPath, [formatter, 'format', 'codex', 'codex-fixture', 'Review', 'pr-reviewer'], { cwd, encoding: 'utf8' });
    assert.equal(line, 'Review (Codex, gpt-5.6-terra, pr-reviewer)');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
test('SubagentStart injector hands a subagent the ready format command when a record exists', () => {
  const cwd = worktree();
  const root = path.resolve(__dirname, '..');
  try {
    assert.ok(writeRecord({ runtime: 'claude-code', sessionId: 'sub-fixture', model: 'claude-sonnet-4-5', worktree: cwd }, cwd));
    const injector = path.join(root, '.claude', 'hooks', 'inject-ai-attribution-context.js');
    const payload = JSON.stringify({ session_id: 'sub-fixture', cwd, agent_type: 'pr-reviewer' });
    const out = execFileSync(process.execPath, [injector], { cwd, input: payload, encoding: 'utf8' });
    const parsed = JSON.parse(out);
    assert.equal(parsed.hookSpecificOutput.hookEventName, 'SubagentStart');
    assert.match(parsed.hookSpecificOutput.additionalContext, /sub-fixture/);
    assert.match(parsed.hookSpecificOutput.additionalContext, /runtime=Claude Code/);
    assert.match(parsed.hookSpecificOutput.additionalContext, /identity=claude-sonnet-4-5/);
    assert.match(parsed.hookSpecificOutput.additionalContext, /format claude-code sub-fixture/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('ambiguous sessions fail closed instead of attributing the latest model', () => {
  const cwd = worktree();
  try {
    assert.ok(writeRecord({ runtime: 'opencode', sessionId: 'ambiguous', providerID: 'openai', modelID: 'gpt-5.6-terra', worktree: cwd }, cwd));
    assert.ok(writeRecord({ runtime: 'opencode', sessionId: 'ambiguous', providerID: 'opencode-go', modelID: 'muse-spark-1.3-contributor', worktree: cwd }, cwd, Date.now() + 1));
    const record = readRecord({ runtime: 'opencode', sessionId: 'ambiguous' }, cwd);
    assert.equal(record.identities.length, 2);
    assert.equal(formatTag(record, 'Review', 'pr-reviewer'), '');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('OpenCode plugin records provider/model identity and injects the formatter command', async () => {
  const cwd = worktree();
  const root = path.resolve(__dirname, '..');
  const pluginPath = path.join(cwd, 'dgfy-ai-attribution.mjs');
  try {
    fs.mkdirSync(path.join(cwd, 'scripts'), { recursive: true });
    fs.copyFileSync(path.join(root, 'scripts', 'ai-attribution.js'), path.join(cwd, 'scripts', 'ai-attribution.js'));
    fs.copyFileSync(path.join(root, '.opencode', 'plugins', 'dgfy-ai-attribution.js'), pluginPath);
    const { default: createPlugin } = await import(`${pathToFileURL(pluginPath).href}?fixture=${Date.now()}`);
    const hooks = await createPlugin({ worktree: cwd });
    const input = {
      sessionID: 'opencode-fixture',
      model: { providerID: 'opencode-go', modelID: 'muse-spark-1.3-contributor' },
    };
    await hooks['chat.params'](input);
    const output = { system: [] };
    await hooks['experimental.chat.system.transform'](input, output);
    const record = readRecord({ runtime: 'opencode', sessionId: 'opencode-fixture' }, cwd);
    assert.deepEqual(record.identities, [{ providerId: 'opencode-go', modelId: 'muse-spark-1.3-contributor' }]);
    assert.match(output.system[0], /runtime=OpenCode/);
    assert.match(output.system[0], /format opencode opencode-fixture/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
test('SubagentStart injector stays silent when no record exists', () => {
  const cwd = worktree();
  try {
    const injector = path.join(path.resolve(__dirname, '..'), '.claude', 'hooks', 'inject-ai-attribution-context.js');
    const payload = JSON.stringify({ session_id: 'no-such-session', cwd });
    const out = execFileSync(process.execPath, [injector], { cwd, input: payload, encoding: 'utf8' });
    assert.equal(out, '');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
