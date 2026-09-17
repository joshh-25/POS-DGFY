#!/usr/bin/env node

// Parses a Conduct model-slot value (WORKER_PLANNER / WORKER_BUILDER / REVIEWER, or an
// invocation-time per-slot override) into the exact Orca dispatch tuple: { cli, model, effort }.
// See .agents/skills/conduct/SKILL.md section "Resolve the models" for the algorithm this
// implements. `knownClis`/`defaultCli` are always caller-supplied at run time from the freshly
// loaded orchestration guide and the runtime-identity detection — never hardcoded here (#1306).

// Shorthand aliases for a dispatch-agent id, normalized before any matching.
const CLI_ALIASES = Object.freeze({ agy: 'antigravity' });

// Interactive custom-command adapters (#1964). A CLI listed here can be launched
// interactively in an Orca terminal with its OWN model/effort argv even though Orca's
// `worker-start` has no `--model`/`--effort` launch-preference support for it. This is a
// separate capability from launch-preference support: missing `worker-start` flags must
// never be read as "this CLI cannot run interactively through Orca".
//
// Each adapter is a data-driven contract (CLI id/aliases, executable, model/effort argv
// builder, readiness/trust expectations, fallback policy). The argv shapes below were
// verified against the installed CLIs' own `--help` output at implementation time -- do
// not extend them from memory; re-verify with `--help` when flags drift. Actual Orca
// lifecycle calls (`terminal create`, `terminal wait`, `dispatch --inject`,
// `worker-start --terminal`) live in the Conduct procedure
// (.agents/skills/conduct/SKILL.md Tier 2B), never here: this module stays pure and
// testable, classifying strategy and building the exact command string only.
const INTERACTIVE_ADAPTERS = Object.freeze({
  opencode: Object.freeze({
    cli: 'opencode',
    aliases: Object.freeze([]),
    executable: 'opencode',
    // `opencode --model provider/model` starts the interactive TUI with the exact model
    // (verified via `opencode --help`: `-m, --model model to use in the format of
    // provider/model`). The TUI exposes no `--effort` flag, so a configured effort is
    // recorded, never forwarded -- see buildInteractiveCommand's effortNote.
    supportsEffortArg: false,
    supportedEfforts: Object.freeze([]),
    readiness: Object.freeze({ waitFor: 'tui-idle', timeoutMs: 60000 }),
    trust: 'no workspace-trust prompt observed for opencode; if one appears, resolve it before injection and re-wait for readiness',
    fallback: 'direct-cli headless (`opencode run <message> --model <model>`) only where the invocation explicitly permits fallback',
    buildArgs({ model } = {}) {
      if (!model || !String(model).trim()) {
        return { ok: false, error: 'opencode interactive launch requires an exact model (provider/model)' };
      }
      return { ok: true, argv: ['--model', String(model).trim()] };
    },
  }),
  antigravity: Object.freeze({
    cli: 'antigravity',
    aliases: Object.freeze(['agy']),
    executable: 'agy',
    // Bare `agy --model <model> [--effort <effort>]` starts the interactive TUI session
    // (verified via `agy --help`: `--model`, `--effort (low|medium|high)`; `--print` is
    // the non-interactive mode and must NOT be used for interactive launch).
    supportsEffortArg: true,
    supportedEfforts: Object.freeze(['low', 'medium', 'high']),
    readiness: Object.freeze({ waitFor: 'tui-idle', timeoutMs: 60000 }),
    trust: 'first launch in a fresh worktree shows the normal workspace-trust confirmation; confirm it explicitly, re-wait for readiness, then inject -- never let the trust prompt consume the task',
    fallback: 'direct-cli headless (`agy --print --model <model> --effort <effort>`) or in-session only where the invocation explicitly permits fallback',
    buildArgs({ model, effort } = {}) {
      if (!model || !String(model).trim()) {
        return { ok: false, error: 'antigravity interactive launch requires an exact model' };
      }
      const argv = ['--model', String(model).trim()];
      if (effort !== undefined) {
        const normalizedEffort = String(effort).trim();
        if (!['low', 'medium', 'high'].includes(normalizedEffort)) {
          return { ok: false, error: `unsupported antigravity effort "${effort}" -- supported: low|medium|high` };
        }
        argv.push('--effort', normalizedEffort);
      }
      return { ok: true, argv };
    },
  }),
});

