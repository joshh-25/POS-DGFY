#!/usr/bin/env node

// Phase 233 (#1365): validates the commented-hosted-scaffold convention described in
// docs/ops/CI_RUNNER_MIGRATION_HANDOFF.md ("Status as of 2026-09-02 -- Phase 233 scaffold") --
// every non-exempt runner-class site in the two PROD-facing workflows carries a commented,
// opposite-class alternate line directly above its active line, so a future edit can flip the
// active line but cannot silently *lose* the alternate or leave both lines on the same class.
//
// This is a *routing-convention* checker, deliberately separate from
// scripts/check-pr-quality-workflow.js (which asserts pr-checks.yml's own
// RUNNER_HEAVY_JSON/BUILD_CACHE_FROM pairing and promotion-quality-gate.yml's #1063
// if:/continue-on-error: shape) -- this file extends the spirit of that validator's
// class-detection mechanism (checkRunnerCacheConsistency's ubuntu-latest/windows-latest/
// macos-latest test) rather than duplicating its pairing logic, which only ever covers one
// anchor pair in a different file.
//
// Phase 233 is a SCAFFOLD ONLY: no active runner_labels_json/runs-on value changes as part of
// standing this validator up. It exists so that a *future* flip (Phase 234) -- or a future,
// unrelated edit that accidentally drops a commented alternate -- fails CI instead of silently
// inverting or degrading the routing strategy.

const fs = require('node:fs');
const path = require('node:path');
const { EXPECTED_ACTIVE_CLASS } = require('./lib/runner-routing-state');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

// Detects a GitHub-hosted runner image literal. Same mechanism
// check-pr-quality-workflow.js:checkRunnerCacheConsistency already uses (#923: self-hosted no
// longer carries a literal 'self-hosted' label, so hosted-vs-not is detected by the *presence* of
// a hosted image name, not the absence of a string that no longer appears either way).
const HOSTED_IMAGE_RE = /ubuntu-latest|windows-latest|macos-latest/;
const isHosted = (text) => HOSTED_IMAGE_RE.test(text);

// The three jobs that stay self-hosted permanently, by design (Wave 1 Sec 1.4), with no commented
// hosted alternate at all -- a documented decision, not an omission. Keyed by file so a same-named
// job in a different file (none exist today) can't accidentally inherit the exemption.
const ANCHOR_ALLOWLIST = {
  'deploy-main.yml': new Set(['guard-branch']),
  'promotion-quality-gate.yml': new Set(['gate', 'report-advisory-failures'])
};

// F-2 co-location invariant: salvage-api-evidence recomputes and reads dgfy-api-quality's
// workspace path directly -- that only exists on the same box under self-hosted. The two jobs'
// active class must always match, in either file (there's currently one instance, but the
// invariant is not "this one instance", it's the relationship, so it's expressed generically).
//
// Phase 234 Wave 0 (#1375): salvage-api-evidence's own working steps are now additionally gated
// at the step level on `runner.environment == 'self-hosted'` (a step-level context this job-level
// `runs-on:`/`if:` pairing check cannot see and does not need to -- the job still always carries
// both classes' commented/active lines, kept in lockstep with dgfy-api-quality's by this same
// invariant, exactly as before). That per-step gating is what makes a hosted run of this job loud
// (an explicit ::warning:: + step summary) instead of silently degrading to a no-op the way
// if-no-files-found: warn alone did -- see the job's own header comment in the workflow file for
// the full resolution. Nothing about the co-location invariant itself changed; this comment exists
// only so a reader of this file doesn't have to go looking for why that per-step gating doesn't
// also need an assertion here.
const CO_LOCATION_PAIRS = [
  { file: 'promotion-quality-gate.yml', primary: 'dgfy-api-quality', dependent: 'salvage-api-evidence' }
];

// Both files this scaffold covers are PROD-only workflows in their entirety (deploy-main.yml has
// no DEV/STAGING path at all -- guard-branch refuses anything but refs/heads/main;
// promotion-quality-gate.yml's runner_labels_json fallback is reached only on the release/*->main
// leg, per F-3). Assertion 5 (no hosted job may target DEV/STAGING) is therefore checked by
// asserting neither file's job blocks reference `environment: DEV` or `environment: STAGING` at
// all -- if one ever did, and that job's site were hosted, the VPN gap Wave 1 Sec 1.5 confirmed
// closed would silently reopen.
const DEV_STAGING_ENV_RE = /environment:\s*(DEV|STAGING)\b/;

