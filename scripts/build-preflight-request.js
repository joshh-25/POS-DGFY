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
 * Usage:
 *   node scripts/build-preflight-request.js <path-to-declaration.md>
 * Prints the JSON request body to stdout.
 */

'use strict';

const fs = require('fs');

const SUMMARY_MAX_LENGTH = 600;

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

  const surfaces = parseCsvField(frontMatter.surfaces);
  const reasonCodesImpacted = parseCsvField(frontMatter.reason_codes_impacted);
  const verificationEvidence = parseCsvField(frontMatter.verification_evidence);
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

module.exports = { parseFrontMatter, parseCsvField, deriveSummary, buildRequestFromContent };
