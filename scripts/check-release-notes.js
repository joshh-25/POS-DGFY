#!/usr/bin/env node
/**
 * Release-note enforcement check (ADR 0082, #1278 PR 2 / Phase 297).
 *
 * ADR 0082 Decision 3 (`[binding]`): no production promotion reaches `main` without a release-note
 * record for its candidate. This script is the mechanical half of that obligation, named but not
 * built by ADR 0082 itself (Decision 8) -- ships advisory in CI (`.github/workflows/
 * promotion-quality-gate.yml`'s "Run release-notes check" step, `continue-on-error: true`) until a
 * later, dedicated phase flips it blocking, mirroring the same advisory-to-blocking rollout
 * `check:app-versions` (ADR 0081 Decision 9) already went through in this repo.
 *
 * Scope, per ADR 0082 Decision 8's own "Path coverage" paragraph:
 *   - `release/<candidate_id>-rN` covers BOTH the default flow's final leg (`staging -> main`) and
 *     the #1007-gated exception (`develop -> main`) -- they share the identical branch pattern, no
 *     special-casing needed.
 *   - It does NOT cover a `main` hotfix, whose branch is `fix/*` per `implement`'s own naming
 *     convention -- resolving a candidate id from a non-`release/*` head exits 0 ("not applicable").
 *     That path's binding obligation is enforced procedurally, not mechanically, via
 *     `.agents/skills/incident-responder/SKILL.md`'s hotfix release-note step (ADR 0082 Decision 8,
 *     Follow-up 3) -- this script is deliberately not the thing that covers it.
 *
 * `production_commit`'s two-stage lifecycle (ADR 0082 Decision 8, "what actually makes the
 * release/* -> main PR-time check satisfiable"): the real `main` merge-commit SHA does not exist
 * until after this PR merges, so the check accepts EITHER a `^[0-9a-f]{40}$` value OR the exact
 * literal string `pending` here -- never require 40-hex at PR-open time, that would fail every
 * normal promotion. The promoter finalizes the field to the real SHA post-deploy, before the GitHub
 * Release is published; there is no second CI gate re-validating that finalization yet (Follow-up 3).
 *
 * Reuses, does not reimplement:
 *   - `CANDIDATE_ID_PATTERN` / `PromotionCandidateError` from `check-promotion-candidate.js`.
 *   - `APPS` / `readVersionAt` from `check-app-version-bump.js`, for the per-app version table
 *     validated against `apps/<app>/package.json` at the PR's head ref.
 *
 * CLI:
 *   node scripts/check-release-notes.js [--head-branch <name>] [--head-git-ref <ref>]
 *     [--project-root <path>]
 *   Resolves the head branch from `--head-branch`, else `GITHUB_HEAD_REF` (the shape every other
 *   PR-time check in this repo uses -- see check-app-version-bump.js's own runCheck()). A head that
 *   does not match `release/<candidate_id>-rN` exits 0, "not applicable" -- this correctly leaves a
 *   `fix/*` hotfix branch unchecked, see the Scope note above.
 *   Exit 0 on pass (including "not applicable"); non-zero with a per-finding report otherwise.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { CANDIDATE_ID_PATTERN, PromotionCandidateError } = require('./check-promotion-candidate');
const { APPS, readVersionAt } = require('./check-app-version-bump');

const REPO_ROOT = path.resolve(__dirname, '..');

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const PENDING_SENTINEL = 'pending';
const SCHEMA_ID = 'sku-release-note/v1';
const NO_USER_VISIBLE_CHANGES = 'No user-visible changes.';
const PRODUCTION_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// release/<candidate_id>-rN -- the one branch shape ADR 0082 Decision 6/8 says covers both the
// default flow's final leg and the #1007-gated exception (identical pattern, no special-casing).
const RELEASE_BRANCH_PATTERN = new RegExp(`^release/(${CANDIDATE_ID_PATTERN.source.slice(1, -1)})-r(\\d+)$`);

function resolveCandidateIdFromHeadBranch(headBranchName) {
  const match = RELEASE_BRANCH_PATTERN.exec(String(headBranchName || '').trim());
  if (!match) return null;
  return { candidateId: match[1], revision: Number(match[2]) };
}

// Instructional comments in TEMPLATE.md-derived notes (e.g. the two <!-- --> blocks explaining
// production_commit's lifecycle and the ## Included authoring rules) are not part of the record
// itself -- strip them before any further parsing so a note that left one in place isn't penalized
// for content it didn't author.
function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

// Flat key: value front matter -- mirrors build-preflight-request.js's parseFrontMatter. This repo
// has no js-yaml dependency and every field in this schema is a flat scalar, never nested YAML, so
// a real YAML parser would be more machinery than the format needs.
function parseFrontMatter(content) {
  const text = String(content || '');
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  const block = text.slice(3, end).trim();
  const body = text.slice(end + 4).replace(/^\r?\n/, '');
  const frontMatter = {};
  for (const line of block.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    frontMatter[key] = value;
  }
  return { frontMatter, body };
}

// One `## <heading>` section's own body, up to (not including) the next `## ` heading or EOF.
// Returns null when the heading itself isn't present at all (distinct from an empty section).
function extractSection(body, heading) {
  const headingPattern = new RegExp(`^## ${heading}\\s*$`, 'm');
  const match = headingPattern.exec(body);
  if (!match) return null;
  const rest = body.slice(match.index + match[0].length);
  const nextHeadingIndex = rest.search(/^## /m);
  return (nextHeadingIndex === -1 ? rest : rest.slice(0, nextHeadingIndex)).trim();
}

// Every `| a | b |` row anywhere in the note body, minus the table's own header ("| App |
// Version |") and separator ("|---|---|") rows -- deliberately not anchored to a specific heading,
// since the version table sits between the H1 title and "## Included" with no heading of its own.
function parseVersionTableRows(body) {
  const rows = [];
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('|') || !line.endsWith('|')) continue;
    const cells = line.slice(1, -1).split('|').map((cell) => cell.trim());
    if (cells.length !== 2) continue;
    const [app, version] = cells;
    if (app.toLowerCase() === 'app') continue; // header row
    if (/^-+$/.test(app) && /^-+$/.test(version)) continue; // separator row
    rows.push({ app, version });
  }
  return rows;
}

function validateFrontMatter(frontMatter, candidateId) {
  const findings = [];
  if (!frontMatter) {
    findings.push({ code: 'MISSING_FRONTMATTER', message: 'Release note has no parseable front matter block (must start with `---`).' });
    return findings;
  }
  if (frontMatter.schema !== SCHEMA_ID) {
    findings.push({ code: 'INVALID_SCHEMA', message: `frontmatter "schema" must be ${SCHEMA_ID} (found: ${frontMatter.schema || '<missing>'}).` });
  }
  if (frontMatter.candidate_id !== candidateId) {
    findings.push({ code: 'CANDIDATE_ID_MISMATCH', message: `frontmatter "candidate_id" (${frontMatter.candidate_id || '<missing>'}) must match the release branch's candidate id (${candidateId}).` });
  }
  if (!PRODUCTION_DATE_PATTERN.test(String(frontMatter.production_date || ''))) {
    findings.push({ code: 'INVALID_PRODUCTION_DATE', message: `frontmatter "production_date" must be YYYY-MM-DD (found: ${frontMatter.production_date || '<missing>'}).` });
  }
  const commit = frontMatter.production_commit;
  if (commit !== PENDING_SENTINEL && !SHA_PATTERN.test(String(commit || ''))) {
    findings.push({
      code: 'INVALID_PRODUCTION_COMMIT',
      message: `frontmatter "production_commit" must be either the literal "pending" or a lowercase 40-character git SHA (found: ${commit || '<missing>'}) -- ADR 0082 Decision 8's two-stage lifecycle.`,
    });
  }
  return findings;
}

function validateVersionTable(body, { repoRoot, headGitRef }) {
  const findings = [];
  const rows = parseVersionTableRows(body);
  const byApp = new Map();
  for (const { app, version } of rows) {
    if (byApp.has(app)) {
      findings.push({ code: 'DUPLICATE_APP_ROW', message: `Version table lists "${app}" more than once.` });
      continue;
    }
    byApp.set(app, version);
  }

  for (const app of APPS) {
    if (!byApp.has(app)) {
      findings.push({ code: 'MISSING_APP_ROW', message: `Version table is missing a row for "${app}".` });
      continue;
    }
    const notedVersion = byApp.get(app);
    const actualVersion = readVersionAt(repoRoot, headGitRef, `apps/${app}`);
    if (!actualVersion) {
      findings.push({ code: 'UNREADABLE_APP_VERSION', message: `Could not read apps/${app}/package.json's version at ${headGitRef}.` });
      continue;
    }
    if (notedVersion !== actualVersion) {
      findings.push({
        code: 'VERSION_MISMATCH',
        message: `Version table lists ${app} as ${notedVersion}, but apps/${app}/package.json at ${headGitRef} is ${actualVersion}.`,
      });
    }
  }

  for (const app of byApp.keys()) {
    if (!APPS.includes(app)) {
      findings.push({ code: 'UNRECOGNIZED_APP_ROW', message: `Version table lists an unrecognized app "${app}" -- expected one of: ${APPS.join(', ')}.` });
    }
  }

  return findings;
}

// ADR 0082 Decision 5's concision rule: one line per user- or operator-visible change, never a
// commit-by-commit changelog. "No user-visible changes." is the one valid non-bulleted body.
function validateIncludedSection(section) {
  const findings = [];
  if (section === null) {
    findings.push({ code: 'MISSING_INCLUDED_SECTION', message: 'Missing required "## Included" section.' });
    return findings;
  }
  if (section === '') {
    findings.push({ code: 'EMPTY_INCLUDED_SECTION', message: '"## Included" section must not be empty -- use "No user-visible changes." when there is nothing to report.' });
    return findings;
  }
  if (section === NO_USER_VISIBLE_CHANGES) return findings;

  if (section.includes('```')) {
    findings.push({ code: 'INCLUDED_FENCED_CODE_BLOCK', message: '"## Included" section must not contain a fenced code block -- one plain-language line per change (ADR 0082 Decision 5).' });
  }

  for (const rawLine of section.split('\n')) {
    if (rawLine.trim() === '') continue;
    if (/^\s+[-*]\s/.test(rawLine)) {
      findings.push({ code: 'INCLUDED_NESTED_LIST', message: `"## Included" must not contain a nested list item: "${rawLine.trim()}" -- one flat line per change (ADR 0082 Decision 5).` });
      continue;
    }
    if (!/^- /.test(rawLine)) {
      findings.push({
        code: 'INCLUDED_MULTILINE_BULLET',
        message: `"## Included" line is not a single-line bullet: "${rawLine.trim()}" -- every change must fit on one line, not wrap across lines (ADR 0082 Decision 5).`,
      });
    }
  }

  return findings;
}

function validateOperationalNotesSection(section) {
  if (section === null) {
    return [{ code: 'MISSING_OPERATIONAL_NOTES_SECTION', message: 'Missing required "## Operational notes" section.' }];
  }
  if (section === '') {
    return [{ code: 'EMPTY_OPERATIONAL_NOTES_SECTION', message: '"## Operational notes" section must not be empty -- use "None." when there is nothing to report.' }];
  }
  return [];
}

function validateReleaseNote({ noteContent, candidateId, repoRoot, headGitRef }) {
  const findings = [];
  const stripped = stripHtmlComments(String(noteContent || ''));
  const parsed = parseFrontMatter(stripped);

  findings.push(...validateFrontMatter(parsed && parsed.frontMatter, candidateId));
  if (!parsed) return findings; // nothing else is parseable without a body

  findings.push(...validateVersionTable(parsed.body, { repoRoot, headGitRef }));
  findings.push(...validateIncludedSection(extractSection(parsed.body, 'Included')));
  findings.push(...validateOperationalNotesSection(extractSection(parsed.body, 'Operational notes')));
  return findings;
}

/**
 * options:
 *   - repoRoot (default: this repo)
 *   - headBranchName (default: GITHUB_HEAD_REF) -- the PR's head branch name
 *   - headGitRef (default: 'HEAD') -- the git ref readVersionAt() reads apps/<app>/package.json at
 *   - notePath (default: docs/releases/notes/<candidate_id>.md under repoRoot) -- override for tests
 */
