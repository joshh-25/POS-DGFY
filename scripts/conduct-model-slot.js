#!/usr/bin/env node

// Parses a Conduct model-slot value (WORKER_PLANNER / WORKER_BUILDER / REVIEWER, or an
// invocation-time per-slot override) into the exact Orca dispatch tuple: { cli, model, effort }.
// See .agents/skills/conduct/SKILL.md section "Resolve the models" for the algorithm this
// implements. `knownClis`/`defaultCli` are always caller-supplied at run time from the freshly
// loaded orchestration guide and the runtime-identity detection — never hardcoded here (#1306).

function parseModelSlot(value, { knownClis, defaultCli } = {}) {
  const known = new Set(Array.isArray(knownClis) ? knownClis : []);
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
  if (segments.length >= 2 && known.has(segments[0])) {
    const [cli, model, effort] = segments;
    return { ok: true, cli, model, effort: effort || undefined, source: 'canonical' };
  }

  // Rule 4: otherwise -> legacy. model[:effort], CLI inferred (never guessed as segment 1).
  if (segments.length > 2) {
    return { ok: false, error: `malformed legacy slot value "${raw}": more than 2 segments` };
  }
  const [model, effort] = segments;
  if (!defaultCli) {
    return {
      ok: false,
      error: `legacy slot value "${raw}" has no CLI segment and no default CLI could be inferred`,
    };
  }
  if (!known.has(defaultCli)) {
    return {
      ok: false,
      error: `inferred default CLI "${defaultCli}" for legacy slot value "${raw}" is not a currently available dispatch agent`,
    };
  }
  return {
    ok: true,
    cli: defaultCli,
    model,
    effort: effort || undefined,
    source: `legacy (CLI inferred from orchestrator default: ${defaultCli})`,
  };
}

function formatReportRow(slotName, parsed, origin) {
  if (!parsed.ok) {
    return `| ${slotName} | — | — | — | **ERROR** — ${parsed.error} |`;
  }
  const legacyNote = parsed.source.startsWith('legacy')
    ? ` (**legacy** — no CLI segment; ${parsed.source.slice('legacy '.length)}, not asserted by the user — verify)`
    : ' (canonical)';
  return `| ${slotName} | ${parsed.cli} | ${parsed.model} | ${parsed.effort || '—'} | ${origin}${legacyNote} |`;
}

function main() {
  const args = process.argv.slice(2);
  const value = args[0];
  if (!value || value.startsWith('--')) {
    console.error('usage: conduct-model-slot.js <slot-value> --known-clis a,b,c [--default-cli cli]');
    process.exit(2);
  }
  let knownClis = [];
  let defaultCli;
  for (let i = 1; i < args.length; i += 1) {
    if (args[i] === '--known-clis' && args[i + 1]) {
      knownClis = args[i + 1].split(',').map((s) => s.trim()).filter(Boolean);
      i += 1;
    } else if (args[i] === '--default-cli' && args[i + 1]) {
      defaultCli = args[i + 1].trim();
      i += 1;
    }
  }
  const result = parseModelSlot(value, { knownClis, defaultCli });
  if (!result.ok) {
    console.error(`[FAIL] ${result.error}`);
    process.exit(1);
  }
  console.log(JSON.stringify(result));
}

if (require.main === module) {
  main();
}

module.exports = { parseModelSlot, formatReportRow };
