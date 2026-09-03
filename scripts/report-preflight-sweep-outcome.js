#!/usr/bin/env node
/**
 * #1374 -- classifies a `compliance-preflight-sweep.yml` run into one outcome class and renders
 * that class three ways: a `$GITHUB_STEP_SUMMARY` block, a `gh issue create/edit --body-file`
 * payload, and a `compliance-preflight-sweep-handoff/v1` JSON artifact. Exists because three
 * failure classes were conflated before this (see #1374's own research): a real preflight failure,
 * an operator-input error, and `gh pr create` being org-policy-blocked (#1295) all rendered
 * identically as a red run with no distinguishing evidence.
 *
 * Pure functions, DI-friendly, no dependencies beyond Node itself -- matches
 * scripts/ci-runner-preflight.js's and scripts/summarize-backend-test-matrix.js's house style.
 * `main()` (via the `report` subcommand's `runReport()`) never throws past itself: a malformed
 * `results.json`/`handoff-state.json` still produces a one-line summary on stdout, never a crash --
 * the calling workflow step is `if: always()` and must always leave *some* trail behind.
 *
 * CLI:
 *   node scripts/report-preflight-sweep-outcome.js classify-pr-create --exit-code N [--stderr-file F]
 *   node scripts/report-preflight-sweep-outcome.js report --results F --handoff-state F \
 *     --discover-count N --input-error 0|1 --output F --issue-file F
 *
 * `report` exit codes: 0 = rendered, outcome is green (merged / nothing_to_reconcile /
 * nothing_to_sweep) or already-red-elsewhere (input_error / preflight_failed / handoff_error --
 * those steps already turned their own step red; this command's job is only to render evidence,
 * never to re-fail the run a second time); 2 = rendered, outcome is `handoff_required` (a human
 * must act, but nothing is actually broken -- the caller turns this into a `::warning::` and exits
 * 0); 1 = could not render at all (malformed input JSON) -- the one case this command's own step
 * should go red, since no evidence was produced.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Pinned to the live `gh pr create` error string this repo has actually observed (#1374 research,
// runs 33531804412 / 33536811560 / 33542764832 / 33545741502): "GitHub Actions is not permitted to
// create or approve pull requests" (org-level policy, #1295). A test pins this regex against that
// exact string so a GitHub wording change is caught rather than silently stopping classification.
const POLICY_BLOCKED_PATTERN = /not permitted to create or approve pull requests/i;

const LABEL_BY_CLASS = {
  preflight_failed: 'compliance:preflight-failed',
  handoff_required: 'compliance:preflight-handoff'
};

// --- classification ------------------------------------------------------------------------------

/**
 * Classifies a `gh pr create` attempt from its exit code and captured stderr.
 * @returns {'created'|'policy_blocked'|'error'}
 */
const classifyPrCreate = (exitCode, stderr) => {
  const code = Number(exitCode);
  if (code === 0) return 'created';
  if (POLICY_BLOCKED_PATTERN.test(String(stderr || ''))) return 'policy_blocked';
  return 'error';
};

/**
 * Classifies one sweep run into an outcome per #1374's design table.
 * @param {{
 *   results?: Array<{declaration: string, http_code: string|number, verdict?: {pass?: boolean, result?: string, reason_code?: string}}>|null,
 *   handoffState?: {status?: string, branch?: string, head_sha?: string, base_sha?: string, pr_url?: string, pr_create_exit?: number, pr_create_stderr?: string, superseded?: Array<{branch: string, action: string}>, pr_body?: string, detail?: string}|null,
 *   discoverCount?: number,
 *   inputError?: boolean
 * }} input
 */
