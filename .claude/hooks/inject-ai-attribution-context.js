#!/usr/bin/env node
'use strict';
// SubagentStart adapter. A subagent (pr-reviewer, observer, verifier, or a worktree-isolated
// implement/promoter run) never receives a `model` field on this event — Claude Code's own docs
// say only SessionStart hooks can — so this never *writes* a record. It only *reads* the record
// the top-level session's SessionStart hook already wrote (now visible from any worktree of the
// same repo clone, see scripts/ai-attribution.js's repoStoreFor) and, if valid, hands the subagent
// the ready-to-run format command via SubagentStart's additionalContext — the one JSON field this
// event actually delivers into the subagent's own context. Silent (exits 0, no output) when no
// valid record exists, matching the rest of this mechanism's "never block a session" rule.
const fs = require('node:fs');
const path = require('node:path');
const { readRecord } = require(path.resolve(__dirname, '../../scripts/ai-attribution.js'));

let payload;
try { payload = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { payload = {}; }
const sessionId = payload.session_id || payload.sessionId;
if (!sessionId) process.exit(0);

const cwd = payload.cwd || process.cwd();
let record;
try { record = readRecord({ runtime: 'claude-code', sessionId }, cwd); } catch { record = null; }
if (!record) process.exit(0);

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SubagentStart',
    additionalContext:
      `AI attribution is active for this session (runtime=claude-code, model=${record.model}). ` +
      `To tag a PR body or comment this subagent writes, run: node scripts/ai-attribution.js ` +
      `format claude-code ${sessionId} <Opened|Review|Addressed> <role>`,
  },
}));
