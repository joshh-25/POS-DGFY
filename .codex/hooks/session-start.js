#!/usr/bin/env node
'use strict';
// SessionStart adapter. Mirrors .claude/hooks/record-ai-attribution.js: writes the attribution
// record, then prints plain text (not JSON) naming the session and the ready format command.
// Codex's own SessionStart payload shape (session_id, cwd, model) is confirmed to match Claude
// Code's; whether Codex surfaces a command hook's plain stdout back to the model the same way
// Claude Code does is not confirmed as of this writing — plain text is the safe choice either way
// (worst case it's inert), so this stays deliberately parallel rather than diverging speculatively.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const stdin = fs.readFileSync(0);
const scriptPath = path.resolve(__dirname, '../../scripts/ai-attribution.js');
const result = spawnSync('node', [scriptPath, 'record', 'codex'], { input: stdin, encoding: 'utf8' });
const raw = (result.stdout || '').trim();
if (!raw) process.exit(0); // nothing recorded — stay silent, never block the session

let record;
try { record = JSON.parse(raw); } catch { process.exit(0); }
if (!record || !record.sessionId || !record.model) process.exit(0);

process.stdout.write(
  `AI attribution recorded for this session (runtime=codex, model=${record.model}). ` +
  `To tag a PR body or comment, run: node scripts/ai-attribution.js format codex ` +
  `${record.sessionId} <Opened|Review|Addressed> <role>\n`
);
