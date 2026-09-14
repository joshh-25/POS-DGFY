// OpenCode's chat.params runs immediately before dispatch and exposes the live model selection.
// The system transform makes the formatter command discoverable to the model; neither hook
// intercepts GitHub commands or blocks a session when attribution cannot be proven.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

function modelIdentity(input) {
  const model = input?.model;
  return {
    providerID: model?.providerID || input?.providerID,
    modelID: model?.modelID || model?.id || input?.modelID,
  };
}

function recordFor(worktree, input) {
  const script = path.join(worktree, 'scripts', 'ai-attribution.js');
  const { providerID, modelID } = modelIdentity(input);
  const result = spawnSync(process.execPath, [script, 'record', 'opencode'], {
    cwd: worktree,
    input: JSON.stringify({
      sessionId: input?.sessionID,
      worktree,
      providerID,
      modelID,
    }),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  try { return JSON.parse((result.stdout || '').trim() || 'null'); } catch { return null; }
}

export default async function dgfyAiAttribution({ worktree }) {
  const require = createRequire(path.join(worktree, 'scripts', 'ai-attribution.js'));
  let attribution;
  try { attribution = require(path.join(worktree, 'scripts', 'ai-attribution.js')); } catch { attribution = null; }
  const cache = new Map();

  function observedRecord(input) {
    const sessionID = input?.sessionID;
    const { providerID, modelID } = modelIdentity(input);
    const key = `${providerID || ''}\0${modelID || ''}`;
    const cached = sessionID && cache.get(sessionID);
    if (cached?.key === key) return cached.record;
    const record = recordFor(worktree, input);
    if (sessionID) cache.set(sessionID, { key, record });
    return record;
  }

  return {
    'chat.params': async (input) => {
      observedRecord(input);
    },
    'experimental.chat.system.transform': async (input, output) => {
      const record = observedRecord(input);
      const identity = attribution?.identityLabel?.(record) || '';
      if (!input?.sessionID || !identity || !Array.isArray(output?.system)) return;
      output.system.push(
        `AI attribution is active for this session (runtime=OpenCode, identity=${identity}). ` +
        `To tag a PR body or comment, run: node scripts/ai-attribution.js format opencode ` +
        `${input.sessionID} <Opened|Review|Addressed> <role>`,
      );
    },
  };
}
