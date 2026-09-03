#!/usr/bin/env node

// #1528 (2026-09-03): self-hosted runners (`sieitz-runner` / `sieitz-lg`) reuse one persistent
// `_work/<repo>/<repo>` git workspace across every job that lands on the box, from every
// workflow. A `sparse-checkout:` on any self-hosted-reachable job poisons that shared workspace
// PERMANENTLY for every later, unrelated job -- `actions/checkout`'s own teardown cannot self-heal
// it (it disables sparse in `.git/config.worktree`, then unsets `extensions.worktreeConfig`,
// which makes git stop reading that file -- so the stale `core.sparseCheckout=true` left in
// `.git/config` stays authoritative, and `git status` reports the tree CLEAN while most of it is
// absent from disk). This is the checker half of the fix: it forbids the pattern from ever coming
// back, and it requires every self-hosted-reachable checkout site to carry the runtime
// workspace-hygiene guard (see docs/ops/CI_RUNNER_WORKSPACE_HYGIENE.md) both before and after its
// `actions/checkout` step.
//
// Deliberately a new script, not an extension of check-runner-routing.js -- that file's own header
// treats "separate checker, shared parser" as the convention for a validator with a different
// concern (routing-convention pairing vs. workspace-hygiene coverage), so this file imports its
// job-block/runner-classification helpers rather than re-implementing them.

const fs = require('node:fs');
const path = require('node:path');
const { extractJobBlocks, isHosted } = require('./check-runner-routing');

const repoRoot = path.resolve(__dirname, '..');
const workflowsDir = path.join(repoRoot, '.github', 'workflows');

// No legitimate self-hosted sparse-checkout site exists today. A future one must be a deliberate,
// reviewable addition to this list, not a silent re-introduction.
const SPARSE_ALLOWLIST = [];

const HYGIENE_MARKER = '[workspace-hygiene] no pre-existing workspace';
const ASSERT_MARKER = '[workspace-hygiene] tree complete.';
const CHECKOUT_RE = /uses:\s*actions\/checkout@/;
const SPARSE_RE = /^\s*sparse-checkout(-cone-mode)?:\s*\S/m;
const RUNNER_SITE_RE = /^\s*(runs-on|runner_labels_json):\s*(.+)$/m;
const DELEGATED_INPUT_RE = /inputs\.runner_labels_json/;
const SELF_HOSTED_RE = /sieitz/;

function listWorkflowFiles() {
  return fs
    .readdirSync(workflowsDir)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .sort();
}

/**
 * Resolves whether a job block can land on a self-hosted (`sieitz-*`) runner: directly via an
 * active `runs-on:`/`runner_labels_json:` literal containing "sieitz", or indirectly via a
 * delegated `${{ inputs.runner_labels_json }}` whose file-level input default contains "sieitz".
 *
 * @param {string} block job block text
 * @param {string} fileText whole file text (for the delegated-input default)
 * @returns {boolean}
 */
function isSelfHostedReachable(block, fileText) {
  const match = block.match(RUNNER_SITE_RE);
  if (!match) return false;
  const value = match[2];
  if (SELF_HOSTED_RE.test(value)) return true;
  if (DELEGATED_INPUT_RE.test(value)) {
    const defaultMatch = fileText.match(/runner_labels_json:\n(?:[^\n]*\n)*?\s{8}default:\s*(.+)$/m);
    return defaultMatch ? SELF_HOSTED_RE.test(defaultMatch[1]) : false;
  }
  return !isHosted(value);
}

/**
 * @param {string} file workflow filename (for messages)
 * @param {string} text workflow file contents
 * @returns {string[]} problems found
 */
function checkFile(file, text) {
  const problems = [];

  if (SPARSE_RE.test(text) && !SPARSE_ALLOWLIST.includes(file)) {
    problems.push(
      `${file}: declares sparse-checkout: (or sparse-checkout-cone-mode:) but is not in ` +
        'SPARSE_ALLOWLIST. Self-hosted runners persist their _work directory across every job on ' +
        'the box -- a sparse checkout here permanently poisons that shared workspace for every ' +
        'later, unrelated job (actions/checkout cannot self-heal it; see #1528 and ' +
        'docs/ops/CI_RUNNER_WORKSPACE_HYGIENE.md). Remove sparse-checkout entirely, or add this ' +
        'file to SPARSE_ALLOWLIST with a comment justifying why the job can never land self-hosted.'
    );
  }

  const blocks = extractJobBlocks(text);
  for (const [jobName, { block }] of blocks) {
    if (!CHECKOUT_RE.test(block)) continue;
    if (!isSelfHostedReachable(block, text)) continue;

    const lines = block.split('\n');
    const checkoutLine = lines.findIndex((l) => CHECKOUT_RE.test(l));
    const hygieneLine = lines.findIndex((l) => l.includes(HYGIENE_MARKER));
    const assertLine = lines.findIndex((l) => l.includes(ASSERT_MARKER));

    if (hygieneLine === -1) {
      problems.push(
        `${file}:${jobName}: checks out on a self-hosted-reachable runner but has no ` +
          '"Clear stale sparse-checkout state (workspace-hygiene v1)" step. Add it immediately ' +
          'before actions/checkout -- see docs/ops/CI_RUNNER_WORKSPACE_HYGIENE.md (#1528).'
      );
    } else if (hygieneLine > checkoutLine) {
      problems.push(
        `${file}:${jobName}: workspace-hygiene clear step must run BEFORE actions/checkout, not ` +
          'after -- it exists to clean up a PRIOR job\'s leftover state before this job\'s own ' +
          'checkout runs.'
      );
    }

    if (assertLine === -1) {
      problems.push(
        `${file}:${jobName}: checks out on a self-hosted-reachable runner but has no ` +
          '"Assert complete working tree (workspace-hygiene v1)" step. Add it immediately after ' +
          'actions/checkout -- see docs/ops/CI_RUNNER_WORKSPACE_HYGIENE.md (#1528).'
      );
    } else if (assertLine < checkoutLine) {
      problems.push(
        `${file}:${jobName}: workspace-hygiene assert step must run AFTER actions/checkout, not ` +
          'before -- it exists to prove THIS job\'s own checkout actually produced a complete tree.'
      );
    }
  }

  return problems;
}

