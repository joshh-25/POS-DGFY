#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const path = require('node:path');

function readInput() {
  try {
    return JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

function firstWorkspacePath(input) {
  return Array.isArray(input.workspacePaths) ? input.workspacePaths.find(Boolean) : undefined;
}

function main() {
  const input = readInput();
  const sessionId = typeof input.conversationId === 'string' ? input.conversationId.trim() : '';
  const worktree = firstWorkspacePath(input);
  const modelName = typeof input.modelName === 'string' ? input.modelName.trim() : '';

  // "auto" is a selection mode, not a verified model identity. Never emit a
  // misleading attribution when Antigravity has not resolved the selection.
  if (!sessionId || !worktree || !modelName || modelName.toLowerCase() === 'auto') return;

  const core = path.resolve(__dirname, '../../scripts/ai-attribution.js');
  const result = spawnSync(process.execPath, [core, 'record', 'antigravity'], {
    cwd: worktree,
    input: JSON.stringify({ session_id: sessionId, cwd: worktree, modelName }),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],
  });

  if (result.status !== 0 || !result.stdout) return;

  try {
    const record = JSON.parse(result.stdout.trim());
    const identity = record.identities?.length === 1 ? record.identities[0].modelId : '';
    if (!record.sessionId || !identity || record.runtime !== 'antigravity') return;
    process.stdout.write(JSON.stringify({
      injectSteps: [{
        ephemeralMessage:
          `AI attribution recorded for this session (runtime=Antigravity, identity=${identity}). ` +
          `To tag a PR body or comment, run: node scripts/ai-attribution.js format antigravity ` +
          `${record.sessionId} <Opened|Review|Addressed> <role>`,
      }],
    }));
  } catch {
    // Hooks must not interrupt the host CLI if attribution itself fails.
  }
}

main();
