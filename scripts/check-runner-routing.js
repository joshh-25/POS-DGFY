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
 * Checks the single special site outside any job block: the `default:` value on the
 * `runner_labels_json` input, shared by the `workflow_call:`/`workflow_dispatch:` triggers via the
 * `&runner_labels_input` YAML anchor (one physical site, both triggers). Not a job block, so it's
 * handled separately rather than forcing findActiveSites/extractJobBlocks to understand YAML
 * anchors and non-job top-level keys.
 *
 * @param {string} qualityWorkflowText contents of promotion-quality-gate.yml
 * @returns {string[]} problems found; empty when the site is correctly paired
 */
function checkInputDefaultSite(qualityWorkflowText) {
  const problems = [];
  const anchorMatch = qualityWorkflowText.match(
    /runner_labels_json:\n(?:[^\n]*\n)*?( {8}default: .*)\n/
  );
  if (!anchorMatch) {
    problems.push(
      'promotion-quality-gate.yml: could not find the runner_labels_json input\'s `default:` line ' +
      '-- did the workflow_call/workflow_dispatch input block get renamed or restructured? ' +
      'checkInputDefaultSite needs updating to match.'
    );
    return problems;
  }
  const activeLine = anchorMatch[1];
  const beforeIndex = anchorMatch.index + anchorMatch[0].indexOf(activeLine);
  const precedingLine = qualityWorkflowText.slice(0, beforeIndex).split('\n').slice(-2, -1)[0] ?? '';
  problems.push(...checkPair('promotion-quality-gate.yml', 'runner_labels_json input default', activeLine, precedingLine, 'default:'));
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

function checkRunnerRouting({ deployMainText, qualityGateText }) {
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

  problems.push(...checkInputDefaultSite(qualityGateText));
  problems.push(...checkCoLocation(jobClassesByFile));

  return problems;
}

function main() {
  const deployMainText = read('.github/workflows/deploy-main.yml');
  const qualityGateText = read('.github/workflows/promotion-quality-gate.yml');

  const problems = checkRunnerRouting({ deployMainText, qualityGateText });

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
    'salvage-api-evidence\'s active class matches dgfy-api-quality\'s (F-2); and neither file ' +
    'targets DEV/STAGING (Wave 1 Sec 1.5).'
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
  checkCoLocation,
  checkNoDevStagingTarget,
  extractJobBlocks,
  findActiveSites,
  isHosted,
  ANCHOR_ALLOWLIST,
  CO_LOCATION_PAIRS,
  TARGET_FILES
};