function getInteractiveAdapter(cli) {
  const normalized = normalizeCliAlias(cli);
  return INTERACTIVE_ADAPTERS[normalized];
}

function quoteShellArg(arg) {
  const text = String(arg);
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

// Builds the exact interactive terminal command for a CLI with a registered adapter.
// Returns { ok: true, command, argv, executable, effortNote } or { ok: false, error }.
// Preview surfaces (dry runs, report rows) may display `command`; only an explicit
// dispatch step may execute it -- an unsent preview is never completion evidence.
function buildInteractiveCommand(cli, { model, effort } = {}) {
  const adapter = getInteractiveAdapter(cli);
  const normalized = normalizeCliAlias(cli);
  if (!adapter) {
    return { ok: false, error: `no registered interactive adapter for "${normalized || cli}"` };
  }
  const built = adapter.buildArgs({ model, effort });
  if (!built.ok) {
    return built;
  }
  const argv = [adapter.executable, ...built.argv];
  const effortNote = adapter.supportsEffortArg
    ? undefined
    : (effort === undefined
      ? 'no effort configured'
      : `effort "${effort}" recorded, not forwarded -- the ${adapter.executable} TUI exposes no --effort flag`);
  return {
    ok: true,
    command: argv.map(quoteShellArg).join(' '),
    argv,
    executable: adapter.executable,
    ...(effortNote ? { effortNote } : {}),
  };
}

function normalizeCliAlias(cli) {
  if (typeof cli !== 'string') return cli;
  const trimmed = cli.trim();
  return CLI_ALIASES[trimmed] || trimmed;
}

function parseModelSlot(value, { knownClis, defaultCli } = {}) {
  const known = new Set(
    (Array.isArray(knownClis) ? knownClis : []).map(normalizeCliAlias),
  );
  const raw = typeof value === 'string' ? value : '';
  const trimmed = raw.trim();

  if (!trimmed) {
    return { ok: false, error: 'empty slot value' };
  }

  const segments = trimmed.split(':');

  if (segments.length > 3) {
    return { ok: false, error: `malformed slot value "${raw}": more than 3 segments` };
  }
  if (segments.some((segment) => segment.trim().length === 0)) {
    return { ok: false, error: `malformed slot value "${raw}": empty segment` };
  }

  // Rule 3: 2+ segments AND segment 1 matches a currently known dispatch agent id -> canonical.
  const canonicalCli = normalizeCliAlias(segments[0]);
  if (segments.length >= 2 && known.has(canonicalCli)) {
    const [, model, effort] = segments;
    const cli = canonicalCli;
    return { ok: true, cli, model, effort: effort || undefined, source: 'canonical' };
  }

  // Rule 4: otherwise -> legacy. model[:effort], CLI inferred (never guessed as segment 1).
  if (segments.length > 2) {
    return { ok: false, error: `malformed legacy slot value "${raw}": more than 2 segments` };
  }
  const [model, effort] = segments;
  const normalizedDefaultCli = normalizeCliAlias(defaultCli);
  if (!normalizedDefaultCli) {
    return {
      ok: false,
      error: `legacy slot value "${raw}" has no CLI segment and no default CLI could be inferred`,
    };
  }
  if (!known.has(normalizedDefaultCli)) {
    return {
      ok: false,
      error: `inferred default CLI "${normalizedDefaultCli}" for legacy slot value "${raw}" is not a currently available dispatch agent`,
    };
  }
  return {
    ok: true,
    cli: normalizedDefaultCli,
    model,
    effort: effort || undefined,
    source: `legacy (CLI inferred from orchestrator default: ${normalizedDefaultCli})`,
  };
}

// Classifies how an already-resolved slot is dispatched across Conduct's execution tiers.
//
// Priority (strict order, #1826 then #1964):
//   Tier 2 (orca-pty) -- Orca `worker-start` launch-preference support, checked FIRST.
//   Tier 2B (orca-interactive) -- registered interactive custom-command adapter, checked
//     SECOND, winning over coordinator match whenever interactive launch is available.
//   Tier 1 (in-session) -- coordinator already runs the CLI AND Orca has neither
//     launch-preference support nor an interactive adapter for it.
//   Tier 3 (direct-cli) -- headless fallback, only when no external path exists at all.
//
// #1826: Orca launch-preference support (Tier 2) is checked BEFORE coordinator match (Tier 1) --
// not the other way around. A coordinator already running the resolved `cli` is not sufficient by
// itself to justify in-session dispatch when Orca can dispatch that exact `cli` externally with the
// requested model/effort (true today for claude/codex/cursor): Claude's (and Codex's) native
// in-session subagent dispatch does not reliably honor a per-slot --model override -- it inherits
// the coordinating session's own model -- while Orca's external worker-start does. Tier 1 remains
// correct, and is the ONLY viable option, when Orca has no launch-preference support at all for the
// resolved cli (today: antigravity) and the coordinator happens to already be running it.
//
// #1964: the same fidelity argument extends to interactive custom-command launch (Tier 2B). A
// missing `worker-start --model/--effort` pair does not imply a missing interactive CLI: Orca can
// still create a worktree and launch the CLI's own TUI with its own model/effort argv in a visible
// terminal (verified for opencode/antigravity). Tier 2B therefore wins over Tier 1 whenever an
// interactive adapter is registered and enabled -- in-session execution would silently substitute
// the coordinator's model and lose the visible external session. Tier 2B never wins over Tier 2:
// supervised `worker-start` remains the standard path wherever it applies.
function resolveDispatchStrategy({ cli, model, effort } = {}, { coordinatorCli, launchPreferenceClis, interactiveClis } = {}) {
  const normalizedCli = normalizeCliAlias(cli);
  if (!normalizedCli) {
    return { strategy: undefined, reason: 'no cli given -- cannot classify strategy' };
  }

  if (!Array.isArray(launchPreferenceClis)) {
    return {
      strategy: undefined,
      reason: 'launchPreferenceClis not supplied -- cannot distinguish Tier 2 (orca-pty) from Tier 2B/1/3 fallback',
    };
  }
  const launchPrefSet = new Set(launchPreferenceClis.map(normalizeCliAlias));
  if (launchPrefSet.has(normalizedCli)) {
    return {
      strategy: 'orca-pty',
      reason: `Orca worker-start supports launch preferences for "${normalizedCli}" -- Tier 2, standard supervised dispatch (preferred over in-session even when the coordinator already runs "${normalizedCli}", since in-session native-subagent dispatch does not reliably honor a per-slot model override)`,
    };
  }

  // Interactive capability is a repo-side registry (verified per-CLI argv builders above),
  // not Orca-side launch-preference support, so it defaults to the built-in registry when
  // the caller does not narrow it. Pass an explicit list to narrow (e.g. after flag drift
  // removes a CLI) or [] to mark interactive launch unavailable for this run.
  const interactiveList = Array.isArray(interactiveClis)
    ? interactiveClis.map(normalizeCliAlias)
    : Object.keys(INTERACTIVE_ADAPTERS);
  if (interactiveList.includes(normalizedCli)) {
    const built = buildInteractiveCommand(normalizedCli, { model, effort });
    if (!built.ok) {
      return {
        strategy: undefined,
        reason: `interactive custom-command launch for "${normalizedCli}" is enabled but cannot be constructed (${built.error}) -- fail closed: report this and use the documented headless fallback only where the invocation explicitly permits fallback; never silently substitute a different CLI/model`,
      };
    }
    const effortSuffix = built.effortNote ? ` (${built.effortNote})` : '';
    return {
      strategy: 'orca-interactive',
      command: built.command,
      reason: `Orca worker-start has no launch-preference support for "${normalizedCli}", but a registered interactive adapter launches \`${built.command}\` in a visible Orca terminal with the exact selected model -- Tier 2B, preferred over in-session even when the coordinator already runs "${normalizedCli}", since in-session execution would not honor the per-slot model and would lose the visible external session${effortSuffix}`,
    };
  }

  const normalizedCoordinatorCli = coordinatorCli ? normalizeCliAlias(coordinatorCli) : undefined;
  if (normalizedCoordinatorCli && normalizedCli === normalizedCoordinatorCli) {
    return {
      strategy: 'in-session',
      reason: `Orca has no launch-preference support and no enabled interactive adapter for "${normalizedCli}", and the coordinator's own runtime already matches it -- Tier 1, no external dispatch possible`,
    };
  }

  return {
    strategy: 'direct-cli',
    reason: `Orca has no launch-preference support and no enabled interactive adapter for "${normalizedCli}" -- Tier 3, direct-CLI headless fallback`,
  };
}

function formatReportRow(slotName, parsed, origin) {
  if (!parsed.ok) {
    return `| ${slotName} | — | — | — | — | **ERROR** — ${parsed.error} |`;
  }
  const legacyNote = parsed.source.startsWith('legacy')
    ? ` (**legacy** — no CLI segment; ${parsed.source.slice('legacy '.length)}, not asserted by the user — verify)`
    : ' (canonical)';
  const strategyCell = parsed.strategy
    ? parsed.strategyReason
      ? `${parsed.strategy} (${parsed.strategyReason})`
      : parsed.strategy
    : '—';
  return `| ${slotName} | ${parsed.cli} | ${parsed.model} | ${parsed.effort || '—'} | ${strategyCell} | ${origin}${legacyNote} |`;
}

function main() {
  const args = process.argv.slice(2);
  const value = args[0];
  if (!value || value.startsWith('--')) {
    console.error('usage: conduct-model-slot.js <slot-value> --known-clis a,b,c [--default-cli cli] [--coordinator-cli cli] [--launch-pref-clis a,b,c] [--interactive-clis a,b,c]');
    process.exit(2);
  }
  let knownClis = [];
  let defaultCli;
  let coordinatorCli;
  let launchPreferenceClis;
  let interactiveClis;
  let strategyContextProvided = false;
  for (let i = 1; i < args.length; i += 1) {
    if (args[i] === '--known-clis' && args[i + 1]) {
      knownClis = args[i + 1].split(',').map(normalizeCliAlias).filter(Boolean);
      i += 1;
    } else if (args[i] === '--default-cli' && args[i + 1]) {
      defaultCli = normalizeCliAlias(args[i + 1]);
      i += 1;
    } else if (args[i] === '--coordinator-cli' && args[i + 1]) {
      coordinatorCli = normalizeCliAlias(args[i + 1]);
      strategyContextProvided = true;
      i += 1;
    } else if (args[i] === '--launch-pref-clis' && args[i + 1]) {
      launchPreferenceClis = args[i + 1].split(',').map(normalizeCliAlias).filter(Boolean);
      strategyContextProvided = true;
      i += 1;
    } else if (args[i] === '--interactive-clis' && args[i + 1]) {
      interactiveClis = args[i + 1].split(',').map(normalizeCliAlias).filter(Boolean);
      strategyContextProvided = true;
      i += 1;
    }
  }
  let result = parseModelSlot(value, { knownClis, defaultCli });
  if (!result.ok) {
    console.error(`[FAIL] ${result.error}`);
    process.exit(1);
  }
  if (strategyContextProvided) {
    const strategyResult = resolveDispatchStrategy(result, { coordinatorCli, launchPreferenceClis, interactiveClis });
    result = { ...result, strategy: strategyResult.strategy, strategyReason: strategyResult.reason };
    if (strategyResult.strategy === 'orca-interactive') {
      result.interactiveCommand = strategyResult.command;
    }
  }
  console.log(JSON.stringify(result));
}

if (require.main === module) {
  main();
}

module.exports = {
  CLI_ALIASES,
  INTERACTIVE_ADAPTERS,
  buildInteractiveCommand,
  formatReportRow,
  getInteractiveAdapter,
  normalizeCliAlias,
  parseModelSlot,
  resolveDispatchStrategy,
};
