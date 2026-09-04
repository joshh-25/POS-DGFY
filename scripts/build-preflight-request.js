#!/usr/bin/env node
/**
 * Build the POST /api/v1/compliance/preflight request body for one declaration file.
 *
 * Pulled out of .github/workflows/compliance-preflight-sweep.yml's inline `node -e` scriptlets
 * (pr-reviewer RF-1 on PR #1127/#1121) -- those only ever set `impact_declaration.declaration_id`,
 * which the real endpoint rejects: per the worked curl examples in
 * docs/compliance/impact-declarations/*.md and the protocol doc's API Contract Summary,
 * `impact_declaration` also needs `classification`, `summary`, `affected_surfaces`,
 * `reason_codes_impacted`, `policy_version`, `verification_evidence`, `rollback_note`.
 *
 * Front-matter parsing deliberately reuses the same flat `key: value` approach already proven in
 * scripts/check-compliance-impact.js's `parseFrontMatter` -- every declaration field here is a
 * flat scalar or a comma-separated list, never nested YAML, so a real YAML parser (this repo has
 * no js-yaml dependency) would be more machinery than the format needs.
 *
 * `summary` is NOT a front-matter field (absent from REQUIRED_DECLARATION_FRONTMATTER_KEYS in
 * check-compliance-impact.js) -- every existing worked example composes it by hand in prose when
 * building the curl payload. This script derives the same thing mechanically: the first non-empty
 * paragraph of the declaration body after its `# <Title>` heading, truncated to a sane length. This
 * is a heuristic, not a schema guarantee -- a declaration whose first paragraph doesn't read as a
 * standalone summary will produce an awkward one, same as it would confuse a human skimming it.
 *
 * Two fixes confirmed live against the real endpoint (#1163 ephemeral-target spike, 2026-08-31),
 * both pre-existing since #1121 and never previously exercised end to end (the one real prior
 * sweep run, 2026-08-29, only reached one declaration before the missing secrets blocked it):
 *
 * 1. `apps/dgfy-api/src/validators/complianceValidator.js`'s `preflightSchema` accepts only
 *    `pos|terminal|settings|payments|compliance` for `surfaces`/`affected_surfaces` and 422s on
 *    anything else. Several real declarations legitimately carry `store`/`privacy` too --
 *    `scripts/check-compliance-impact.js`'s own surface set is broader and those extra values are
 *    explicitly "voluntary, not mechanically enforced" (see e.g.
 *    docs/compliance/impact-declarations/2026-09-01-retail-order-packed-step.md's own comment).
 *    `ENDPOINT_ACCEPTED_SURFACES` below filters both fields down to the endpoint's accepted set
 *    before sending -- filtering both identically keeps complianceUseCases.js's own
 *    "affected_surfaces must include requested surface" cross-check satisfied.
 * 2. `verification_evidence` entries are capped at 300 chars by the same schema. The comma-split
 *    parser above (shared with check-compliance-impact.js) is not evidence-prose-aware -- a long
 *    evidence sentence containing internal commas ends up split into fragments, and a fragment
 *    itself can still exceed 300 chars. Each entry is truncated (not silently dropped) rather than
 *    rejected outright; this is a display-fidelity tradeoff, not a data-loss one -- the full,
 *    untruncated evidence stays in the declaration file itself, which is what a reviewer actually
 *    reads.
 *
 * Usage:
 *   node scripts/build-preflight-request.js <path-to-declaration.md>
 * Prints the JSON request body to stdout.
 */

'use strict';

const fs = require('fs');

const SUMMARY_MAX_LENGTH = 600;
const VERIFICATION_EVIDENCE_MAX_LENGTH = 300;
// Must match complianceValidator.js's preflightSchema exactly -- see this file's header comment.
const ENDPOINT_ACCEPTED_SURFACES = new Set(['pos', 'terminal', 'settings', 'payments', 'compliance']);

const parseFrontMatter = (content) => {
  const text = String(content || '');
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  const block = text.slice(3, end).trim();
  const map = {};

  for (const line of block.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const rawValue = line.slice(idx + 1).trim();
    if (!key) continue;
    map[key] = rawValue;
  }

  return map;
};

const parseCsvField = (value) => (
  String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
);

// Filters to only the surface values the preflight endpoint's own Joi schema accepts -- see this
// file's header comment for why a declaration can legitimately carry more than that.
const filterEndpointAcceptedSurfaces = (surfaces) => (
  surfaces.filter((surface) => ENDPOINT_ACCEPTED_SURFACES.has(surface))
);

// #1396 -- a declaration can pass check-compliance-impact.js's own (broader) surface validation
// while still declaring nothing the live preflight ENDPOINT can evaluate, e.g. `surfaces:
// storefront` alone: filterEndpointAcceptedSurfaces() above drops it to an empty array, and an
// empty `surfaces` array makes complianceUseCases.js's own surfaceToOperations map (lines
// 2660-2675) resolve to zero operations -- identical, silently, to submitting no surfaces at all.
// Adding `storefront` to ENDPOINT_ACCEPTED_SURFACES would be a no-op that reads as a real check:
// there is no storefront rule anywhere in compliancePolicyEngine.js, and the regulatory framework
// (BIR/BSP/NPC) this endpoint evaluates is POS-fiscal/payments scoped. classifyEndpointApplicability
// names that gap explicitly instead of silently degrading to the generic REQUEST_PREFLIGHT decision.
const classifyEndpointApplicability = (frontMatter) => {
  const declaredSurfaces = parseCsvField(frontMatter.surfaces);
  const acceptedSurfaces = filterEndpointAcceptedSurfaces(declaredSurfaces);

  if (acceptedSurfaces.length > 0) {
    return { applicable: true };
  }

  return {
    applicable: false,
    classification: String(frontMatter.classification || '').trim(),
    reason_code: 'NO_ENDPOINT_ACCEPTED_SURFACE',
    declared_surfaces: declaredSurfaces
  };
};