const classifyOutcome = ({ results, handoffState, discoverCount, inputError } = {}) => {
  const count = Number(discoverCount) || 0;
  const handoff = handoffState || null;

  if (inputError) {
    return {
      class: 'input_error',
      discoverCount: count,
      declarations: [],
      not_applicable: [],
      handoff,
      detail: 'An explicit declarations= entry does not exist on the checked-out ref -- ' +
        'operator input error, not a compliance failure.'
    };
  }

  if (count === 0) {
    return {
      class: 'nothing_to_sweep',
      discoverCount: 0,
      declarations: [],
      not_applicable: [],
      handoff,
      detail: 'No NOT-EXECUTED-* declarations were discovered -- nothing to sweep.'
    };
  }

  const resultsList = Array.isArray(results) ? results : null;
  if (!resultsList || resultsList.length === 0) {
    return {
      class: 'preflight_failed',
      discoverCount: count,
      declarations: [],
      not_applicable: [],
      handoff,
      detail: `${count} declaration(s) were discovered but no preflight results were produced -- ` +
        'the sweep step did not complete.'
    };
  }

  // Mirrors compliance-preflight-sweep.yml's own test ("Run preflight sweep" step, `[ "$http_code"
  // != "200" ] || [ "$pass" != "true" ]`): a row is a failure unless it passed AND either got a
  // real HTTP 200 or is a #1396 not_applicable row (http_code "n/a" by construction -- no HTTP call
  // was made). A not_applicable row with pass:false would still be caught here defensively --
  // that shape should never occur (build-preflight-request.js only ever emits pass:true for it),
  // but this filter does not special-case away a malformed one.
  const failing = resultsList.filter((entry) => {
    const httpCode = entry && entry.http_code !== undefined ? String(entry.http_code) : undefined;
    const pass = Boolean(entry && entry.verdict && entry.verdict.pass === true);
    const isNotApplicable = Boolean(entry && entry.verdict && entry.verdict.result === 'not_applicable');
    return !pass || (httpCode !== '200' && !isNotApplicable);
  });

  // #1396 -- broken out separately (not folded into `failing`) so the handoff artifact/issue can
  // tell a human "these N declarations were reconciled without the live endpoint ever being
  // called" instead of presenting them identically to a real no_breach pass. Computed once, reused
  // by every branch below (including the preflight_failed branch -- a batch can have both a real
  // failure and a not_applicable row in the same run).
  const notApplicable = resultsList
    .filter((entry) => entry && entry.verdict && entry.verdict.result === 'not_applicable' && entry.verdict.pass === true)
    .map((entry) => ({
      declaration: entry.declaration,
      reason_code: entry.verdict.reason_code,
      declared_surfaces: entry.verdict.declared_surfaces || []
    }));

  if (failing.length > 0) {
    return {
      class: 'preflight_failed',
      discoverCount: count,
      declarations: failing.map((entry) => ({
        declaration: entry.declaration,
        http_code: entry.http_code,
        result: entry.verdict && entry.verdict.result,
        reason_code: entry.verdict && entry.verdict.reason_code
      })),
      not_applicable: notApplicable,
      handoff,
      detail: `${failing.length} of ${resultsList.length} declaration(s) failed preflight.`
    };
  }

  // Every declaration passed preflight -- the outcome now depends entirely on the handoff step's
  // own recorded status. Never guess a green class when that status is missing/unrecognized.
  const status = handoff && handoff.status;
  const declarations = resultsList.map((entry) => entry.declaration);

  if (status === 'nothing_to_reconcile') {
    return {
      class: 'nothing_to_reconcile',
      discoverCount: count,
      declarations,
      not_applicable: notApplicable,
      handoff,
      detail: 'Every declaration was already reconciled -- no diff to push.'
    };
  }
  if (status === 'merged') {
    return {
      class: 'merged',
      discoverCount: count,
      declarations,
      not_applicable: notApplicable,
      handoff,
      detail: 'Reconciliation branch pushed, PR opened, and merged.'
    };
  }
  if (status === 'handoff_required') {
    return {
      class: 'handoff_required',
      discoverCount: count,
      declarations,
      not_applicable: notApplicable,
      handoff,
      detail: 'Preflight passed and a reconciliation branch was pushed, but gh pr create was ' +
        'policy-blocked (#1295) -- a human (or credentialed AI session) must open and merge the PR.'
    };
  }
  return {
    class: 'handoff_error',
    discoverCount: count,
    declarations,
    not_applicable: notApplicable,
    handoff,
    detail: (handoff && handoff.detail) ||
      `The handoff step did not report a recognized status (got: ${JSON.stringify(status)}).`
  };
};

// --- rendering -------------------------------------------------------------------------------------

/**
 * The exact operator commands for a `handoff_required` outcome. Empty for every other class.
 */
