#!/usr/bin/env node
// Reproduces this repo's PR checks locally and posts a structured verdict --
// #724 (child of #662). Built because both self-hosted runners can be
// `online` and PR checks can still sit `queued`/cancelled for hours (queue
// starvation, measured 2026-08-19), which is a different failure than the
// runner-outage case #662 was originally written for.
//
// Deliberately Node, not bash -- mirrors scripts/gate-release-local.js's
// runCommand/captureStdout/JSON-artifact shape rather than reimplementing it
// in a new language. `npm run check:pr` is the intended entrypoint.
//
// --tier fast (default) needs no Docker daemon: two of the three "build
// checks" (dgfy-api, dgfy-migration-runner) have no compile step in their
// Dockerfiles at all -- `npm ci --omit=dev` + COPY -- so `npm ci --dry-run`
// reproduces the substantive half of what they prove. The frontend build is
// real work, but its OOM in Docker (exit 137, #662) comes from
// `build:all:parallel` building three apps at once; run serially and
// natively it has no memory ceiling to hit. --tier full adds the three real
// `docker build ... push:false` calls for genuine parity.
//
// This is NOT a routine CI bypass. classifyCiUnavailability() must report
// `healthy` (and refuse to post) when none of runner_offline /
// queue_starvation / billing_allocation_failure / github_platform_outage
// actually holds -- that refusal is the entire property separating this tool
// from turning the checks off. See AGENTS.md's Merge Safety section for the
// bounded exception this evidence is allowed to authorize (develop/staging
// only, never main).
//
// github_platform_outage (#1077, added 2026-08-27): a check-suite can fail
// to be created at all -- not just sit stuck -- during a live GitHub-side
// Actions incident. queue_starvation can't see this (it only inspects
// check-runs that already exist); confirmed live via zero check-suites on a
// real PR's head commit while githubstatus.com reported the Actions
// component at Major Outage. Verified against the public status API, last
// after the other three (cheapest/most repo-specific signals first).
//
// RF-1 (PR #1078 review, 2026-08-27): global GitHub Status is necessary but
// not sufficient -- a degraded/outage Actions component does not mean *this*
// SHA's checks are actually missing (a completed check run already proves
// they ran). This reason is gated on affirmative target-SHA evidence first:
// zero check-runs AND zero check-suites for headSha, the exact zero-suite
// condition #1077 confirmed live, only *then* is the global status consulted.
// The cited incident is also matched to the Actions component specifically
// (githubstatus.com's incidents[] can include unrelated components) rather
// than assumed to be incidents[0].

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const REPO_SLUG = 'Sieitzz/dgfy-platform';

// Ported verbatim from .github/workflows/shared-changed-paths.yml's `detect`
// step (the `matches '...'` lines). If that workflow's filters change, these
// must change with them -- pr-checks.test.js asserts each pattern below
// still appears verbatim in the workflow file, so a drift fails the test
// instead of silently diverging.
// The workflow also carries an ANDROID filter (shared-changed-paths.yml:149).
// Deliberately not ported here -- Android isn't one of the four checks this
// tool reproduces, and it doesn't gate a develop/staging merge today. Not an
// oversight (#725 RF-3).
const PATH_FILTERS = {
  frontend_ims: /^(apps\/dgfy-ims\/|packages\/pos-receipt\/|packages\/shared-constants\/|packages\/web-core\/|infrastructure\/docker\/dgfy-ims\/|\.dockerignore|\.github\/workflows\/(shared-changed-paths|deploy-frontend|deployment-orchestrator|pr-frontend-build-checks|deploy|deploy-main)\.yml)/,
  frontend_pos: /^(apps\/dgfy-pos\/|packages\/pos-receipt\/|packages\/shared-constants\/|packages\/web-core\/|infrastructure\/docker\/dgfy-pos\/|\.dockerignore|\.github\/workflows\/(shared-changed-paths|deploy-frontend|deployment-orchestrator|pr-frontend-build-checks|deploy|deploy-main)\.yml)/,
  frontend_storefront: /^(apps\/dgfy-storefront\/|packages\/shared-constants\/|packages\/web-core\/|infrastructure\/docker\/dgfy-storefront\/|\.dockerignore|\.github\/workflows\/(shared-changed-paths|deploy-frontend|deployment-orchestrator|pr-frontend-build-checks|deploy|deploy-main)\.yml)/,
  dgfy_api: /^(apps\/dgfy-api\/|packages\/shared-constants\/|infrastructure\/docker\/dgfy-api\/|\.dockerignore|\.github\/workflows\/(shared-changed-paths|deploy-api|deployment-orchestrator|pr-dgfy-api-build-checks|deploy|deploy-main)\.yml)/,
  migration_runner: /^(apps\/dgfy-migration-runner\/|infrastructure\/docker\/dgfy-migration-runner\/|\.dockerignore|\.github\/workflows\/(shared-changed-paths|deploy-migration-runner|deployment-orchestrator|pr-migration-runner-build-checks|deploy|deploy-main)\.yml)/,
};