// Truncates (never drops) an evidence entry to the endpoint's 300-char field limit -- see this
// file's header comment.
const truncateEvidenceEntry = (entry) => (
  entry.length > VERIFICATION_EVIDENCE_MAX_LENGTH
    ? `${entry.slice(0, VERIFICATION_EVIDENCE_MAX_LENGTH - 1)}…`
    : entry
);

const deriveSummary = (content) => {
  const text = String(content || '');
  const end = text.indexOf('\n---', 3);
  const body = end === -1 ? text : text.slice(end + 4);

  const lines = body.split(/\r?\n/);
  let sawHeading = false;
  const paragraph = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!sawHeading) {
      if (trimmed.startsWith('# ')) sawHeading = true;
      continue;
    }
    if (!trimmed) {
      if (paragraph.length > 0) break;
      continue;
    }
    if (trimmed.startsWith('#')) break; // hit the next heading before any prose
    paragraph.push(trimmed);
  }

  const summary = paragraph.join(' ').trim();
  if (!summary) return '(no summary derivable from declaration body)';
  return summary.length > SUMMARY_MAX_LENGTH
    ? `${summary.slice(0, SUMMARY_MAX_LENGTH - 1)}…`
    : summary;
};

/**
 * Build the full preflight request body from a declaration file's raw content.
 * Exported separately from stdout-printing `main()` so it's directly testable.
 */
const buildRequestFromContent = (content, { declarationPath = '<declaration>' } = {}) => {
  const frontMatter = parseFrontMatter(content);
  if (!frontMatter) {
    throw new Error(`No YAML front matter found in ${declarationPath}`);
  }

  const declarationId = String(frontMatter.declaration_id || '').trim();
  if (!declarationId) {
    throw new Error(`Missing declaration_id in ${declarationPath}`);
  }

  const surfaces = filterEndpointAcceptedSurfaces(parseCsvField(frontMatter.surfaces));
  const reasonCodesImpacted = parseCsvField(frontMatter.reason_codes_impacted);
  const verificationEvidence = parseCsvField(frontMatter.verification_evidence).map(truncateEvidenceEntry);
  const classification = String(frontMatter.classification || '').trim();
  const policyVersion = String(frontMatter.policy_version || '').trim();
  const rollbackNote = String(frontMatter.rollback_note || '').trim();
  const summary = deriveSummary(content);

  return {
    request_name: `Compliance preflight sweep - ${declarationId}`,
    surfaces,
    impact_declaration: {
      declaration_id: declarationId,
      classification,
      summary,
      affected_surfaces: surfaces,
      reason_codes_impacted: reasonCodesImpacted,
      policy_version: policyVersion,
      verification_evidence: verificationEvidence,
      rollback_note: rollbackNote
    }
  };
};

const main = () => {
  const declarationPath = process.argv[2];
  if (!declarationPath) {
    process.stderr.write('[build-preflight-request] Usage: node scripts/build-preflight-request.js <declaration.md>\n');
    process.exitCode = 1;
    return;
  }

  let content;
  try {
    content = fs.readFileSync(declarationPath, 'utf8');
  } catch (error) {
    process.stderr.write(`[build-preflight-request] Failed to read ${declarationPath}: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  let frontMatter;
  try {
    frontMatter = parseFrontMatter(content);
    if (!frontMatter) {
      throw new Error(`No YAML front matter found in ${declarationPath}`);
    }
  } catch (error) {
    process.stderr.write(`[build-preflight-request] ${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  const applicability = classifyEndpointApplicability(frontMatter);
  if (!applicability.applicable) {
    const declarationId = String(frontMatter.declaration_id || '').trim();
    if (applicability.classification === 'minor') {
      process.stdout.write(JSON.stringify({
        not_applicable: true,
        declaration_id: declarationId,
        reason_code: applicability.reason_code,
        declared_surfaces: applicability.declared_surfaces
      }));
      process.exitCode = 3;
      return;
    }
    process.stderr.write(
      `[build-preflight-request] declaration ${declarationId} is classification ` +
      `"${applicability.classification}" but declares no endpoint-accepted surface ` +
      '(pos|terminal|settings|payments|compliance); add the evaluable surface or reclassify -- ' +
      'live preflight cannot evaluate it and check-compliance-impact.js requires ' +
      'preflight_result=no_breach for this classification\n'
    );
    process.exitCode = 1;
    return;
  }

  let request;
  try {
    request = buildRequestFromContent(content, { declarationPath });
  } catch (error) {
    process.stderr.write(`[build-preflight-request] ${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(JSON.stringify(request));
};

if (require.main === module) main();

module.exports = {
  parseFrontMatter,
  parseCsvField,
  deriveSummary,
  buildRequestFromContent,
  filterEndpointAcceptedSurfaces,
  classifyEndpointApplicability,
  truncateEvidenceEntry,
  ENDPOINT_ACCEPTED_SURFACES,
  VERIFICATION_EVIDENCE_MAX_LENGTH
};