const TARGET_FILES = ['deploy-main.yml', 'promotion-quality-gate.yml'];

// Phase 234 (#1365) Wave 1, Assertion 7 (AC-1 regression guard): ordinary develop/staging-facing
// workflow files that must never carry a hosted runner literal at any runs-on:/runner_labels_json:
// site -- deploy.yml/deployment-orchestrator.yml have no LAN path from a hosted VM to the DEV/
// STAGING boxes (CI_RUNNER_POLICY.md, "VPN"), and the three pr-*-build-checks.yml files listed here
// are ordinary PR-triggered checks that stay self-hosted by policy. Deliberately excludes
// pr-android-build-checks.yml and build-android-manual.yml -- documented exception, neither box
// carries an Android SDK either way, so those two are free to run hosted.
//
// #1529 (2026-09-03): pr-checks.yml itself joins this list -- previously ungoverned by this
// assertion at all, even though it's exactly the "ordinary PR-triggered check, self-hosted by
// policy" class the paragraph above already describes. It now carries one legitimate, narrow
// exception: a release/*|hotfix/* head into a main base routes its build-check jobs to
// GitHub-hosted runners (the route-build-checks job), matching CI_RUNNER_POLICY.md's
// promotion/hotfix-to-main rationale one step earlier in the PR lifecycle. That hosted literal
// ('["ubuntu-latest"]') lives inside route-build-checks's own shell step as a bash variable
// assignment, never at a line whose key is runner_labels_json:/runs-on: -- so it never matches
// checkNoHostedLiteral's siteRe pattern below and needs no allowlist carve-out. Any OTHER hosted
// literal actually appearing at a runner_labels_json:/runs-on: site in this file (an accidental
// unconditional flip, or a wrong condition copy-pasted into a build-check job's own with: block)
// still fails this check exactly as it always has -- that's the regression this file exists to
// catch, unchanged. See check-runner-routing.test.js for the fixture proving both halves.
const NON_HOSTED_FILES = [
  'deploy.yml',
  'deployment-orchestrator.yml',
  'pr-checks.yml',
  'pr-dgfy-api-build-checks.yml',
  'pr-frontend-build-checks.yml',
  'pr-migration-runner-build-checks.yml'
];

// Phase 234 Wave 1: verify-deployment.yml's runner_labels_json input `default:` must stay
// self-hosted -- Wave 2 added an input to it (default unchanged) precisely so hosted could be
// *proven* read-only via a dispatch-time override without ever changing what an un-overridden
// dispatch actually does.
const VERIFY_DEPLOYMENT_FILE = 'verify-deployment.yml';

// Phase 234 Wave 3 (#1365, F-5): deploy-main.yml's own runner_labels_json workflow_dispatch
// input, added at the live cutover so the emergency fallback is "re-dispatch with one input" not
// "comment/uncomment 6 sites and push a commit to main". A job's active `runner_labels_json:` line
// that matches this exactly (no fromJSON/`||` fallback -- that's promotion-quality-gate.yml's
// reusable-workflow-runs-on pattern, a different site shape) delegates its class to that single
// input rather than carrying its own local commented alternate; checkFile below resolves such a
// site's class from the file's own input default instead of requiring a per-job pair.
const DELEGATED_INPUT_RE = /^\s*runner_labels_json:\s*\$\{\{\s*inputs\.runner_labels_json\s*\}\}\s*$/;

/**
 * Extracts every top-level (`  <name>:`) job block from a workflow file's `jobs:` section text,
 * keyed by job name, each value being the block's raw text (job header line through the line
 * before the next 2-space-indented key or EOF).
 *
 * @param {string} text workflow file contents
 * @returns {Map<string, {block: string, startLine: number}>}
 */
function extractJobBlocks(text) {
  const lines = text.split('\n');
  const blocks = new Map();
  const jobHeaderRe = /^ {2}([a-zA-Z][\w-]*):\s*$/;
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(jobHeaderRe);
    if (match) {
      // Include the contiguous run of `  # ...`-indented comment lines immediately above the
      // header (e.g. the anchor-exception explanation) as part of *this* job's block -- a job's
      // "why" comment conventionally sits directly above its own header, not inside its steps.
      // Computed before closing the previous block so the two never overlap.
      let leadStart = i;
      while (leadStart > 0 && /^ {0,2}#/.test(lines[leadStart - 1])) leadStart--;
      if (current) {
        current.block = lines.slice(current.startLine, leadStart).join('\n');
      }
      current = { name: match[1], startLine: leadStart };
      blocks.set(match[1], current);
    }
  }
  if (current) {
    current.block = lines.slice(current.startLine, lines.length).join('\n');
  }
  return blocks;
}

