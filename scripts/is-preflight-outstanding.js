#!/usr/bin/env node
/**
 * Decide whether one compliance declaration file is still outstanding for the preflight sweep --
 * i.e. its CURRENT front matter `preflight_request_ref` still carries a `NOT-EXECUTED-*`
 * placeholder, not a real `PROMOTER-*`/PR reference.
 *
 * Fixes .github/workflows/compliance-preflight-sweep.yml's discovery step (pr-reviewer RF-6 on PR
 * #1127/#1121): grepping the whole file for the substring `NOT-EXECUTED-` also matches a
 * *reconciled* declaration whose body prose still mentions the placeholder historically (e.g.
 * `~~preflight_request_ref: NOT-EXECUTED-322-...~~` inside a "reconciled 2026-08-24" note, see
 * docs/compliance/impact-declarations/2026-08-22-frontend-split-develop-absorb-path-fixes.md) --
 * that file's real, current `preflight_request_ref` is a `PROMOTER-*` value, not
 * `NOT-EXECUTED-*`, so it should never be re-swept. Only the front matter's live value matters.
 *
 * Reuses build-preflight-request.js's own `parseFrontMatter` rather than reimplementing front-
 * matter parsing a third time in this repo.
 *
 * Usage:
 *   node scripts/is-preflight-outstanding.js <declaration.md>
 * Exit 0 (and prints "outstanding") if preflight_request_ref starts with NOT-EXECUTED-.
 * Exit 1 (and prints "reconciled" or "no-front-matter") otherwise.
 */

'use strict';

const fs = require('fs');
const { parseFrontMatter } = require('./build-preflight-request');

const isOutstanding = (content) => {
  const frontMatter = parseFrontMatter(content);
  if (!frontMatter) return false;
  const ref = String(frontMatter.preflight_request_ref || '').trim();
  return ref.startsWith('NOT-EXECUTED-');
};

const main = () => {
  const declarationPath = process.argv[2];
  if (!declarationPath) {
    process.stderr.write('[is-preflight-outstanding] Usage: node scripts/is-preflight-outstanding.js <declaration.md>\n');
    process.exitCode = 1;
    return;
  }

  let content;
  try {
    content = fs.readFileSync(declarationPath, 'utf8');
  } catch (error) {
    process.stderr.write(`[is-preflight-outstanding] Failed to read ${declarationPath}: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  if (isOutstanding(content)) {
    console.log('outstanding');
    process.exitCode = 0;
  } else {
    console.log('reconciled');
    process.exitCode = 1;
  }
};

if (require.main === module) main();

module.exports = { isOutstanding };