/**
 * Extracts one step's full text (its `- name: ...` line through the line immediately before the
 * next step at the same indentation, or the block's end), by line index rather than raw string
 * search -- a raw `indexOf`-based scan can run past this step into trailing comments that belong
 * to a *later*, unrelated step or job, which previously produced false drift positives.
 *
 * @param {string} text block or file text containing the step
 * @param {string} marker a substring unique to the step's body (used to locate its start line)
 * @returns {string | null} normalised (whitespace-collapsed) step text, or null if not found
 */
function extractStep(text, marker) {
  const lines = text.split('\n');
  const markerLine = lines.findIndex((l) => l.includes(marker));
  if (markerLine === -1) return null;
  let start = markerLine;
  while (start > 0 && !/^ {6}- (name:|uses:)/.test(lines[start])) start--;
  // These step bodies never contain a blank line internally, so the first blank line after the
  // marker reliably ends the step -- unlike a step/job-header regex, this can't be fooled by a
  // trailing comment block (itself indented like a step, per this repo's "comment precedes what
  // it describes" convention) that actually belongs to the *next* step.
  let end = lines.length;
  for (let i = markerLine + 1; i < lines.length; i++) {
    if (lines[i].trim() === '' || /^ {6}- (name:|uses:)/.test(lines[i]) || /^ {0,4}\S/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n').replace(/\s+/g, ' ').trim();
}

/**
 * Every present hygiene-clear step body, and every present assert step body, must be
 * byte-identical (normalised for leading indentation) across all sites. The duplication is
 * deliberate -- a pre-checkout step cannot be factored into a composite action or repo script,
 * since neither is on disk until checkout runs -- so drift is the one failure mode a shared
 * implementation would have caught for free; this is what stands in for that.
 *
 * @param {Map<string, string>} fileTexts filename -> contents
 * @returns {string[]} problems found
 */
function checkNoDrift(fileTexts) {
  const problems = [];
  const bodies = { hygiene: new Map(), assert: new Map() };
  for (const [file, text] of fileTexts) {
    const hygiene = extractStep(text, HYGIENE_MARKER);
    if (hygiene) bodies.hygiene.set(file, hygiene);
    const assertBody = extractStep(text, ASSERT_MARKER);
    if (assertBody) bodies.assert.set(file, assertBody);
  }

  for (const [kind, map] of Object.entries(bodies)) {
    const unique = new Set(map.values());
    if (unique.size > 1) {
      problems.push(
        `${map.size} sites define a "${kind}" workspace-hygiene step but their bodies are not ` +
          `byte-identical (${unique.size} distinct variants across: ${[...map.keys()].join(', ')}). ` +
          'This snippet is duplicated by design (a local composite action cannot run before ' +
          'checkout) -- update every site together rather than editing just one.'
      );
    }
  }

  return problems;
}

function checkWorkspaceHygiene(fileTexts) {
  const problems = [];
  for (const [file, text] of fileTexts) {
    problems.push(...checkFile(file, text));
  }
  problems.push(...checkNoDrift(fileTexts));
  return problems;
}

function main() {
  const fileTexts = new Map();
  for (const file of listWorkflowFiles()) {
    fileTexts.set(file, fs.readFileSync(path.join(workflowsDir, file), 'utf8'));
  }

  const problems = checkWorkspaceHygiene(fileTexts);

  if (problems.length > 0) {
    console.error('[workspace-hygiene] FAILED');
    problems.forEach((entry) => console.error(` - ${entry}`));
    process.exit(1);
  }

  console.log(
    '[workspace-hygiene] OK. No sparse-checkout: site outside SPARSE_ALLOWLIST; every ' +
      'self-hosted-reachable job with actions/checkout carries a clear step before it and an ' +
      'assert step after it; every present hygiene/assert body is byte-identical across sites.'
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  checkWorkspaceHygiene,
  checkFile,
  checkNoDrift,
  isSelfHostedReachable,
  listWorkflowFiles,
  SPARSE_ALLOWLIST
};