const buildOperatorCommands = (outcome) => {
  if (!outcome || outcome.class !== 'handoff_required' || !outcome.handoff) return [];
  const h = outcome.handoff;
  const branch = h.branch || 'compliance-sweep/<run_id>';
  const bodyFile = h.pr_body || '/tmp/pr-body.md';
  const date = new Date().toISOString().slice(0, 10);
  const title = `docs(compliance): reconcile preflight sweep results (${date})`;

  return [
    `gh pr create --base develop --head ${branch} --title "${title}" --body-file ${bodyFile}`,
    'gh pr checks <N> --watch',
    'gh pr merge <N> --merge --delete-branch',
    '# Before merging: AGENTS.md Merge Safety -- no check run in_progress/queued on the head ' +
      'commit, and mergeStateStatus is CLEAN, not unstable.'
  ];
};

const SUPERSEDED_ACTION_LABEL = {
  deleted: 'deleted',
  kept_open_pr: 'kept (has an open PR)',
  delete_failed: 'delete failed',
  delete_skipped_pr_query_failed: 'delete skipped -- open-PR query failed, fail closed'
};

const renderDeclarationsSection = (outcome) => {
  const lines = [];
  if (!outcome.declarations || outcome.declarations.length === 0) return lines;

  if (outcome.class === 'preflight_failed' && typeof outcome.declarations[0] === 'object') {
    lines.push('| Declaration | HTTP | Result | Reason code |');
    lines.push('|---|---|---|---|');
    for (const d of outcome.declarations) {
      lines.push(`| ${d.declaration} | ${d.http_code ?? '-'} | ${d.result ?? '-'} | ${d.reason_code ?? '-'} |`);
    }
  } else {
    lines.push('Declarations:');
    for (const d of outcome.declarations) lines.push(`- ${d}`);
  }
  return lines;
};

const renderSupersededSection = (outcome) => {
  const superseded = outcome.handoff && Array.isArray(outcome.handoff.superseded)
    ? outcome.handoff.superseded
    : [];
  if (superseded.length === 0) return [];

  const lines = [];
  lines.push('Superseded branches:');
  lines.push('| Branch | Action |');
  lines.push('|---|---|');
  for (const s of superseded) {
    lines.push(`| ${s.branch} | ${SUPERSEDED_ACTION_LABEL[s.action] || s.action} |`);
  }
  return lines;
};

const renderNotApplicableSection = (outcome) => {
  const list = Array.isArray(outcome.not_applicable) ? outcome.not_applicable : [];
  if (list.length === 0) return [];

  const lines = [];
  lines.push('Not applicable to live preflight (recorded, reconciled):');
  lines.push('| Declaration | Reason code | Declared surfaces |');
  lines.push('|---|---|---|');
  for (const d of list) {
    const surfaces = Array.isArray(d.declared_surfaces) && d.declared_surfaces.length > 0
      ? d.declared_surfaces.join(', ')
      : '-';
    lines.push(`| ${d.declaration} | ${d.reason_code ?? '-'} | ${surfaces} |`);
  }
  return lines;
};

const renderHandoffSection = (outcome) => {
  if (!outcome.handoff) return [];
  const h = outcome.handoff;
  const lines = [];
  if (h.branch) lines.push(`Branch: \`${h.branch}\``);
  if (h.head_sha) lines.push(`Head SHA: \`${h.head_sha}\``);
  if (h.base_sha) lines.push(`Base SHA: \`${h.base_sha}\``);
  if (h.pr_url) lines.push(`PR: ${h.pr_url}`);
  return lines;
};

/**
 * Renders the `$GITHUB_STEP_SUMMARY` markdown block for one outcome.
 */
const renderSummary = (outcome) => {
  const lines = [];
  lines.push('### Compliance preflight sweep');
  lines.push('');
  lines.push(`**Outcome:** \`${outcome.class}\` (${outcome.discoverCount} declaration(s) discovered)`);
  lines.push('');
  lines.push(outcome.detail);
  lines.push('');

  lines.push(...renderDeclarationsSection(outcome));
  const notApplicableLines = renderNotApplicableSection(outcome);
  if (notApplicableLines.length > 0) {
    lines.push('');
    lines.push(...notApplicableLines);
  }
  const handoffLines = renderHandoffSection(outcome);
  if (handoffLines.length > 0) {
    lines.push('');
    lines.push(...handoffLines);
  }

  const supersededLines = renderSupersededSection(outcome);
  if (supersededLines.length > 0) {
    lines.push('');
    lines.push(...supersededLines);
  }

  const commands = buildOperatorCommands(outcome);
  if (commands.length > 0) {
    lines.push('');
    lines.push('Operator commands:');
    lines.push('```');
    lines.push(...commands);
    lines.push('```');
  }

  return lines.join('\n');
};

