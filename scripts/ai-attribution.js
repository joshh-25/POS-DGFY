#!/usr/bin/env node
'use strict';

// Local, ephemeral attribution only. A record is accepted only when the runtime,
// session, resolved worktree, model, and expiry all agree.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const VERSION = 1;
const TTL_MS = 8 * 60 * 60 * 1000;
const RUNTIMES = new Set(['claude-code', 'codex', 'antigravity', 'opencode', 'cursor']);
const FRIENDLY_MODELS = Object.freeze({
  'claude-opus-4-1': 'Claude Opus 4.1',
  'claude-sonnet-4-5': 'Claude Sonnet 4.5',
  'gpt-5.6-terra': 'Codex GPT-5.6 Terra',
  'gpt-5.6-sol': 'Codex GPT-5.6 Sol',
  'gpt-5.6-luna': 'Codex GPT-5.6 Luna',
  'gemini-3-pro': 'Gemini 3 Pro',
});

function field(payload, names) {
  for (const name of names) {
    const value = payload?.[name] ?? payload?.session?.[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function extractPayload(runtime, payload) {
  const model = runtime === 'antigravity'
    ? field(payload, ['modelName'])
    : runtime === 'opencode'
      ? [field(payload, ['provider', 'providerID']), field(payload, ['model', 'modelID', 'id'])].filter(Boolean).join('/')
      : runtime === 'cursor'
        ? field(payload, ['model_id', 'model'])
        : field(payload, ['model']);
  return {
    runtime,
    sessionId: field(payload, ['session_id', 'sessionId', 'id']),
    worktree: field(payload, ['worktree', 'cwd', 'directory', 'project_dir']),
    model,
  };
}

function git(args, cwd) { return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim(); }
function rootFor(cwd) { return fs.realpathSync(git(['rev-parse', '--show-toplevel'], cwd)); }
// Shared across every worktree of one clone — unlike --absolute-git-dir, which is per-worktree
// (each `git worktree add` gets its own .git/worktrees/<name>/). Storing here, keyed only on
// (runtime, sessionId), is what lets a role running in a dedicated worktree (implement,
// pr-reviewer, promoter, incident-responder all branch this way per their own SKILL.md files)
// still see a record the top-level session wrote in the main worktree. Cross-*repo* isolation
// still holds: two independent clones resolve to two different common-dirs, hence two different
// storage locations, with no shared key space at all. See docs/ai/AI_MODEL_ATTRIBUTION.md.
function repoStoreFor(cwd) { return fs.realpathSync(path.resolve(cwd, git(['rev-parse', '--git-common-dir'], cwd))); }
function recordPath(record, cwd) {
  const key = crypto.createHash('sha256').update(`${record.runtime}\0${record.sessionId}`).digest('hex');
  return path.join(repoStoreFor(cwd), 'ai-attribution', 'sessions', `${key}.json`);
}
function valid(record, now = Date.now()) {
  if (!record || record.version !== VERSION || !RUNTIMES.has(record.runtime) || !record.sessionId || !record.model) return false;
  return Number.isFinite(record.expiresAt) && record.expiresAt > now;
}
function writeRecord(payload, cwd = process.cwd(), now = Date.now()) {
  const record = extractPayload(payload.runtime, payload);
  if (!RUNTIMES.has(record.runtime) || !record.sessionId || !record.model) return null;
  let suppliedRoot;
  try { suppliedRoot = fs.realpathSync(record.worktree || cwd); } catch { return null; }
  const root = rootFor(cwd);
  if (suppliedRoot !== root) return null; // the hook's own payload must match where it's actually running
  record.worktree = root; // informational only now — not part of the storage key or validity check
  record.version = VERSION;
  record.createdAt = now;
  record.expiresAt = now + TTL_MS;
  const target = recordPath(record, cwd);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  fs.renameSync(temp, target);
  return record;
}
function readRecord(input, cwd = process.cwd(), now = Date.now()) {
  const probe = { runtime: input.runtime, sessionId: input.sessionId };
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(recordPath(probe, cwd), 'utf8')); } catch { return null; }
  return valid(parsed, now) && parsed.runtime === input.runtime && parsed.sessionId === input.sessionId ? parsed : null;
}
function modelLabel(model) { return FRIENDLY_MODELS[model] || model; }
function formatTag(record, action, role) {
  if (!record || !action || !role) return '';
  return action === 'Opened'
    ? `Opened by (${modelLabel(record.model)}, ${role})`
    : `${action} (${modelLabel(record.model)}, ${role})`;
}
function main() {
  const [command, runtime, sessionId, action, role] = process.argv.slice(2);
  if (command === 'record') {
    try {
      const stdin = fs.readFileSync(0, 'utf8').trim();
      const record = writeRecord({ ...JSON.parse(stdin || '{}'), runtime });
      if (record) process.stdout.write(JSON.stringify(record));
    } catch { /* attribution must never block a session */ }
    return;
  }
  if (command === 'format') {
    try { const line = formatTag(readRecord({ runtime, sessionId }), action, role); if (line) process.stdout.write(line); } catch { /* omit unproven attribution */ }
  }
}
if (require.main === module) main();
module.exports = { VERSION, TTL_MS, extractPayload, writeRecord, readRecord, valid, formatTag, modelLabel };