/**
 * Finds every *active* (uncommented) `runner_labels_json:` / `runs-on:` line in a job block, each
 * paired with whatever non-blank line precedes it in the block (which may or may not be a valid
 * commented alternate -- that's what the caller checks).
 *
 * Anchored to the key being the first non-whitespace character on the line -- a commented line
 * (`      # runner_labels_json: ...`) has `#` there instead, so it never matches this regex; no
 * separate "skip comments" step is needed.
 *
 * @param {string} block job block text
 * @returns {Array<{line: string, precedingLine: string | null}>}
 */
function findActiveSites(block) {
  const lines = block.split('\n');
  const activeRe = /^ {2,10}(runner_labels_json|runs-on):\s*(.+)$/;
  const sites = [];
  for (let i = 0; i < lines.length; i++) {
    if (activeRe.test(lines[i])) {
      let j = i - 1;
      while (j >= 0 && lines[j].trim() === '') j--;
      sites.push({ line: lines[i], precedingLine: j >= 0 ? lines[j] : null });
    }
  }
  return sites;
}

/**
 * Locates the single special site outside any job block: the `default:` value on a
 * `runner_labels_json` workflow input. In promotion-quality-gate.yml this is shared by the
 * `workflow_call:`/`workflow_dispatch:` triggers via the `&runner_labels_input` YAML anchor (one
 * physical site, both triggers); in deploy-main.yml (Phase 234 Wave 3, F-5) it's a plain
 * `workflow_dispatch:` input with no anchor. Same shape either way -- an 8-space-indented
 * `default:` line following a `runner_labels_json:` key line -- so one extractor covers both
 * rather than forcing findActiveSites/extractJobBlocks to understand YAML anchors and non-job
 * top-level keys.
 *
 * @param {string} text workflow file contents
 * @returns {{activeLine: string, precedingLine: string} | null} the site, or null if not found
 */
function extractInputDefaultSite(text) {
  const anchorMatch = text.match(/runner_labels_json:\n(?:[^\n]*\n)*?( {8}default: .*)\n/);
  if (!anchorMatch) return null;
  const activeLine = anchorMatch[1];
  const beforeIndex = anchorMatch.index + anchorMatch[0].indexOf(activeLine);
  const precedingLine = text.slice(0, beforeIndex).split('\n').slice(-2, -1)[0] ?? '';
  return { activeLine, precedingLine };
}

/**
 * Checks one file's `runner_labels_json` input `default:` site -- must be correctly paired with a
 * commented, opposite-class alternate directly above it, same convention as every job-level site.
 *
 * @param {string} file which file, for message prefixing
 * @param {string} text workflow file contents
 * @returns {string[]} problems found; empty when the site is correctly paired
 */
function checkInputDefaultSite(file, text) {
  const problems = [];
  const site = extractInputDefaultSite(text);
  if (!site) {
    problems.push(
      `${file}: could not find the runner_labels_json input's \`default:\` line -- did the ` +
      'workflow_call/workflow_dispatch input block get renamed or restructured? ' +
      'checkInputDefaultSite needs updating to match.'
    );
    return problems;
  }
  problems.push(...checkPair(file, 'runner_labels_json input default', site.activeLine, site.precedingLine, 'default:'));
  return problems;
}

/**
 * Validates one active/preceding line pair: the preceding line must be a comment carrying the
 * same key and an opposite-class value.
 *
 * @param {string} file which file, for message prefixing
 * @param {string} siteLabel job name or site description, for message prefixing
 * @param {string} activeLine the uncommented active line
 * @param {string | null} precedingLine whatever line precedes it (may be null at block start)
 * @param {string} key the key text expected in both lines ('runner_labels_json:' or 'runs-on:' or 'default:')
 * @returns {string[]} problems found; empty when the pair is valid
 */