/**
 * Renders a `gh issue create`/`gh issue edit --body-file` payload for one outcome. Only
 * `preflight_failed` and `handoff_required` are ever actually filed by the calling workflow
 * (`LABEL_BY_CLASS`); every other class still renders content, for the artifact/debugging trail.
 */
const renderIssue = (outcome, meta = {}) => {
  // Found live, #1374 follow-up (2026-09-02, issue #1393): the workflow's own "Publish handoff
  // issue" step only ever calls `gh issue edit --body-file` on an existing open issue, never
  // `--title` -- by design, this is meant to be ONE persistent issue per class, updated in place,
  // not one per run. A title embedding a specific run ID therefore goes stale the moment a SECOND
  // run updates the same issue's body (confirmed live: #1393's title still read "run 33569433235"
  // while its body correctly showed "run 33583946735"). The run ID belongs in the body only, which
  // already carries it twice (this function's own `Run: <url>` trailer, and the caller's own
  // per-run comment on update) -- the title should describe WHAT the issue is, not WHEN it was
  // last touched, since the label-based search in the workflow (`gh issue list --label ...`)
  // never matched on title content anyway.
  const title = `compliance: preflight sweep ${outcome.class}`;

  const lines = [];
  lines.push(outcome.detail);
  lines.push('');
  lines.push(...renderDeclarationsSection(outcome));
  const notApplicableLines = renderNotApplicableSection(outcome);
  if (notApplicableLines.length > 0) {
    lines.push('');
    lines.push(...notApplicableLines);
  }
  const handoffLines = renderHandoffSection(outcome);
  if (handoffLines.length > 0) {
    lines.push('');
    lines.push(...handoffLines);
  }
  const supersededLines = renderSupersededSection(outcome);
  if (supersededLines.length > 0) {
    lines.push('');
    lines.push(...supersededLines);
  }
  const commands = buildOperatorCommands(outcome);
  if (commands.length > 0) {
    lines.push('');
    lines.push('Operator commands:');
    lines.push('```');
    lines.push(...commands);
    lines.push('```');
  }
  if (meta.runUrl) {
    lines.push('');
    lines.push(`Run: ${meta.runUrl}`);
  }

  return { title, body: lines.join('\n'), label: LABEL_BY_CLASS[outcome.class] || null };
};

/**
 * Writes the `compliance-preflight-sweep-handoff/v1` JSON artifact and returns the object written.
 */
const writeArtifact = (outputPath, outcome, meta = {}) => {
  const artifact = {
    schema: 'compliance-preflight-sweep-handoff/v1',
    run_id: meta.runId || 'unknown',
    ref: meta.ref || '',
    sha: meta.sha || '',
    captured_at: new Date().toISOString(),
    outcome_class: outcome.class,
    handoff_status: (outcome.handoff && outcome.handoff.status) || null,
    discover_count: outcome.discoverCount,
    declarations: outcome.declarations,
    not_applicable: outcome.not_applicable || [],
    handoff: outcome.handoff || null,
    operator_commands: buildOperatorCommands(outcome)
  };

  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return artifact;
};

// --- I/O helpers -------------------------------------------------------------------------------

/**
 * Reads and parses a JSON file. A missing path (or no path given) is `undefined` -- "absent", not
 * an error, per this script's own CLI contract. A path that exists but does not parse throws --
 * that's a real rendering failure the caller must not swallow silently.
 */
const readJsonFileIfPresent = (filePath) => {
  if (!filePath) return undefined;
  if (!fs.existsSync(filePath)) return undefined;
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
};

// --- CLI -----------------------------------------------------------------------------------------

const parseCliArgs = (argv) => {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      options[key] = true;
    } else {
      options[key] = next;
      i += 1;
    }
  }
  return options;
};

