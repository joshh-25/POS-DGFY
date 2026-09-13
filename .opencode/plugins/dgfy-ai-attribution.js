// OpenCode's chat.params runs immediately before dispatch and exposes the live model selection.
// The system transform makes the formatter command discoverable to the model; neither hook
// intercepts GitHub commands or blocks a session when attribution cannot be proven.
import { spawnSync } from 'node:child_process';
import path from 'node:path';

function recordFor(worktree, input) {
  const script = path.join(worktree, 'scripts', 'ai-attribution.js');
  const result = spawnSync(process.execPath, [script, 'record', 'opencode'], {
    cwd: worktree,
    input: JSON.stringify({
      sessionId: input?.sessionID,
      worktree,
      providerID: input?.model?.providerID,
      modelID: input?.model?.id,
    }),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  try { return JSON.parse((result.stdout || '').trim() || 'null'); } catch { return null; }
}

function identityLabel(record) {
  if (!record || !Array.isArray(record.identities) || record.identities.length !== 1) return '';
  const identity = record.identities[0];
  return identity?.providerId && identity?.modelId
    ? `${identity.providerId}/${identity.modelId}`
    : '';
}

export default async function dgfyAiAttribution({ worktree }) {
  return {
    'chat.params': async (input) => {
      recordFor(worktree, input);
    },
    'experimental.chat.system.transform': async (input, output) => {
      const record = recordFor(worktree, input);
      const identity = identityLabel(record);
      if (!input?.sessionID || !identity || !Array.isArray(output?.system)) return;
      output.system.push(
        `AI attribution is active for this session (runtime=OpenCode, identity=${identity}). ` +
        `To tag a PR body or comment, run: node scripts/ai-attribution.js format opencode ` +
        `${input.sessionID} <Opened|Review|Addressed> <role>`,
      );
    },
  };
}