const NOT_REPRODUCED_LOCALLY = [
  'Dockerfile runtime/nginx stages (only the builder/deps stage is approximated)',
  'npm ci under the Dockerfiles’ node:22-alpine (this host is whatever `node -v` reports below)',
  'target architecture (production is linux/amd64; this host may not be)',
  'the Dockerfile’s workspace-path `sed` rewrite step',
  'GitHub Actions’ layer cache (type=gha, scope=api/dgfy-ims/dgfy-pos/dgfy-storefront/migration-runner)',
];

class PrChecksError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PrChecksError';
    this.code = code;
  }
}

function runCommand(command, args, { cwd = repoRoot, env = process.env } = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd, env });
  if (result.error) {
    console.error(`[pr-checks] command failed to launch: ${command} ${args.join(' ')}`);
    console.error(result.error.message);
    return { ok: false, status: result.status };
  }
  return { ok: result.status === 0, status: result.status };
}

function captureStdout(command, args, { cwd = repoRoot, env = process.env, allowFail = true } = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', cwd, env });
  if (result.error || result.status !== 0) {
    if (allowFail) return '';
    throw new PrChecksError('COMMAND_FAILED', (result.stderr || result.stdout || `${command} failed`).trim());
  }
  return String(result.stdout || '').trim();
}

