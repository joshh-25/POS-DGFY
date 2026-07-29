#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * ADR hygiene gate (ADR 0039, Decision 6).
 *
 * Validates the ADR corpus and regenerates docs/architecture/adr/INDEX.md.
 *
 * Modes:
 *   node scripts/check-adr.js            report-only, always exits 0
 *   node scripts/check-adr.js --strict   exits 1 on any violation (CI gate)
 *   node scripts/check-adr.js --write-index   regenerate INDEX.md
 */
const fs = require('fs');
const path = require('path');

const repoRoot = process.cwd();
const defaultAdrDir = path.join(repoRoot, 'docs', 'architecture', 'adr');
const adrDir = process.env.ADR_DIR ? path.resolve(process.env.ADR_DIR) : defaultAdrDir;
const indexPath = path.join(adrDir, 'INDEX.md');

const STRICT = process.argv.includes('--strict');
const WRITE_INDEX = process.argv.includes('--write-index');

const LIFECYCLE = ['proposed', 'accepted', 'amended', 'superseded', 'retired'];
const TIERS = ['binding', 'default', 'snapshot'];
const REQUIRED = ['status', 'authority_level', 'owner', 'date', 'last_reviewed', 'review_by', 'topic'];
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIER_REGEX = /`\[([a-z]+)]`/g;
// Fixed so index regeneration is deterministic; bump when the corpus is re-reviewed.
const TODAY = '2026-07-29';

const parseFrontMatter = (content) => {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return null;
  const data = {};
  match[1].split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const i = trimmed.indexOf(':');
    if (i === -1) return;
    data[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim();
  });
  return { data, body: content.slice(match[0].length) };
};