function checkPair(file, siteLabel, activeLine, precedingLine, key) {
  const problems = [];
  const prefix = `${file}: "${siteLabel}"`;
  if (precedingLine === null || !precedingLine.trim().startsWith('#')) {
    problems.push(
      `${prefix} has no commented alternate line immediately above its active ${key} line -- every ` +
      'non-exempt site must carry one (see docs/ops/CI_RUNNER_MIGRATION_HANDOFF.md\'s Phase 233 entry).'
    );
    return problems;
  }
  const commentText = precedingLine.trim().replace(/^#\s*/, '');
  if (!commentText.startsWith(key)) {
    problems.push(
      `${prefix}'s commented line immediately above the active ${key} line does not itself start ` +
      `with "${key}" (found: "${commentText}") -- the alternate must be the same key, commented out, ` +
      'not an unrelated comment that happens to sit there.'
    );
    return problems;
  }
  const activeHosted = isHosted(activeLine);
  const commentedHosted = isHosted(precedingLine);
  if (activeHosted === commentedHosted) {
    problems.push(
      `${prefix}'s active and commented-alternate lines are both ${activeHosted ? 'hosted' : 'self-hosted'} ` +
      '-- they must be opposite classes (one hosted, one self-hosted), or the alternate isn\'t a real fallback.'
    );
  }
  return problems;
}

/**
 * Checks one target file end to end: every job's active runner-class sites are either a
 * documented anchor exception or correctly paired with a commented, opposite-class alternate.
 *
 * @param {string} file relative workflow path, for message prefixing
 * @param {string} text file contents
 * @returns {{problems: string[], jobClasses: Map<string, boolean>}} problems found, plus a
 *   job-name -> isHosted map (active class) other checks (co-location, DEV/STAGING) reuse
 */
function checkFile(file, text) {
  const problems = [];
  const jobClasses = new Map();
  const blocks = extractJobBlocks(text);
  const allowlist = ANCHOR_ALLOWLIST[file] || new Set();
  const inputSite = extractInputDefaultSite(text);
  const inputDefaultHosted = inputSite ? isHosted(inputSite.activeLine) : null;

  for (const [jobName, { block }] of blocks) {
    const sites = findActiveSites(block);
    if (sites.length === 0) continue;
    if (sites.length > 1) {
      problems.push(
        `${file}: "${jobName}" has ${sites.length} active runner_labels_json:/runs-on: lines -- ` +
        'expected exactly one per job; checkFile needs updating if this job now legitimately has more.'
      );
    }
    const { line, precedingLine } = sites[0];

    // Phase 234 Wave 3 (F-5): a job that delegates to the file's own runner_labels_json input has
    // no local literal to pair-check -- its class is whatever the input's own default: site
    // resolves to, and *that* site is what carries the commented alternate (checked once, by
    // checkInputDefaultSite, not per delegating job).
    if (DELEGATED_INPUT_RE.test(line)) {
      if (inputDefaultHosted === null) {
        problems.push(
          `${file}: "${jobName}" delegates its runner class to this file's own runner_labels_json ` +
          `workflow_dispatch input ("${line.trim()}"), but no such input default: site could be ` +
          'found in this file -- add one, or stop delegating and give this job its own literal ' +
          'commented/active pair.'
        );
        jobClasses.set(jobName, false);
      } else {
        jobClasses.set(jobName, inputDefaultHosted);
      }
      continue;
    }

    jobClasses.set(jobName, isHosted(line));

    if (allowlist.has(jobName)) {
      // Anchor exception: must NOT carry a commented hosted alternate (that would silently offer
      // a flip path for a job whose whole point is to never move), and must document why in the
      // block itself.
      if (precedingLine && precedingLine.trim().startsWith('#') &&
          /runner_labels_json:|runs-on:/.test(precedingLine)) {
        problems.push(
          `${file}: "${jobName}" is an anchor exception (never routed hosted) but carries a ` +
          'commented runner_labels_json:/runs-on: alternate anyway -- remove it, or remove the job ' +
          'from ANCHOR_ALLOWLIST if it\'s no longer meant to be an anchor.'
        );
      }
      if (!/anchor exception/i.test(block)) {
        problems.push(
          `${file}: "${jobName}" is in ANCHOR_ALLOWLIST but its block has no comment explaining why ` +
          '-- every anchor exception must document its own reason (see Wave 1 Sec 1.4).'
        );
      }
      continue;
    }

    const key = /^ {2,10}runner_labels_json:/.test(line) ? 'runner_labels_json:' : 'runs-on:';
    problems.push(...checkPair(file, jobName, line, precedingLine, key));
  }

  // Assertion 3 (anchor allowlist / "a fourth uncommented site fails"): covered above by
  // construction -- every job's active site either matched a valid commented-alternate pair
  // (fine), is in ANCHOR_ALLOWLIST with its own documented reason (fine), or produced a concrete
  // problem above. No separate scan is needed.

  return { problems, jobClasses };
}

/**
 * Assertion 4 (F-2): every co-location pair's dependent job must carry the exact same active
 * class as its primary job.
 */
function checkCoLocation(jobClassesByFile) {
  const problems = [];
  for (const { file, primary, dependent } of CO_LOCATION_PAIRS) {
    const classes = jobClassesByFile.get(file);
    if (!classes || !classes.has(primary) || !classes.has(dependent)) {
      problems.push(
        `${file}: co-location pair "${primary}"/"${dependent}" -- one or both jobs not found ` +
        '(renamed or removed?); checkCoLocation needs updating to match.'
      );
      continue;
    }
    const primaryHosted = classes.get(primary);
    const dependentHosted = classes.get(dependent);
    if (primaryHosted !== dependentHosted) {
      problems.push(
        `${file}: "${dependent}" is ${dependentHosted ? 'hosted' : 'self-hosted'} but "${primary}" ` +
        `is ${primaryHosted ? 'hosted' : 'self-hosted'} -- these must always match (F-2: ` +
        `"${dependent}" recomputes and reads "${primary}"'s workspace path directly, which only ` +
        'exists on the same box under self-hosted). Flip both together, never independently.'
      );
    }
  }
  return problems;
}

/**
 * Assertion 5: no hosted job in either target file may target DEV/STAGING -- both files are
 * PROD-only in their entirety today, so this asserts that stays true rather than re-deriving VPN
 * requirements per job.
 */
function checkNoDevStagingTarget(file, text) {
  const problems = [];
  if (DEV_STAGING_ENV_RE.test(text)) {
    const match = text.match(DEV_STAGING_ENV_RE);
    problems.push(
      `${file}: found "environment: ${match[1]}" -- this file is expected to be PROD-only in its ` +
      'entirety (Wave 1 Sec 1.5: no VPN change was needed because neither file targets DEV/STAGING ' +
      'at all). A DEV/STAGING job here needs vpn_required: true before any hosted routing, and this ' +
      'validator needs updating to check it per-job instead of file-wide.'
    );
  }
  return problems;
}

/**
 * Assertion 6 (F-1, AC-6): every non-exempt site's active class must equal
 * EXPECTED_ACTIVE_CLASS -- the pairing invariant (Assertions 1-3) is necessary but not sufficient,
 * since it only ever asserts the two lines are *opposite* classes, never *which one is meant to be
 * active*. Both a full inversion of every site and a silent single-site inversion pass Assertions
 * 1-3 with zero problems; this is the assertion that actually catches either.
 *
 * The failure message deliberately names the constant and both files that must move together --
 * so a genuine emergency fallback flip isn't blocked by a confusing error, it's told exactly what
 * two things to edit.
 */
function checkActiveClassMatchesExpected(jobClassesByFile) {
  const problems = [];
  for (const file of TARGET_FILES) {
    const allowlist = ANCHOR_ALLOWLIST[file] || new Set();
    const classes = jobClassesByFile.get(file) || new Map();
    for (const [jobName, isJobHosted] of classes) {
      if (allowlist.has(jobName)) continue;
      const jobClass = isJobHosted ? 'hosted' : 'self-hosted';
      if (jobClass !== EXPECTED_ACTIVE_CLASS) {
        problems.push(
          `${file}: "${jobName}" is active-${jobClass} but scripts/lib/runner-routing-state.js's ` +
          `EXPECTED_ACTIVE_CLASS constant says "${EXPECTED_ACTIVE_CLASS}" -- a deliberate strategy ` +
          'flip requires editing EXPECTED_ACTIVE_CLASS *and* every runner_labels_json:/runs-on: ' +
          'site in deploy-main.yml/promotion-quality-gate.yml together, never one without the other.'
        );
      }
    }
  }
  return problems;
}

/**
 * Assertion 7 (AC-1 regression guard): NON_HOSTED_FILES must contain no hosted runner literal at
 * any runs-on:/runner_labels_json: site, active or commented -- these files aren't part of the
 * commented-alternate scaffold at all, so a hosted literal appearing anywhere in them (not just
 * "active") is itself the regression: a hosted class typo'd or copy-pasted into a DEV/STAGING or
 * ordinary-PR-check workflow with no VPN path to those hosts.
 */
function checkNoHostedLiteral(file, text) {
  const problems = [];
  const lines = text.split('\n');
  const siteRe = /^\s*#?\s*(runner_labels_json|runs-on):\s*(.+)$/;
  for (const line of lines) {
    if (siteRe.test(line) && isHosted(line)) {
      problems.push(
        `${file}: found a hosted runner literal at "${line.trim()}" -- this file is in ` +
        'NON_HOSTED_FILES/VERIFY_DEPLOYMENT_FILE and must never carry a hosted runner_labels_json:/' +
        'runs-on: value, active or commented (no LAN path from a hosted VM to DEV/STAGING, ' +
        'CI_RUNNER_POLICY.md "VPN"). Documented exception: pr-android-build-checks.yml / ' +
        'build-android-manual.yml.'
      );
    }
  }
  return problems;
}

function checkRunnerRouting({ deployMainText, qualityGateText, nonHostedFilesText, verifyDeploymentText }) {
  const filesText = {
    'deploy-main.yml': deployMainText,
    'promotion-quality-gate.yml': qualityGateText
  };

  const problems = [];
  const jobClassesByFile = new Map();

  for (const file of TARGET_FILES) {
    const { problems: fileProblems, jobClasses } = checkFile(file, filesText[file]);
    problems.push(...fileProblems);
    problems.push(...checkNoDevStagingTarget(file, filesText[file]));
    jobClassesByFile.set(file, jobClasses);
  }

  problems.push(...checkInputDefaultSite('promotion-quality-gate.yml', qualityGateText));
  problems.push(...checkInputDefaultSite('deploy-main.yml', deployMainText));
  problems.push(...checkCoLocation(jobClassesByFile));
  problems.push(...checkActiveClassMatchesExpected(jobClassesByFile));

  // nonHostedFilesText is opt-in: omitted entirely (undefined), Assertion 7's NON_HOSTED_FILES
  // scan is skipped -- used by fixture-only tests that exercise Assertions 1-6 without needing
  // to also supply the five unrelated non-hosted files. main() below always supplies it (real run).
  if (nonHostedFilesText !== undefined) {
    for (const file of NON_HOSTED_FILES) {
      if (nonHostedFilesText[file] === undefined) {
        problems.push(`${file}: NON_HOSTED_FILES entry has no text supplied to checkRunnerRouting -- caller needs updating.`);
        continue;
      }
      problems.push(...checkNoHostedLiteral(file, nonHostedFilesText[file]));
    }
  }

  if (verifyDeploymentText !== undefined) {
    problems.push(...checkNoHostedLiteral(VERIFY_DEPLOYMENT_FILE, verifyDeploymentText));
  }

  return problems;
}

function main() {
  const deployMainText = read('.github/workflows/deploy-main.yml');
  const qualityGateText = read('.github/workflows/promotion-quality-gate.yml');
  const nonHostedFilesText = {};
  for (const file of NON_HOSTED_FILES) {
    nonHostedFilesText[file] = read(`.github/workflows/${file}`);
  }
  const verifyDeploymentText = read(`.github/workflows/${VERIFY_DEPLOYMENT_FILE}`);

  const problems = checkRunnerRouting({ deployMainText, qualityGateText, nonHostedFilesText, verifyDeploymentText });

  if (problems.length > 0) {
    console.error('[runner-routing] FAILED');
    problems.forEach((entry) => console.error(` - ${entry}`));
    process.exit(1);
  }

  console.log(
    '[runner-routing] OK. Every non-exempt runner_labels_json:/runs-on: site in deploy-main.yml ' +
    'and promotion-quality-gate.yml carries a commented, opposite-class alternate directly above ' +
    'its active line; the three documented anchor exceptions (guard-branch, gate, ' +
    'report-advisory-failures) carry no such alternate and are self-explained in place; ' +
    'salvage-api-evidence\'s active class matches dgfy-api-quality\'s (F-2); neither file targets ' +
    'DEV/STAGING (Wave 1 Sec 1.5); every non-exempt site\'s active class matches ' +
    `EXPECTED_ACTIVE_CLASS ("${EXPECTED_ACTIVE_CLASS}"); NON_HOSTED_FILES and ` +
    'verify-deployment.yml carry no hosted runner literal.'
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  checkRunnerRouting,
  checkFile,
  checkPair,
  checkInputDefaultSite,
  extractInputDefaultSite,
  checkCoLocation,
  checkNoDevStagingTarget,
  checkActiveClassMatchesExpected,
  checkNoHostedLiteral,
  extractJobBlocks,
  findActiveSites,
  isHosted,
  ANCHOR_ALLOWLIST,
  CO_LOCATION_PAIRS,
  TARGET_FILES,
  NON_HOSTED_FILES,
  VERIFY_DEPLOYMENT_FILE,
  DELEGATED_INPUT_RE
};