/**
 * Runs the `report` subcommand's full logic without touching `process.stdout`/`process.exitCode`
 * directly -- returns `{ exitCode, stdout }` instead, so it's directly testable (matches
 * scripts/ci-runner-preflight.js's `runPreflight()`/`main()` split).
 */
const runReport = ({ resultsPath, handoffStatePath, discoverCount, inputError, outputPath, issueFilePath, env }) => {
  const environment = env || process.env;

  let results;
  let handoffState;
  try {
    results = readJsonFileIfPresent(resultsPath);
    handoffState = readJsonFileIfPresent(handoffStatePath);
  } catch (error) {
    // Could not render at all -- still print a one-line summary, never crash the calling `always()`
    // step silently. This is the one case that gets exit 1.
    return {
      exitCode: 1,
      stdout: `### Compliance preflight sweep\n\nCould not render outcome: ${error.message}\n`
    };
  }

  const outcome = classifyOutcome({
    results,
    handoffState,
    discoverCount: Number(discoverCount) || 0,
    inputError: inputError === '1' || inputError === true
  });

  const meta = {
    runId: environment.GITHUB_RUN_ID || 'local',
    ref: environment.GITHUB_REF || '',
    sha: environment.GITHUB_SHA || '',
    runUrl: environment.GITHUB_SERVER_URL && environment.GITHUB_REPOSITORY && environment.GITHUB_RUN_ID
      ? `${environment.GITHUB_SERVER_URL}/${environment.GITHUB_REPOSITORY}/actions/runs/${environment.GITHUB_RUN_ID}`
      : undefined
  };

  const summary = renderSummary(outcome);

  try {
    if (outputPath) writeArtifact(outputPath, outcome, meta);
    if (issueFilePath) {
      const issue = renderIssue(outcome, meta);
      fs.mkdirSync(path.dirname(path.resolve(issueFilePath)), { recursive: true });
      fs.writeFileSync(issueFilePath, `${issue.title}\n\n${issue.body}\n`, 'utf8');
    }
  } catch (error) {
    // The summary itself rendered fine -- only the artifact/issue write failed. Still a render
    // failure overall: nothing downstream can trust files that were never written.
    return {
      exitCode: 1,
      stdout: `${summary}\n\n(warning: could not write output artifact(s): ${error.message})\n`
    };
  }

  return { exitCode: outcome.class === 'handoff_required' ? 2 : 0, stdout: `${summary}\n` };
};

const main = () => {
  try {
    const [subcommand, ...rest] = process.argv.slice(2);
    const options = parseCliArgs(rest);

    if (subcommand === 'classify-pr-create') {
      let stderr = '';
      if (typeof options['stderr-file'] === 'string' && fs.existsSync(options['stderr-file'])) {
        stderr = fs.readFileSync(options['stderr-file'], 'utf8');
      }
      process.stdout.write(`${classifyPrCreate(options['exit-code'], stderr)}\n`);
      process.exitCode = 0;
      return;
    }

    if (subcommand === 'report') {
      const result = runReport({
        resultsPath: options.results,
        handoffStatePath: options['handoff-state'],
        discoverCount: options['discover-count'],
        inputError: options['input-error'],
        outputPath: options.output,
        issueFilePath: options['issue-file']
      });
      process.stdout.write(result.stdout);
      process.exitCode = result.exitCode;
      return;
    }

    process.stderr.write(`[report-preflight-sweep-outcome] Unknown subcommand: ${subcommand || '(none)'}\n`);
    process.exitCode = 1;
  } catch (error) {
    // Never throws past main() -- a one-line summary always prints even on a totally unexpected
    // failure (bad flags, an I/O error outside the try/catch above, etc.).
    process.stdout.write(`### Compliance preflight sweep\n\nSummary render failed: ${error.message}\n`);
    process.exitCode = 1;
  }
};

if (require.main === module) main();

module.exports = {
  POLICY_BLOCKED_PATTERN,
  LABEL_BY_CLASS,
  classifyPrCreate,
  classifyOutcome,
  buildOperatorCommands,
  renderSummary,
  renderIssue,
  writeArtifact,
  readJsonFileIfPresent,
  parseCliArgs,
  runReport
};
