'use strict';

// Dependency-light parser for this repository's flat scalar frontmatter records.
function parseFlatFrontmatter(content) {
  const text = String(content || '');
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return null;
  const data = {};
  for (const line of text.slice(3, end).trim().split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    if (key) data[key] = line.slice(separator + 1).trim();
  }
  return data;
}

module.exports = { parseFlatFrontmatter };