const readAdrs = (dir = adrDir) => fs.readdirSync(dir)
  .filter((f) => f.endsWith('.md') && f !== 'INDEX.md')
  .sort()
  .map((file) => {
    const full = path.join(dir, file);
    const content = fs.readFileSync(full, 'utf8');
    const parsed = parseFrontMatter(content);
    const titleMatch = content.match(/^# (.+)$/m);
    const numberMatch = file.match(/^(\d{4})-/);
    return {
      file,
      full,
      content,
      frontMatter: parsed ? parsed.data : null,
      body: parsed ? parsed.body : content,
      title: titleMatch ? titleMatch[1].replace(/^ADR \d+:\s*/, '') : '(untitled)',
      number: numberMatch ? numberMatch[1] : null
    };
  });

const countTiers = (body) => {
  const counts = { binding: 0, default: 0, snapshot: 0 };
  let match;
  TIER_REGEX.lastIndex = 0;
  while ((match = TIER_REGEX.exec(body)) !== null) {
    if (counts[match[1]] !== undefined) counts[match[1]] += 1;
  }
  return counts;
};

const validate = (adrs, dir = adrDir) => {
  const errors = [];
  const live = adrs.filter((a) => a.frontMatter && a.frontMatter.status !== 'moved');
  const byNumber = new Map();
  const bindingTopics = new Map();

  adrs.forEach((adr) => {
    if (!adr.frontMatter) {
      errors.push(`${adr.file}: missing front matter`);
      return;
    }
    const fm = adr.frontMatter;

    // Collision stubs carry their own minimal contract.
    if (fm.status === 'moved') {
      if (!fm.moved_to) errors.push(`${adr.file}: status "moved" requires moved_to`);
      else if (!fs.existsSync(path.join(dir, fm.moved_to))) {
        errors.push(`${adr.file}: moved_to target "${fm.moved_to}" does not exist`);
      }
      return;
    }

    REQUIRED.forEach((key) => {
      if (!fm[key]) errors.push(`${adr.file}: missing front matter key "${key}"`);
    });

    if (fm.status && !LIFECYCLE.includes(fm.status)) {
      errors.push(`${adr.file}: status "${fm.status}" is not one of ${LIFECYCLE.join(', ')}`);
    }
    ['date', 'last_reviewed', 'review_by'].forEach((key) => {
      if (fm[key] && !DATE_REGEX.test(fm[key])) {
        errors.push(`${adr.file}: ${key} must be YYYY-MM-DD, got "${fm[key]}"`);
      }
    });

    if (fm.status === 'superseded') {
      if (!fm.superseded_by) errors.push(`${adr.file}: status "superseded" requires superseded_by`);
      else if (!fs.existsSync(path.resolve(dir, fm.superseded_by))) {
        errors.push(`${adr.file}: superseded_by target "${fm.superseded_by}" does not exist`);
      }
    }
    if (fm.status === 'retired' && !fm.retired_reason) {
      errors.push(`${adr.file}: status "retired" requires retired_reason`);
    }

    // Unknown tier tags.
    TIER_REGEX.lastIndex = 0;
    let match;
    while ((match = TIER_REGEX.exec(adr.body)) !== null) {
      if (!TIERS.includes(match[1])) {
        errors.push(`${adr.file}: unknown strictness tier "[${match[1]}]" (expected ${TIERS.join(', ')})`);
      }
    }
  });

  // Unique ADR number across live ADRs.
  live.forEach((adr) => {
    if (!adr.number) {
      errors.push(`${adr.file}: filename must start with a 4-digit ADR number`);
      return;
    }
    const existing = byNumber.get(adr.number) || [];
    existing.push(adr.file);
    byNumber.set(adr.number, existing);
  });
  byNumber.forEach((files, number) => {
    if (files.length > 1) errors.push(`ADR number ${number} is used by ${files.length} live ADRs: ${files.join(', ')}`);
  });

  // One binding authority per topic among in-force ADRs.
  live.filter((a) => ['accepted', 'amended'].includes(a.frontMatter.status))
    .forEach((adr) => {
      if (countTiers(adr.body).binding === 0) return;
      const topic = adr.frontMatter.topic;
      const existing = bindingTopics.get(topic) || [];
      existing.push(adr.file);
      bindingTopics.set(topic, existing);
    });
  bindingTopics.forEach((files, topic) => {
    if (files.length > 1) errors.push(`Topic "${topic}" has binding clauses in multiple in-force ADRs: ${files.join(', ')}`);
  });

  return errors;
};

const buildIndex = (adrs, today = TODAY) => {
  const rows = adrs
    .filter((a) => a.frontMatter && a.frontMatter.status !== 'moved')
    .map((adr) => {
      const fm = adr.frontMatter;
      const tiers = countTiers(adr.body);
      const stale = fm.review_by && fm.review_by < today && tiers.binding > 0;
      return `| ${adr.number} | [${adr.title}](${adr.file}) | \`${fm.status}\` | ${fm.topic || '-'} | ${fm.review_by || '-'}${stale ? ' :warning:' : ''} | ${tiers.binding} |`;
    });

  const moved = adrs.filter((a) => a.frontMatter && a.frontMatter.status === 'moved')
    .map((a) => `| ${a.number} | \`${a.file}\` | [${a.frontMatter.moved_to}](${a.frontMatter.moved_to}) |`);

  return `---
status: reference
authority_level: reference
owner: architecture
date: 2026-07-29
last_reviewed: 2026-07-29
review_by: 2027-01-28
applies_to: architecture_decision_records
topic: adr_index
---

# ADR Index

Generated by \`npm run check:adr -- --write-index\`. Do not edit by hand.

Lifecycle and strictness tiers are defined in
[ADR 0039](0039-adr-lifecycle-strictness-tiers-and-amendment-path.md). Only
\`binding\` clauses require a superseding ADR to change; \`default\` clauses take an
amendment block in the implementing PR, and untagged clauses are \`default\`.

A :warning: on \`review_by\` means the date has passed and this ADR's \`binding\`
clauses have decayed to \`default\` until someone renews \`last_reviewed\`.

| # | Title | Status | Topic | Review by | Binding clauses |
| --- | --- | --- | --- | --- | --- |
${rows.join('\n')}

## Renumbered (collision stubs)

Kept so dated historical records still resolve. Do not cite these paths in new work.

| # | Old path | Now at |
| --- | --- | --- |
${moved.join('\n')}
`;
};

const run = () => {
  const adrs = readAdrs();
  const errors = validate(adrs);

  if (WRITE_INDEX) {
    fs.writeFileSync(indexPath, buildIndex(adrs));
    console.log(`[adr-lint] wrote ${path.relative(repoRoot, indexPath)}`);
  }

  if (errors.length === 0) {
    console.log(`[adr-lint] OK. Validated ${adrs.length} ADRs.`);
    return;
  }

  const label = STRICT ? 'FAILED' : 'REPORT (non-blocking)';
  console[STRICT ? 'error' : 'warn'](`[adr-lint] ${label} — ${errors.length} issue(s)`);
  errors.forEach((error) => console[STRICT ? 'error' : 'warn'](` - ${error}`));
  if (STRICT) process.exit(1);
};

if (require.main === module) run();

module.exports = { readAdrs, validate, buildIndex, countTiers, parseFrontMatter };
