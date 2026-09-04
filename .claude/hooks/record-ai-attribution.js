#!/usr/bin/env node
'use strict';
// SessionStart adapter. Writes the attribution record, then hands the agent the exact command it
// needs to tag its own PR body/comment — this is deliberately plain text, never JSON, because
// Claude Code only adds a SessionStart hook's plain-text stdout to Claude's context; stdout
// starting with "{" is parsed as (invalid, here) structured hook output and silently dropped
// instead. See docs/ai/AI_MODEL_ATTRIBUTION.md.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const stdin = fs.readFileSync(0);
const scriptPath = path.resolve(__dirname, '../../scripts/ai-attribution.js');
const result = spawnSync('node', [scriptPath, 'record', 'claude-code'], { input: stdin, encoding: 'utf8' });
const raw = (result.stdout || '').trim();
if (!raw) process.exit(0); // nothing recorded — stay silent, never block the session

let record;
try { record = JSON.parse(raw); } catch { process.exit(0); }
if (!record || !record.sessionId || !record.model) process.exit(0);

process.stdout.write(
  `AI attribution recorded for this session (runtime=claude-code, model=${record.model}). ` +
  `To tag a PR body or comment, run: node scripts/ai-attribution.js format claude-code ` +
  `${record.sessionId} <Opened|Review|Addressed> <role>\n`
);
