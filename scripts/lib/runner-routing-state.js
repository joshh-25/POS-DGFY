// Phase 234 (#1365), Wave 1: the single declared source of truth for "which runner class is
// currently the *intended* active one" -- closing F-1, proven in the Phase 234 plan: today
// scripts/check-runner-routing.js asserts only that the active and commented-alternate lines are
// *opposite* classes (a relative, pairing-only invariant), never *which* one is supposed to be
// active. That means both a full inversion (every site flipped) and a partial/silent inversion
// (one site flipped, the rest not) pass the validator with zero problems -- #1365's AC-6 ("future
// edits cannot silently invert the strategy") is unmet without an actual declared expectation.
//
// EXPECTED_ACTIVE_CLASS is that declaration. Flipping the routing strategy (Phase 234 Wave 3, the
// live cutover) means editing this constant *and* every runner_labels_json:/runs-on: site in
// deploy-main.yml/promotion-quality-gate.yml together -- check-runner-routing.js's Assertion 6
// fails CI otherwise, by design. An emergency fallback flip must edit both, and must say so loudly
// in its own failure message (see check-runner-routing.js's Assertion 6 message).
const EXPECTED_ACTIVE_CLASS = 'self-hosted';

/**
 * Derives the routing state actually present in the two PROD-facing workflow files' text, reusing
 * check-runner-routing.js's own job-block/active-site/hosted-detection machinery rather than a
 * second parser (#1365's "no duplicate implementation" acceptance criterion).
 *
 * Only non-exempt job sites are considered -- the anchor-allowlist jobs (guard-branch, gate,
 * report-advisory-failures) are permanently self-hosted by design and carry no commented
 * alternate at all, so including them here would always bias the result toward self-hosted and
 * mask a genuine full inversion of every other site.
 *
 * @param {{deployMainText: string, qualityGateText: string}} args raw file contents
 * @returns {'hosted' | 'self-hosted' | 'mixed'} 'mixed' when non-exempt sites disagree with each
 *   other -- an inconsistent tree that no single class can honestly describe.
 */
function readActiveRouting({ deployMainText, qualityGateText }) {
  // Required here, not at module top-level, to avoid a require cycle: check-runner-routing.js
  // does not (and must not) depend back on this file.
  const { extractJobBlocks, findActiveSites, isHosted, ANCHOR_ALLOWLIST } = require('../check-runner-routing');

  const filesText = {
    'deploy-main.yml': deployMainText,
    'promotion-quality-gate.yml': qualityGateText
  };

  const seenClasses = new Set();

  for (const [file, text] of Object.entries(filesText)) {
    const blocks = extractJobBlocks(text);
    const allowlist = ANCHOR_ALLOWLIST[file] || new Set();
    for (const [jobName, { block }] of blocks) {
      if (allowlist.has(jobName)) continue;
      const sites = findActiveSites(block);
      if (sites.length !== 1) continue; // malformed-site cases are check-runner-routing.js's job to report
      seenClasses.add(isHosted(sites[0].line) ? 'hosted' : 'self-hosted');
    }
  }

  // The runner_labels_json input `default:` site (promotion-quality-gate.yml's shared
  // workflow_call/workflow_dispatch anchor) sits outside any job block, so extractJobBlocks/
  // findActiveSites cannot see it -- matched directly, mirroring
  // check-runner-routing.js's own checkInputDefaultSite.
  const anchorMatch = qualityGateText.match(/runner_labels_json:\n(?:[^\n]*\n)*?( {8}default: .*)\n/);
  if (anchorMatch) {
    seenClasses.add(isHosted(anchorMatch[1]) ? 'hosted' : 'self-hosted');
  }

  if (seenClasses.size === 0) return EXPECTED_ACTIVE_CLASS;
  if (seenClasses.size > 1) return 'mixed';
  return [...seenClasses][0];
}

module.exports = { EXPECTED_ACTIVE_CLASS, readActiveRouting };
