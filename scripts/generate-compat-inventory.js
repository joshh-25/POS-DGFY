#!/usr/bin/env node
/**
 * Deterministic manifest -> markdown generator for the compatibility-seam
 * inventory (CMP-02).
 *
 * Reads docs/architecture/compatibility-seams.json and renders
 * docs/architecture/COMPATIBILITY_INVENTORY.md. The render is a pure
 * function of the manifest contents (no timestamps, no nondeterministic
 * ordering) so `generate -> git diff --exit-code` proves the doc never
 * drifts from its source of truth.
 *
 * This generated doc is intentionally left OUT of
 * docs/_meta/document-registry.json — lint-docs.js only enforces the
 * required-frontmatter contract on registered docs, and the manifest
 * (not this doc) remains the governed source of truth.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'docs', 'architecture', 'compatibility-seams.json');
const OUTPUT_PATH = path.join(REPO_ROOT, 'docs', 'architecture', 'COMPATIBILITY_INVENTORY.md');

const TABLE_COLUMNS = ['id', 'type', 'status', 'rationale', 'tests', 'rollback', 'removal_criteria'];

/** Shared low-level mkdir-recursive + writeFile helper (mirrors
 * apps/dgfy-migration-runner/src/reports/reportWriter.js's
 * writeReportFile, sync variant since this generator is CJS/sync). */
const writeReportFile = (filePath, contents) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, 'utf8');
};

const readManifest = (manifestPath) => {
  const raw = fs.readFileSync(manifestPath, 'utf8');
  return JSON.parse(raw);
};

// Markdown table cells must not contain raw pipes/newlines from source data.
const escapeCell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

const renderTestsCell = (tests) => (
  Array.isArray(tests) && tests.length > 0
    ? tests.map((testPath) => `\`${testPath}\``).join('<br>')
    : '_(none)_'
);

const renderSeamRow = (seam) => {
  const cells = [
    `\`${escapeCell(seam.id)}\``,
    escapeCell(seam.type),
    escapeCell(seam.status),
    escapeCell(seam.rationale),
    renderTestsCell(seam.tests),
    escapeCell(seam.rollback),
    escapeCell(seam.removal_criteria),
  ];
  return `| ${cells.join(' | ')} |`;
};

const renderInventoryMarkdown = (manifest) => {
  const seams = Array.isArray(manifest.seams) ? manifest.seams : [];
  const lines = [];

  lines.push('# Compatibility Seam Inventory');
  lines.push('');
  lines.push('<!-- GENERATED FILE -- do not hand-edit. -->');
  lines.push('<!-- Source of truth: docs/architecture/compatibility-seams.json -->');
  lines.push('<!-- Regenerate with: npm run generate:compat-inventory -->');
  lines.push('');
  lines.push(
    'Every legacy compatibility seam approved for the database-first cutover (CMP-02) is'
      + ' declared in the manifest and rendered here for human review. This file is'
      + ' deterministically generated -- edit the manifest, not this document.'
  );
  lines.push('');

  if (seams.length === 0) {
    lines.push('_(none registered yet)_');
    lines.push('');
    return lines.join('\n');
  }

  lines.push(`| ${TABLE_COLUMNS.join(' | ')} |`);
  lines.push(`| ${TABLE_COLUMNS.map(() => '---').join(' | ')} |`);
  seams.forEach((seam) => lines.push(renderSeamRow(seam)));
  lines.push('');

  return lines.join('\n');
};

const generateInventory = ({ manifestPath = MANIFEST_PATH, outputPath = OUTPUT_PATH } = {}) => {
  const manifest = readManifest(manifestPath);
  const markdown = renderInventoryMarkdown(manifest);
  writeReportFile(outputPath, markdown);
  return { manifest, markdown, outputPath };
};

const main = () => {
  const { outputPath, manifest } = generateInventory();
  console.log(`[generate:compat-inventory] Wrote ${path.relative(REPO_ROOT, outputPath)} (${(manifest.seams || []).length} seam(s))`);
};

if (require.main === module) main();

module.exports = {
  readManifest,
  renderInventoryMarkdown,
  generateInventory,
  MANIFEST_PATH,
  OUTPUT_PATH,
};
