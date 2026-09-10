#!/usr/bin/env node

// Parses a Conduct model-slot value (WORKER_PLANNER / WORKER_BUILDER / REVIEWER, or an
// invocation-time per-slot override) into the exact Orca dispatch tuple: { cli, model, effort }.
// See .agents/skills/conduct/SKILL.md section "Resolve the models" for the algorithm this
// implements. `knownClis`/`defaultCli` are always caller-supplied at run time from the freshly
// loaded orchestration guide and the runtime-identity detection — never hardcoded here (#1306).

// Shorthand aliases for a dispatch-agent id, normalized before any matching.
const CLI_ALIASES = Object.freeze({ agy: 'antigravity' });

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

// Classifies how an already-resolved slot is dispatched across Conduct's three execution tiers.
function resolveDispatchStrategy({ cli } = {}, { coordinatorCli, launchPreferenceClis } = {}) {
  const normalizedCli = normalizeCliAlias(cli);
  if (!normalizedCli) {
    return { strategy: undefined, reason: 'no cli given -- cannot classify strategy' };
  }

  const normalizedCoordinatorCli = coordinatorCli ? normalizeCliAlias(coordinatorCli) : undefined;
  if (normalizedCoordinatorCli && normalizedCli === normalizedCoordinatorCli) {
    return {
      strategy: 'in-session',
      reason: `coordinator's own runtime already matches resolved cli "${normalizedCli}" -- Tier 1, no external dispatch`,
    };
  }

  if (!Array.isArray(launchPreferenceClis)) {
    return {
      strategy: undefined,
      reason: 'launchPreferenceClis not supplied -- cannot distinguish Tier 2 (orca-pty) from Tier 3 (direct-cli)',
    };
  }
  const launchPrefSet = new Set(launchPreferenceClis.map(normalizeCliAlias));
  return launchPrefSet.has(normalizedCli)
    ? {
        strategy: 'orca-pty',
        reason: `Orca worker-start supports launch preferences for "${normalizedCli}" -- Tier 2, standard supervised dispatch`,
      }
    : {
        strategy: 'direct-cli',
        reason: `Orca has no launch-preference support for "${normalizedCli}" -- Tier 3, direct-CLI headless fallback`,
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
    console.error('usage: conduct-model-slot.js <slot-value> --known-clis a,b,c [--default-cli cli] [--coordinator-cli cli] [--launch-pref-clis a,b,c]');
    process.exit(2);
  }
  let knownClis = [];
  let defaultCli;
  let coordinatorCli;
  let launchPreferenceClis;
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
    }
  }
  let result = parseModelSlot(value, { knownClis, defaultCli });
  if (!result.ok) {
    console.error(`[FAIL] ${result.error}`);
    process.exit(1);
  }
  if (strategyContextProvided) {
    const strategyResult = resolveDispatchStrategy(result, { coordinatorCli, launchPreferenceClis });
    result = { ...result, strategy: strategyResult.strategy, strategyReason: strategyResult.reason };
  }
  console.log(JSON.stringify(result));
}

if (require.main === module) {
  main();
}

module.exports = {
  CLI_ALIASES,
  formatReportRow,
  normalizeCliAlias,
  parseModelSlot,
  resolveDispatchStrategy,
};