function runCheck(options = {}) {
  const repoRoot = options.repoRoot || REPO_ROOT;
  const headBranchName = options.headBranchName !== undefined ? options.headBranchName : process.env.GITHUB_HEAD_REF;
  const headGitRef = options.headGitRef !== undefined ? options.headGitRef : 'HEAD';

  const resolved = resolveCandidateIdFromHeadBranch(headBranchName);
  if (!resolved) {
    return { ok: true, skipped: true, reason: 'not-a-promotion-branch', candidateId: null, notePath: null, findings: [] };
  }

  const { candidateId } = resolved;
  const notePath = options.notePath || path.join(repoRoot, 'docs', 'releases', 'notes', `${candidateId}.md`);

  let noteContent;
  try {
    noteContent = fs.readFileSync(notePath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return {
      ok: false,
      skipped: false,
      reason: null,
      candidateId,
      notePath,
      findings: [{
        code: 'MISSING_RELEASE_NOTE_FILE',
        message: `Missing required release note: ${path.relative(repoRoot, notePath)} does not exist for candidate ${candidateId} (ADR 0082 Decision 3).`,
      }],
    };
  }

  const findings = validateReleaseNote({ noteContent, candidateId, repoRoot, headGitRef });
  return { ok: findings.length === 0, skipped: false, reason: null, candidateId, notePath, findings };
}

// --- CLI ---------------------------------------------------------------------

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--head-branch') {
      options.headBranchName = argv[++index] || '';
    } else if (arg === '--head-git-ref') {
      options.headGitRef = argv[++index] || '';
    } else if (arg === '--project-root') {
      options.repoRoot = path.resolve(argv[++index] || '');
    } else {
      throw new PromotionCandidateError(`Unknown argument: ${arg}`, 'INVALID_ARGS');
    }
  }
  return options;
}

function printResult(result) {
  if (result.skipped) {
    console.log('[check:release-notes] Head branch does not match release/<candidate_id>-rN -- not a promotion PR, not applicable.');
    return;
  }
  if (result.ok) {
    console.log(`[check:release-notes] PASS candidate=${result.candidateId} note=${path.relative(REPO_ROOT, result.notePath)}`);
    return;
  }
  console.error(`[check:release-notes] FAIL candidate=${result.candidateId} note=${path.relative(REPO_ROOT, result.notePath)}`);
  for (const finding of result.findings) {
    console.error(`  - [${finding.code}] ${finding.message}`);
  }
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = runCheck(options);
    printResult(result);
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    if (error instanceof PromotionCandidateError) {
      console.error(`[check:release-notes] ${error.code}: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

if (require.main === module) main();

module.exports = {
  RELEASE_BRANCH_PATTERN,
  resolveCandidateIdFromHeadBranch,
  stripHtmlComments,
  parseFrontMatter,
  extractSection,
  parseVersionTableRows,
  validateFrontMatter,
  validateVersionTable,
  validateIncludedSection,
  validateOperationalNotesSection,
  validateReleaseNote,
  runCheck,
};
