// OpenCode's chat.params runs immediately before dispatch and exposes the live model selection.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
export default async function dgfyAiAttribution({ worktree }) {
  return {
    'chat.params': async (input) => {
      const script = path.join(worktree, 'scripts', 'ai-attribution.js');
      spawnSync(process.execPath, [script, 'record', 'opencode'], {
        cwd: worktree,
        input: JSON.stringify({ sessionId: input.sessionID, worktree, providerID: input.model.providerID, modelID: input.model.id }),
        stdio: ['pipe', 'ignore', 'ignore'],
      });
    },
  };
}
