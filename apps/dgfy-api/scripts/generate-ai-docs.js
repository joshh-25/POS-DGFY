#!/usr/bin/env node
/**
 * AI Documentation Generator
 *
 * Generates markdown documentation from aiTools.js definitions.
 * Output: docs/generated/AI_CAPABILITIES.md
 *
 * Run with: npm run generate:ai-docs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function main() {
  log('\n📝 AI Documentation Generator', 'cyan');
  log('═'.repeat(40), 'cyan');

  // Load tool definitions
  log('\n📋 Loading tool definitions...', 'blue');

  let AI_TOOLS, TOOL_CATEGORIES;

  try {
    const module = await import('../src/config/aiTools.js');
    AI_TOOLS = module.AI_TOOLS;
    TOOL_CATEGORIES = module.TOOL_CATEGORIES;
    log(`   Found ${AI_TOOLS.length} tools`, 'green');
  } catch (err) {
    console.error('Failed to load aiTools.js:', err.message);
    process.exit(1);
  }

  // Group tools by category
  const toolsByCategory = {};
  for (const tool of AI_TOOLS) {
    const cat = tool.category || 'uncategorized';
    if (!toolsByCategory[cat]) {
      toolsByCategory[cat] = [];
    }
    toolsByCategory[cat].push(tool);
  }

  // Generate markdown content
  log('\n✏️  Generating markdown...', 'blue');

  const timestamp = new Date().toISOString();
  const readTools = AI_TOOLS.filter(t => !t.requiresConfirmation);
  const writeTools = AI_TOOLS.filter(t => t.requiresConfirmation);

  let markdown = `# AI Capabilities Reference

> **Auto-generated** - Do not edit manually
>
> Generated: ${timestamp}
> Tool Count: ${AI_TOOLS.length}

This document is automatically generated from \`apps/dgfy-api/src/config/aiTools.js\`.
For the full AI Assistant documentation, see [AI_GUIDELINES.md](../AI_GUIDELINES.md).

---

## Summary

| Metric | Count |
|--------|-------|
| Total Tools | ${AI_TOOLS.length} |
| Read Operations | ${readTools.length} |
| Write Operations | ${writeTools.length} |

### By Category

| Category | Count | Description |
|----------|-------|-------------|
`;

  // Category summary
  const categoryDescriptions = {
    [TOOL_CATEGORIES.READ]: 'Query data, no confirmation needed',
    [TOOL_CATEGORIES.WRITE]: 'Modify data, requires confirmation',
    [TOOL_CATEGORIES.ANALYSIS]: 'Analyze data, no confirmation needed',
    [TOOL_CATEGORIES.IMPORT_EXPORT]: 'Import/Export data, imports require confirmation'
  };

  for (const [cat, tools] of Object.entries(toolsByCategory).sort()) {
    const desc = categoryDescriptions[cat] || 'Miscellaneous tools';
    markdown += `| \`${cat}\` | ${tools.length} | ${desc} |\n`;
  }

  markdown += `
---

## Read Operations

These tools query data and do not require confirmation.

| Tool Name | Description | Required Role |
|-----------|-------------|---------------|
`;

  for (const tool of readTools.sort((a, b) => a.function.name.localeCompare(b.function.name))) {
    const name = tool.function.name;
    const desc = truncate(tool.function.description, 80);
    const role = tool.requiredRole || 'Any';
    markdown += `| \`${name}\` | ${desc} | ${role} |\n`;
  }

  markdown += `
---

## Write Operations

These tools modify data and **require user confirmation** before execution.

| Tool Name | Description | Required Role |
|-----------|-------------|---------------|
`;

  for (const tool of writeTools.sort((a, b) => a.function.name.localeCompare(b.function.name))) {
    const name = tool.function.name;
    const desc = truncate(tool.function.description, 80);
    const role = tool.requiredRole || 'Manager';
    markdown += `| \`${name}\` | ${desc} | ${role} |\n`;
  }

  markdown += `
---

## Detailed Tool Reference

`;

  // Detailed reference for each category
  const categoryOrder = [
    TOOL_CATEGORIES.READ,
    TOOL_CATEGORIES.ANALYSIS,
    TOOL_CATEGORIES.WRITE,
    TOOL_CATEGORIES.IMPORT_EXPORT
  ];

  for (const cat of categoryOrder) {
    const tools = toolsByCategory[cat];
    if (!tools) continue;

    const catTitle = cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' ');
    markdown += `### ${catTitle} Tools\n\n`;

    for (const tool of tools.sort((a, b) => a.function.name.localeCompare(b.function.name))) {
      markdown += formatToolDetails(tool);
    }
  }

  // Handle any uncategorized tools
  if (toolsByCategory['uncategorized']) {
    markdown += `### Uncategorized Tools\n\n`;
    for (const tool of toolsByCategory['uncategorized']) {
      markdown += formatToolDetails(tool);
    }
  }

  markdown += `
---

## Role Permissions

| Role | Read | Write | Analysis | Import/Export |
|------|------|-------|----------|---------------|
| Staff | ✅ | ❌ | ✅ | ❌ |
| Manager | ✅ | ✅ | ✅ | ✅ |
| Admin | ✅ | ✅ | ✅ | ✅ |

---

## Changelog

This file is regenerated on each run of \`npm run generate:ai-docs\`.
Check git history for changes.

---

*Generated by \`apps/dgfy-api/scripts/generate-ai-docs.js\`*
`;

  // Write the file
  const outputDir = path.join(__dirname, '../../../docs/generated');
  const outputPath = path.join(outputDir, 'AI_CAPABILITIES.md');

  // Create directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    log(`   Created directory: docs/generated/`, 'green');
  }

  fs.writeFileSync(outputPath, markdown, 'utf8');
  log(`   Written to: docs/generated/AI_CAPABILITIES.md`, 'green');

  log('\n✅ Documentation generated successfully!\n', 'green');
}

function truncate(str, maxLen) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

function formatToolDetails(tool) {
  const name = tool.function.name;
  const desc = tool.function.description || 'No description';
  const params = tool.function.parameters?.properties || {};
  const required = tool.function.parameters?.required || [];

  let md = `#### \`${name}\`\n\n`;
  md += `${desc}\n\n`;

  if (tool.requiresConfirmation) {
    md += `> ⚠️ **Requires confirmation**\n\n`;
  }

  if (tool.requiredRole) {
    md += `> 🔐 **Required role:** ${tool.requiredRole}\n\n`;
  }

  const paramKeys = Object.keys(params);
  if (paramKeys.length > 0) {
    md += `**Parameters:**\n\n`;
    md += `| Parameter | Type | Required | Description |\n`;
    md += `|-----------|------|----------|-------------|\n`;

    for (const [key, schema] of Object.entries(params)) {
      const isRequired = required.includes(key) ? 'Yes' : 'No';
      const type = schema.type || 'any';
      const paramDesc = truncate(schema.description || '-', 60);
      md += `| \`${key}\` | ${type} | ${isRequired} | ${paramDesc} |\n`;
    }
    md += '\n';
  } else {
    md += `**Parameters:** None\n\n`;
  }

  md += `---\n\n`;
  return md;
}

// Run
main().catch(err => {
  console.error('Generator crashed:', err);
  process.exit(1);
});
