#!/usr/bin/env node

// #1124/#1165: renders scripts/run-backend-test-matrix.js's own artifact
// (backend_test_matrix.json) as a markdown table on $GITHUB_STEP_SUMMARY, appended from inside
// the matrix step itself right after that script runs. The point: a step's summary is flushed
// when the step ends, so this is visible in the Checks UI even if a *later* step in the same job
// kills the whole job envelope -- exactly what happened on run 33241398956 (the matrix step
// finished; the very next step then killed the job 3 seconds in, before the artifact-upload step
// or the per-step-outcome recorder ever ran). No `jq`, no `gh`, no dependency beyond Node itself --
// this has to work standalone on a runner that's already shown it can't be assumed to have
// anything installed beyond what actions/* pulls down.
//
// Reads the same evidence directory scripts/run-backend-test-matrix.js just wrote (respecting the
// same RELEASE_TARGET_SHA / RELEASE_GATES_EVIDENCE_ROOT overrides so the two scripts always agree
// on where the artifact lives), and never throws past its own `main()` -- a summary that fails to
// render is a worse outcome than a missing one, but neither should ever turn the matrix step's own
// exit code red on its own account (the calling `run:` block captures the matrix script's exit
// code separately, before this script even runs).

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function getTargetSha() {
  if (process.env.RELEASE_TARGET_SHA) return process.env.RELEASE_TARGET_SHA.toLowerCase();
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  if (result.status === 0) return String(result.stdout || '').trim().toLowerCase();
  return 'unknown';
}

function formatMs(ms) {
  if (typeof ms !== 'number' || Number.isNaN(ms)) return 'n/a';
  return `${(ms / 1000).toFixed(1)}s`;
}

function main() {
  const targetSha = getTargetSha();
  const evidenceRootBase = process.env.RELEASE_GATES_EVIDENCE_ROOT || path.join(ROOT, '.tmp', 'release-gates');
  const artifactPath = path.join(evidenceRootBase, targetSha, 'backend-test-matrix', 'backend_test_matrix.json');

  if (!fs.existsSync(artifactPath)) {
    console.log('### Backend test matrix\n');
    console.log(`No artifact found at \`${path.relative(ROOT, artifactPath)}\` -- the matrix script did not run, or was killed before its first write.\n`);
    return;
  }

  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  } catch (error) {
    console.log('### Backend test matrix\n');
    console.log(`Artifact at \`${path.relative(ROOT, artifactPath)}\` could not be parsed: ${error.message}\n`);
    return;
  }

  const lines = [];
  lines.push('### Backend test matrix');
  lines.push('');
  lines.push(`**Verdict:** \`${payload.verdict || 'unknown'}\`` + (payload.partial ? ' _(partial -- run did not complete)_' : ''));
  lines.push(`**Coverage complete:** ${payload.coverage_complete === false ? 'no -- an early stop cut this run short' : 'yes'}`);
  lines.push(`**Tier:** \`${payload.tier || 'n/a'}\` | **Fail-fast:** \`${Boolean(payload.fail_fast)}\` | **Target SHA:** \`${payload.target_sha || 'unknown'}\``);
  lines.push('');
  lines.push(`Active tests: ${payload.active_test_count ?? 'n/a'} (fast: ${payload.fast_test_count ?? 'n/a'}, db: ${payload.db_test_count ?? 'n/a'})`);
  lines.push('');

  const chunks = Array.isArray(payload.chunks) ? payload.chunks : [];
  if (chunks.length === 0) {
    lines.push('_No chunks recorded yet._');
  } else {
    lines.push('| Tier | Group | Chunk | Tests | Status | Duration | Log |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const c of chunks) {
      const chunkLabel = c.tier === 'fast' ? '-' : `${c.chunk_index ?? '-'}`;
      lines.push(
        `| ${c.tier || '-'} | ${c.group || '-'} | ${chunkLabel} | ${c.test_count ?? '-'} | \`${c.status || '-'}\` | ${formatMs(c.duration_ms)} | \`${c.log_file || '-'}\` |`
      );
    }

    // #1157/#1124: name the actual failing suites right here, not just "fail, see the log" -- the
    // whole point of this triage was that nobody could see this without downloading an artifact.
    const failingChunks = chunks.filter((c) => Array.isArray(c.failing_suites) && c.failing_suites.length > 0);
    if (failingChunks.length > 0) {
      lines.push('');
      lines.push('<details><summary>Failing suites</summary>');
      lines.push('');
      for (const c of failingChunks) {
        const label = c.tier === 'fast' ? 'tier=fast' : `tier=db group=${c.group} chunk=${c.chunk_index}`;
        lines.push(`- **${label}**`);
        for (const suite of c.failing_suites) lines.push(`  - \`${suite}\``);
      }
      lines.push('');
      lines.push('</details>');
    }
  }

  console.log(lines.join('\n'));
}

try {
  main();
} catch (error) {
  // Deliberately swallowed past this point -- a failed summary render must never itself fail the
  // calling step. See the top-of-file comment.
  console.log(`### Backend test matrix\n\nSummary render failed: ${error.message}\n`);
}
