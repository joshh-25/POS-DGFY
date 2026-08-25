'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { extractPayload, formatTag, modelLabel, valid, writeRecord, readRecord } = require('./ai-attribution');

function worktree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgfy-ai-attribution-'));
  execFileSync('git', ['init', '--quiet'], { cwd: dir });
  return dir;
}

test('extracts model identity for every supported runtime', () => {
  assert.deepEqual(extractPayload('claude-code', { model: 'claude-opus-4-1', session_id: 'a', cwd: '/work' }).model, 'claude-opus-4-1');
  assert.equal(extractPayload('codex', { model: 'gpt-5.6-terra', sessionId: 'b', cwd: '/work' }).model, 'gpt-5.6-terra');
  assert.equal(extractPayload('antigravity', { modelName: 'gemini-3-pro', id: 'c', cwd: '/work' }).model, 'gemini-3-pro');
  assert.equal(extractPayload('opencode', { provider: 'openai', model: 'gpt-5.6-terra', id: 'd', cwd: '/work' }).model, 'openai/gpt-5.6-terra');
  assert.equal(extractPayload('cursor', { model_id: 'cursor-model', session_id: 'e', cwd: '/work' }).model, 'cursor-model');
  assert.equal(extractPayload('cursor', { model: 'fallback-model', session_id: 'f', cwd: '/work' }).model, 'fallback-model');
});
test('maps verified known models and preserves unknown model IDs', () => {
  assert.equal(modelLabel('gpt-5.6-terra'), 'Codex GPT-5.6 Terra');
  assert.equal(modelLabel('vendor/new-model'), 'vendor/new-model');
  assert.equal(formatTag({ model: 'gpt-5.6-terra' }, 'Opened', 'worker'), 'Opened by (Codex GPT-5.6 Terra, worker)');
  assert.equal(formatTag({ model: 'vendor/new-model' }, 'Review', 'pr-reviewer'), 'Review (vendor/new-model, pr-reviewer)');
});
test('refuses blank, expired, and stale records', () => {
  assert.equal(extractPayload('codex', { model: '   ', sessionId: 'x', cwd: '/work' }).model, '');
  assert.equal(formatTag(null, 'Opened', 'worker'), '');
  assert.equal(valid({ version: 1, runtime: 'codex', sessionId: 'x', model: 'm', expiresAt: 0 }, process.cwd()), false);
});
test('records are isolated per worktree and reject a different worktree', () => {
  const first = worktree();
  const second = worktree();
  try {
    assert.ok(writeRecord({ runtime: 'codex', sessionId: 'same-session', model: 'gpt-5.6-terra', worktree: first }, first));
    assert.equal(readRecord({ runtime: 'codex', sessionId: 'same-session' }, first)?.model, 'gpt-5.6-terra');
    assert.equal(readRecord({ runtime: 'codex', sessionId: 'same-session' }, second), null);
    assert.equal(writeRecord({ runtime: 'codex', sessionId: 'bad-tree', model: 'gpt-5.6-terra', worktree: first }, second), null);
  } finally {
    fs.rmSync(first, { recursive: true, force: true });
    fs.rmSync(second, { recursive: true, force: true });
  }
});
test('Claude SessionStart adapter records a payload that the formatter can use', () => {
  const cwd = worktree();
  const root = path.resolve(__dirname, '..');
  try {
    const hook = path.join(root, '.claude', 'hooks', 'record-ai-attribution.js');
    const formatter = path.join(root, 'scripts', 'ai-attribution.js');
    const payload = JSON.stringify({ session_id: 'claude-fixture', cwd, model: 'claude-sonnet-4-5' });
    const recorded = execFileSync(process.execPath, [hook], { cwd, input: payload, encoding: 'utf8' });
    assert.equal(JSON.parse(recorded).model, 'claude-sonnet-4-5');
    const line = execFileSync(process.execPath, [formatter, 'format', 'claude-code', 'claude-fixture', 'Opened', 'worker'], { cwd, encoding: 'utf8' });
    assert.equal(line, 'Opened by (Claude Sonnet 4.5, worker)');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