function captureJson(command, args, options = {}) {
  const raw = captureStdout(command, args, options);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function splitLines(raw) {
  return String(raw || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const options = {
    tier: 'fast',
    base: 'develop',
    pr: null,
    post: false,
    report: null,
    thresholdMinutes: 20,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--tier') options.tier = argv[++i];
    else if (arg === '--base') options.base = argv[++i];
    else if (arg === '--pr') options.pr = argv[++i];
    else if (arg === '--post') options.post = true;
    else if (arg === '--report') options.report = argv[++i];
    else if (arg === '--threshold-minutes') options.thresholdMinutes = Number(argv[++i]);
    else throw new PrChecksError('INVALID_ARGS', `Unknown argument: ${arg}`);
  }
  if (options.tier !== 'fast' && options.tier !== 'full') {
    throw new PrChecksError('INVALID_ARGS', '--tier must be fast or full');
  }
  return options;
}

// --- changed-path detection -------------------------------------------------

function resolveChangedFiles(base, runner = captureStdout) {
  runner('git', ['fetch', '--no-tags', '--prune', '--depth=200', 'origin', base], { allowFail: true });
  const mergeBase = runner('git', ['merge-base', 'HEAD', `origin/${base}`], { allowFail: true });
  if (!mergeBase) {
    throw new PrChecksError('NO_MERGE_BASE', `Could not compute a merge-base against origin/${base}. Is it fetched?`);
  }
  const diff = runner('git', ['diff', '--name-only', mergeBase, 'HEAD'], { allowFail: true });
  return splitLines(diff);
}

function detectComponents(changedFiles) {
  return {
    frontend_ims: changedFiles.some((file) => PATH_FILTERS.frontend_ims.test(file)),
    frontend_pos: changedFiles.some((file) => PATH_FILTERS.frontend_pos.test(file)),
    frontend_storefront: changedFiles.some((file) => PATH_FILTERS.frontend_storefront.test(file)),
    dgfy_api: changedFiles.some((file) => PATH_FILTERS.dgfy_api.test(file)),
    migration_runner: changedFiles.some((file) => PATH_FILTERS.migration_runner.test(file)),
  };
}

// --- unavailability classification ------------------------------------------

function classifyCiUnavailability({ headSha, thresholdMinutes, nowMs }, deps = {}) {
  const fetchRunners = deps.fetchRunners || (() => captureJson('gh', ['api', `repos/${REPO_SLUG}/actions/runners`]));
  const fetchCheckRuns = deps.fetchCheckRuns || (() => captureJson('gh', [
    'api', '-H', 'Accept: application/vnd.github+json',
    `repos/${REPO_SLUG}/commits/${headSha}/check-runs?per_page=100`,
  ]));
  const tryBillingFallback = deps.tryBillingFallback || (() => {
    try {
      // eslint-disable-next-line global-require
      const { collect } = require('./collect-github-actions-unavailability');
      const report = collect({ repository: REPO_SLUG, targetSha: headSha, requiredChecks: ['dgfy-api-build-check', 'frontend-ims-build-check', 'frontend-pos-build-check', 'frontend-storefront-build-check', 'migration-runner-build-check'], output: '' });
      return report;
    } catch {
      return null;
    }
  });

  const runnersResponse = fetchRunners();
  const runners = runnersResponse && Array.isArray(runnersResponse.runners) ? runnersResponse.runners : null;
  if (runners && runners.length > 0 && runners.every((r) => r.status !== 'online')) {
    return { reason: 'runner_offline', evidence: `all ${runners.length} runner(s) reported non-online status` };
  }

  const checkRunsResponse = fetchCheckRuns();
  const checkRuns = checkRunsResponse && Array.isArray(checkRunsResponse.check_runs) ? checkRunsResponse.check_runs : [];
  const now = nowMs;
  const starved = checkRuns.filter((run) => {
    if (run.status === 'queued' || run.status === 'in_progress') {
      const startedAtMs = run.started_at ? Date.parse(run.started_at) : null;
      if (!startedAtMs) return false;
      return (now - startedAtMs) / 60000 >= thresholdMinutes;
    }
    return run.status === 'completed' && run.conclusion === 'cancelled';
  });
  if (starved.length > 0) {
    return {
      reason: 'queue_starvation',
      evidence: `${starved.length} check run(s) queued/in_progress past ${thresholdMinutes}min or cancelled without a conclusion: ${starved.map((r) => r.name).join(', ')}`,
    };
  }

  const billingReport = tryBillingFallback();
  if (billingReport && billingReport.status === 'pass') {
    return { reason: 'billing_allocation_failure', evidence: 'verified GitHub billing allocation failure (see scripts/collect-github-actions-unavailability.js)' };
  }

  // RF-1 gate: only ask "is GitHub down globally" once local evidence shows
  // nothing was ever created for THIS sha. checkRuns is already fetched above
  // for the queue_starvation check -- reuse it rather than re-fetching. A
  // non-empty checkRuns array (even one completed/successful run) proves this
  // SHA's checks ran, which a global degraded/outage status does not override.
  if (checkRuns.length === 0) {
    const fetchCheckSuites = deps.fetchCheckSuites || (() => captureJson('gh', [
      'api', '-H', 'Accept: application/vnd.github+json',
      `repos/${REPO_SLUG}/commits/${headSha}/check-suites?per_page=100`,
    ]));
    const checkSuitesResponse = fetchCheckSuites();
    const suitesCount = checkSuitesResponse && typeof checkSuitesResponse.total_count === 'number'
      ? checkSuitesResponse.total_count
      : null;

    // suitesCount === 0 only (not `!suitesCount`, which would also match
    // `null` on a failed/unparseable fetch) -- an unconfirmed fetch must not
    // silently satisfy the gate.
    if (suitesCount === 0) {
      // Public, unauthenticated endpoint -- curl, not `gh api`, and tolerant
      // of any failure (offline dev box, DNS hiccup, githubstatus.com itself
      // down): captureJson/captureStdout already return null on a non-zero
      // exit or bad JSON, so this fails safe straight through to `healthy`
      // below rather than throwing. Never claim an outage we couldn't
      // actually confirm.
      const fetchGithubStatus = deps.fetchGithubStatus || (() => captureJson('curl', ['-s', '--max-time', '5', 'https://www.githubstatus.com/api/v2/summary.json']));
      const statusSummary = fetchGithubStatus();
      const actionsComponent = statusSummary && Array.isArray(statusSummary.components)
        ? statusSummary.components.find((c) => c.name === 'Actions')
        : null;
      if (actionsComponent && actionsComponent.status && actionsComponent.status !== 'operational') {
        // Match the incident that actually lists the Actions component --
        // incidents[] can carry incidents affecting other components (Pages,
        // Packages, ...) that have nothing to do with why Actions is down.
        // Omit the note entirely rather than cite the wrong one.
        const relevantIncident = Array.isArray(statusSummary.incidents)
          ? statusSummary.incidents.find((inc) => Array.isArray(inc.components)
            && inc.components.some((c) => c.id === actionsComponent.id))
          : null;
        const incidentNote = relevantIncident ? ` (incident: "${relevantIncident.name}", status ${relevantIncident.status})` : '';
        return {
          reason: 'github_platform_outage',
          evidence: `githubstatus.com reports Actions component status="${actionsComponent.status}"${incidentNote}, and zero check-suites exist for ${headSha}`,
        };
      }
    }
  }

  return { reason: 'healthy', evidence: 'no verified unavailability condition found' };
}

// --- individual checks -------------------------------------------------------

function addCheck(checks, name, localEquivalent, result, blocking = true) {
  checks.push({ name, localEquivalent, result, blocking });
  console.log(`[${result.toUpperCase()}] ${name} :: ${localEquivalent}`);
}

function runChecks(options, changedFiles, components) {
  const checks = [];
  const env = { ...process.env, GITHUB_BASE_REF: options.base };

  addCheck(checks, 'changes / detect', 'ported path filters from shared-changed-paths.yml', 'pass');

  const titleOk = /^(feat|fix|docs|style|refactor|perf|test|chore|build|ci|revert)(\([^)]+\))?(!)?: .+/.test(options.prTitle || '');
  addCheck(checks, 'PR title conventional-commit', 'regex from shared-changed-paths.yml', titleOk ? 'pass' : 'warn', false);

  const bodyOk = Boolean(options.prBody && options.prBody.includes('## Summary') && options.prBody.includes('## Testing Evidence'));
  addCheck(checks, 'PR body sections', '## Summary + ## Testing Evidence present', bodyOk ? 'pass' : 'warn', false);

  const receiptResult = runCommand('node', ['scripts/check-pos-receipt-version-bump.js'], { env });
  addCheck(checks, 'pos-receipt version bump', 'node scripts/check-pos-receipt-version-bump.js', receiptResult.ok ? 'pass' : 'warn', false);

  const complianceResult = runCommand('npm', ['run', 'check:compliance'], { env });
  addCheck(checks, 'compliance impact declarations (stricter than CI — CI runs this advisory today)', 'npm run check:compliance', complianceResult.ok ? 'pass' : 'fail');

  if (components.dgfy_api) {
    const ciResult = runCommand('npm', ['ci', '--omit=dev', '--dry-run', '--prefix', 'apps/dgfy-api']);
    const jsFiles = changedFiles.filter((f) => f.startsWith('apps/dgfy-api/') && f.endsWith('.js'));
    const syntaxOk = jsFiles.every((f) => runCommand('node', ['--check', f]).ok);
    addCheck(checks, 'dgfy-api-build-check', 'npm ci --omit=dev --dry-run + node --check on changed .js', (ciResult.ok && syntaxOk) ? 'pass' : 'fail');

    const archResult = runCommand('npm', ['run', 'check:architecture:dgfy-api']);
    addCheck(checks, 'dgfy-api architecture guardrails', 'npm run check:architecture:dgfy-api', archResult.ok ? 'pass' : 'fail');
  }

  if (components.migration_runner) {
    const ciResult = runCommand('npm', ['ci', '--omit=dev', '--dry-run', '--prefix', 'apps/dgfy-migration-runner']);
    const jsFiles = changedFiles.filter((f) => f.startsWith('apps/dgfy-migration-runner/') && f.endsWith('.js'));
    const syntaxOk = jsFiles.every((f) => runCommand('node', ['--check', f]).ok);
    addCheck(checks, 'dgfy-migration-runner-build-check', 'npm ci --omit=dev --dry-run + node --check on changed .js', (ciResult.ok && syntaxOk) ? 'pass' : 'fail');
  }

  // One real `vite build` per changed app, run serially -- never in parallel
  // against multiple apps at once, which is what OOM-killed the old combined
  // build:all:parallel locally against the 3.8GB Docker VM ceiling (#662);
  // serial has no such ceiling running natively. Post-split (issue #322)
  // each app has its own build script; there is no single build:all anymore.
  const frontendApps = [
    { key: 'frontend_ims', name: 'frontend-ims-build-check', dir: 'apps/dgfy-ims' },
    { key: 'frontend_pos', name: 'frontend-pos-build-check', dir: 'apps/dgfy-pos' },
    { key: 'frontend_storefront', name: 'frontend-storefront-build-check', dir: 'apps/dgfy-storefront' },
  ];
  for (const app of frontendApps) {
    if (!components[app.key]) continue;
    const buildResult = runCommand('npm', ['--prefix', app.dir, 'run', 'build']);
    addCheck(checks, app.name, `npm --prefix ${app.dir} run build`, buildResult.ok ? 'pass' : 'fail');
  }

  const docTouchingFiles = changedFiles.some((f) => /^(docs\/|AGENTS\.md$|scripts\/lint-docs\.js$|scripts\/check-adr\.js$|package\.json$)/.test(f));
  if (docTouchingFiles) {
    const lintResult = runCommand('npm', ['run', 'lint:docs']);
    addCheck(checks, 'docs lint (lint:docs)', 'npm run lint:docs', lintResult.ok ? 'pass' : 'fail');
  }

  const agentSurfaceTouched = changedFiles.some((f) => /^(\.agents\/skills\/|\.claude\/skills\/|\.claude\/agents\/|AGENTS\.md$)/.test(f));
  if (agentSurfaceTouched) {
    const surfacesResult = runCommand('npm', ['run', 'check:agent-surfaces']);
    addCheck(checks, 'agent-surfaces anti-drift', 'npm run check:agent-surfaces', surfacesResult.ok ? 'pass' : 'fail');
  }

  if (options.tier === 'full') {
    runFullTierDockerChecks(checks, components);
  }

  return checks;
}

function runFullTierDockerChecks(checks, components) {
  const builds = [
    { key: 'dgfy_api', name: 'dgfy-api-build-check (docker)', file: 'infrastructure/docker/dgfy-api/Dockerfile' },
    { key: 'migration_runner', name: 'dgfy-migration-runner-build-check (docker)', file: 'infrastructure/docker/dgfy-migration-runner/Dockerfile' },
    { key: 'frontend_ims', name: 'frontend-ims-build-check (docker)', file: 'infrastructure/docker/dgfy-ims/Dockerfile' },
    { key: 'frontend_pos', name: 'frontend-pos-build-check (docker)', file: 'infrastructure/docker/dgfy-pos/Dockerfile' },
    { key: 'frontend_storefront', name: 'frontend-storefront-build-check (docker)', file: 'infrastructure/docker/dgfy-storefront/Dockerfile' },
  ];
  for (const build of builds) {
    if (!components[build.key]) continue;
    const result = spawnSync('docker', ['build', '-f', build.file, '.'], { stdio: 'inherit', cwd: repoRoot });
    if (result.status === 137) {
      addCheck(checks, build.name, `docker build -f ${build.file} .`, 'fail');
      console.error(`[pr-checks] ${build.name} was OOM-killed (exit 137). This is the local Docker VM's memory ceiling, not a code defect -- see #662.`);
      continue;
    }
    addCheck(checks, build.name, `docker build -f ${build.file} .`, result.status === 0 ? 'pass' : 'fail');
  }
}

// --- output -------------------------------------------------------------

function renderComment({ overallResult, unavailability, checks, tier, host, headSha }) {
  const rows = checks.map((c) => `| ${c.name} | ${c.localEquivalent} | ${c.result} |`).join('\n');
  const notReproduced = tier === 'full' ? NOT_REPRODUCED_LOCALLY.filter((l) => !l.includes('the three image builds')) : [...NOT_REPRODUCED_LOCALLY, 'the three image builds themselves (fast tier only checks dependency resolution / syntax)'];
  return `## Local CI — ${overallResult}

CI unavailable because: ${unavailability.reason} — ${unavailability.evidence}
Commit: ${headSha}
Host: ${host.platform}/${host.arch}, node ${host.nodeVersion}. Tier: ${tier}.
**These are local runs, not CI runs.** This comment is evidence for commit \`${headSha}\` only —
a merge reviewer must confirm this matches the PR's current head commit before treating it as
qualifying evidence (a later push invalidates it; re-run instead of reusing).

| CI check | Local equivalent | Result |
|---|---|---|
${rows}

**Not reproduced locally:**
${notReproduced.map((l) => `- ${l}`).join('\n')}

**Override:** ${overallResult === 'PASS' ? 'merging on this evidence per AGENTS.md Merge Safety carve-out (develop/staging only, never main)' : 'not invoked — local checks did not pass'}
`;
}

// `gh pr comment --edit-last` edits the last comment by the *currently
// authenticated user*, not the last `## Local CI` comment specifically. This
// repo has no separate bot identity -- every role, pr-reviewer included,
// authenticates as the same account -- so `--edit-last` would silently
// overwrite an unrelated comment (a pr-reviewer `## Review` verdict, a
// Worker's reply addressing findings) if one landed after the last Local CI
// post. Scope the edit to a comment this tool itself owns instead, found by
// its `## Local CI —` body prefix, not by authorship (#725 RF-1).
function findLatestLocalCiComment(prNumber, fetcher = defaultCommentsFetcher) {
  const comments = fetcher(prNumber);
  if (!Array.isArray(comments)) return null;
  // The REST list endpoint returns comments in ascending creation order, and
  // this only inspects the first page (per_page=100) -- more than 100
  // comments on one PR is not a realistic case for this repo today.
  const matches = comments.filter((c) => typeof c.body === 'string' && c.body.startsWith('## Local CI —'));
  return matches.length > 0 ? matches[matches.length - 1] : null;
}

function defaultCommentsFetcher(prNumber) {
  return captureJson('gh', ['api', `repos/${REPO_SLUG}/issues/${prNumber}/comments?per_page=100`]);
}

function postComment(prNumber, body, deps = {}) {
  const tmpFile = path.join(repoRoot, '.tmp', 'pr-checks', `comment-${prNumber}.md`);
  fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
  fs.writeFileSync(tmpFile, body);

  const findComment = deps.findLatestLocalCiComment || findLatestLocalCiComment;
  const existing = findComment(prNumber);
  if (existing) {
    const result = spawnSync('gh', ['api', '-X', 'PATCH', `repos/${REPO_SLUG}/issues/comments/${existing.id}`, '-F', `body=@${tmpFile}`], { stdio: 'inherit', cwd: repoRoot });
    return result.status === 0;
  }
  const result = spawnSync('gh', ['pr', 'comment', String(prNumber), '--body-file', tmpFile], { stdio: 'inherit', cwd: repoRoot });
  return result.status === 0;
}

// --- main -----------------------------------------------------------------

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.pr) {
    options.pr = captureStdout('gh', ['pr', 'view', '--json', 'number', '-q', '.number']);
  }
  const prJson = options.pr ? captureJson('gh', ['pr', 'view', String(options.pr), '--json', 'title,body,headRefOid']) : null;
  options.prTitle = prJson && prJson.title;
  options.prBody = prJson && prJson.body;
  const headSha = (prJson && prJson.headRefOid) || captureStdout('git', ['rev-parse', 'HEAD']);

  const changedFiles = resolveChangedFiles(options.base);
  const components = detectComponents(changedFiles);

  console.log(`[pr-checks] tier=${options.tier} base=${options.base} pr=${options.pr || '<unresolved>'} sha=${headSha}`);
  console.log(`[pr-checks] components: frontend_ims=${components.frontend_ims} frontend_pos=${components.frontend_pos} frontend_storefront=${components.frontend_storefront} dgfy_api=${components.dgfy_api} migration_runner=${components.migration_runner}`);

  const checks = runChecks(options, changedFiles, components);
  const failed = checks.filter((c) => c.blocking && c.result === 'fail');
  const overallResult = failed.length > 0 ? 'FAIL' : (checks.some((c) => c.result === 'warn') ? 'PARTIAL' : 'PASS');

  const unavailability = classifyCiUnavailability({ headSha, thresholdMinutes: options.thresholdMinutes, nowMs: Date.now() });

  const host = { platform: process.platform, arch: process.arch, nodeVersion: process.version };
  const comment = renderComment({ overallResult, unavailability, checks, tier: options.tier, host, headSha });

  const reportPath = options.report || path.join(repoRoot, '.tmp', 'pr-checks', `${headSha}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({ generated_at: new Date().toISOString(), pr: options.pr, headSha, tier: options.tier, overallResult, unavailability, checks }, null, 2));
  console.log(`[pr-checks] report written to ${reportPath}`);
  console.log(`\n${comment}`);

  if (options.post) {
    if (unavailability.reason === 'healthy') {
      console.error('[pr-checks] CI appears healthy — no override justified. Refusing to post (this tool is not a routine CI bypass).');
      process.exitCode = 1;
      return;
    }
    if (!options.pr) {
      console.error('[pr-checks] --post requires a resolvable PR number (pass --pr N or run from a branch with an open PR).');
      process.exitCode = 1;
      return;
    }
    const posted = postComment(options.pr, comment);
    if (!posted) {
      console.error('[pr-checks] failed to post PR comment.');
      process.exitCode = 1;
      return;
    }
  }

  if (overallResult === 'FAIL') process.exitCode = 2;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[pr-checks] ${error.code || 'FAILED'}: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  PrChecksError,
  PATH_FILTERS,
  parseArgs,
  detectComponents,
  classifyCiUnavailability,
  renderComment,
  findLatestLocalCiComment,
  postComment,
  runCommand,
  captureStdout,
};
