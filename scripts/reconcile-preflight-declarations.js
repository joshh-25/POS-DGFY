#!/usr/bin/env node
/**
 * Reconcile a compliance declaration's front matter with a real preflight sweep result -- replaces
 * the `NOT-EXECUTED-*` `preflight_request_ref` placeholder with a real, run-bound reference and
 * updates `preflight_result`/`preflight_reason_code`/`preflight_run_at` to the actual response.
 *
 * Previously a manual step (per docs/compliance/request-time-preflight-protocol.md's "Land the
 * reconciled front matter via a small cut branch and PR into develop, never a direct commit").
 * That discipline is unchanged here -- this script only edits files on disk; the calling workflow
 * (.github/workflows/compliance-preflight-sweep.yml) still does the cut-branch-and-PR part, never
 * a direct commit to develop.
 *
 * Rewrites ONLY the four front-matter keys, using a targeted line-replace within the `---`...`---`
 * block -- never the body. This matters: a declaration's body can carry its own historical
 * `NOT-EXECUTED-*` prose (e.g. a "not run, explicitly authorized to skip" note) that must survive
 * untouched -- rewriting the body was exactly the trap is-preflight-outstanding.js (#1121, RF-6)
 * was written to stop the discovery step from tripping over; this script must not reintroduce the
 * same class of mistake on the write path.
 *
 * A declaration is only reconciled when its sweep result actually passed (`pass: true`, i.e.
 * `result: no_breach` AND `can_proceed: true`, per parse-preflight-response.js). A `breach` or
 * `review_required` result is a real policy finding, not a placeholder to clear -- reconcile-
 * PreflightDeclaration() throws rather than silently writing a wrong `no_breach`; the caller must
 * leave that declaration's NOT-EXECUTED-* ref intact and let the failing sweep run surface it.
 *
 * Usage:
 *   node scripts/reconcile-preflight-declarations.js <results.json>
 * <results.json> is the array shape .github/workflows/compliance-preflight-sweep.yml's sweep step
 * already produces: [{ declaration, http_code, verdict: { pass, result, can_proceed, reason_code } }, ...]
 * Exits non-zero if any declaration in the file had `pass: false` -- those are left unreconciled
 * on purpose, and the caller (the workflow) must not auto-merge past that failure.
 */

'use strict';

const fs = require('fs');
const { parseFrontMatter } = require('./build-preflight-request');

const FRONT_MATTER_KEYS_TO_REPLACE = [
  'preflight_result',
  'preflight_reason_code',
  'preflight_run_at',
  'preflight_request_ref'
];

/**
 * Builds the new value for each of the four front-matter keys from one sweep verdict.
 */
const buildReconciledValues = (verdict, { runId, declarationId }) => {
  if (!verdict || verdict.pass !== true) {
    throw new Error(
      `Refusing to reconcile ${declarationId}: sweep result was not a pass ` +
      `(result=${verdict?.result ?? 'unknown'}, can_proceed=${verdict?.can_proceed ?? 'unknown'}). ` +
      'A breach/review_required result is a real policy finding, not a placeholder to clear.'
    );
  }

  const slug = String(declarationId || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  // #1396 -- a `not_applicable` result never called the live endpoint at all (build-preflight-
  // request.js's classifyEndpointApplicability short-circuited before any HTTP call, minor-only).
  // Give it a distinct ref prefix so a reader can tell "verified no_breach against the real
  // endpoint" from "not evaluable by this endpoint" without opening the run -- both still match
  // isValidPreflightRequestRef's 3+-segment pattern (scripts/check-compliance-impact.js).
  const refPrefix = verdict.result === 'not_applicable' ? 'NOT-APPLICABLE' : 'PREFLIGHT';

  return {
    preflight_result: verdict.result,
    preflight_reason_code: verdict.reason_code,
    preflight_run_at: new Date().toISOString(),
    preflight_request_ref: `${refPrefix}-${runId}-${slug}`
  };
};

/**
 * Rewrites only the four front-matter lines in `content`, in place, leaving every other line
 * (front matter or body) byte-identical.
 */
const applyReconciledFrontMatter = (content, reconciledValues) => {
  const text = String(content || '');
  const end = text.indexOf('\n---', 3);
  if (!text.startsWith('---') || end === -1) {
    throw new Error('No YAML front matter block found');
  }

  const frontMatterBlock = text.slice(0, end);
  const rest = text.slice(end);

  const lines = frontMatterBlock.split(/\r?\n/);
  const seen = new Set();

  const rewritten = lines.map((line) => {
    const idx = line.indexOf(':');
    if (idx === -1) return line;
    const key = line.slice(0, idx).trim();
    if (!Object.prototype.hasOwnProperty.call(reconciledValues, key)) return line;
    seen.add(key);
    return `${key}: ${reconciledValues[key]}`;
  });

  const missing = FRONT_MATTER_KEYS_TO_REPLACE.filter((key) => !seen.has(key));
  if (missing.length > 0) {
    throw new Error(`Front matter is missing expected key(s), refusing to reconcile: ${missing.join(', ')}`);
  }

  return `${rewritten.join('\n')}${rest}`;
};

/**
 * Reconciles one declaration file on disk. Returns the new preflight_request_ref on success.
 */
const reconcileDeclarationFile = (declarationPath, verdict, { runId }) => {
  const content = fs.readFileSync(declarationPath, 'utf8');
  const frontMatter = parseFrontMatter(content);
  if (!frontMatter) {
    throw new Error(`No YAML front matter found in ${declarationPath}`);
  }

  const declarationId = frontMatter.declaration_id || declarationPath;
  const reconciledValues = buildReconciledValues(verdict, { runId, declarationId });
  const updated = applyReconciledFrontMatter(content, reconciledValues);
  fs.writeFileSync(declarationPath, updated, 'utf8');
  return reconciledValues.preflight_request_ref;
};

const main = () => {
  const resultsPath = process.argv[2];
  const runId = process.env.GITHUB_RUN_ID || 'local';

  if (!resultsPath) {
    process.stderr.write('[reconcile-preflight-declarations] Usage: node scripts/reconcile-preflight-declarations.js <results.json>\n');
    process.exitCode = 1;
    return;
  }

  let results;
  try {
    results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  } catch (error) {
    process.stderr.write(`[reconcile-preflight-declarations] Failed to read ${resultsPath}: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  let anyFailed = false;
  const reconciled = [];

  for (const entry of results) {
    try {
      const ref = reconcileDeclarationFile(entry.declaration, entry.verdict, { runId });
      reconciled.push(entry.declaration);
      console.log(`[reconcile-preflight-declarations] Reconciled ${entry.declaration} -> ${ref}`);
    } catch (error) {
      anyFailed = true;
      console.error(`[reconcile-preflight-declarations] NOT reconciled: ${entry.declaration} -- ${error.message}`);
    }
  }

  console.log(`[reconcile-preflight-declarations] ${reconciled.length}/${results.length} declaration(s) reconciled.`);
  process.exitCode = anyFailed ? 1 : 0;
};

if (require.main === module) main();

module.exports = { buildReconciledValues, applyReconciledFrontMatter, reconcileDeclarationFile };
