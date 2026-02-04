#!/usr/bin/env node
/**
 * AI Tools Validation Script
 *
 * Validates consistency between:
 * - aiTools.js (tool definitions)
 * - aiToolExecutor.js (tool handlers)
 *
 * Run with: npm run validate:ai
 * Exit code 0 = all valid, 1 = validation errors
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader(message) {
  console.log('\n' + colors.bold + colors.cyan + '═'.repeat(60) + colors.reset);
  console.log(colors.bold + colors.cyan + ' ' + message + colors.reset);
  console.log(colors.bold + colors.cyan + '═'.repeat(60) + colors.reset);
}

async function main() {
  logHeader('AI Tools Validation');

  const errors = [];
  const warnings = [];

  // Step 1: Load tool definitions
  log('\n📋 Loading tool definitions...', 'blue');

  let AI_TOOLS;
  let TOOL_CATEGORIES;

  try {
    const aiToolsModule = await import('../src/config/aiTools.js');
    AI_TOOLS = aiToolsModule.AI_TOOLS;
    TOOL_CATEGORIES = aiToolsModule.TOOL_CATEGORIES;
    log(`   Found ${AI_TOOLS.length} tool definitions`, 'green');
  } catch (err) {
    errors.push(`Failed to load aiTools.js: ${err.message}`);
    log(`   ✗ Failed to load aiTools.js: ${err.message}`, 'red');
    printSummary(errors, warnings);
    process.exit(1);
  }

  // Step 2: Extract tool names from definitions
  const definedTools = new Set();
  const toolDetails = {};

  for (const tool of AI_TOOLS) {
    const name = tool.function?.name;
    if (!name) {
      errors.push('Found tool without a name');
      continue;
    }

    if (definedTools.has(name)) {
      errors.push(`Duplicate tool name: ${name}`);
    }

    definedTools.add(name);
    toolDetails[name] = {
      category: tool.category,
      requiresConfirmation: tool.requiresConfirmation,
      requiredRole: tool.requiredRole,
      hasDescription: !!tool.function?.description,
      hasParameters: !!tool.function?.parameters
    };
  }

  log(`   Extracted ${definedTools.size} unique tool names`, 'green');

  // Step 3: Parse aiToolExecutor.js for handler cases
  log('\n🔧 Checking tool handlers...', 'blue');

  const executorPath = path.join(__dirname, '../src/services/aiToolExecutor.js');
  let executorContent;

  try {
    executorContent = fs.readFileSync(executorPath, 'utf8');
  } catch (err) {
    errors.push(`Failed to read aiToolExecutor.js: ${err.message}`);
    log(`   ✗ Failed to read aiToolExecutor.js`, 'red');
    printSummary(errors, warnings);
    process.exit(1);
  }

  // Extract case statements from the switch block
  const casePattern = /case\s+['"]([^'"]+)['"]\s*:/g;
  const handledTools = new Set();
  let match;

  while ((match = casePattern.exec(executorContent)) !== null) {
    handledTools.add(match[1]);
  }

  log(`   Found ${handledTools.size} tool handlers`, 'green');

  // Step 4: Cross-reference definitions and handlers
  log('\n🔍 Cross-referencing...', 'blue');

  // Tools defined but not handled
  const missingHandlers = [];
  for (const tool of definedTools) {
    if (!handledTools.has(tool)) {
      missingHandlers.push(tool);
    }
  }

  // Handlers without definitions (orphaned)
  const orphanedHandlers = [];
  for (const handler of handledTools) {
    if (!definedTools.has(handler)) {
      orphanedHandlers.push(handler);
    }
  }

  if (missingHandlers.length > 0) {
    for (const tool of missingHandlers) {
      errors.push(`Tool "${tool}" is defined but has no handler in aiToolExecutor.js`);
    }
    log(`   ✗ ${missingHandlers.length} tools missing handlers:`, 'red');
    missingHandlers.forEach(t => log(`     - ${t}`, 'red'));
  }

  if (orphanedHandlers.length > 0) {
    for (const handler of orphanedHandlers) {
      warnings.push(`Handler "${handler}" exists but tool is not defined in aiTools.js`);
    }
    log(`   ⚠ ${orphanedHandlers.length} orphaned handlers:`, 'yellow');
    orphanedHandlers.forEach(h => log(`     - ${h}`, 'yellow'));
  }

  if (missingHandlers.length === 0 && orphanedHandlers.length === 0) {
    log(`   ✓ All ${definedTools.size} tools have matching handlers`, 'green');
  }

  // Step 5: Validate tool metadata
  log('\n📊 Validating tool metadata...', 'blue');

  const validCategories = new Set(Object.values(TOOL_CATEGORIES));
  let metadataIssues = 0;

  for (const [name, details] of Object.entries(toolDetails)) {
    // Check category
    if (!details.category) {
      warnings.push(`Tool "${name}" has no category`);
      metadataIssues++;
    } else if (!validCategories.has(details.category)) {
      errors.push(`Tool "${name}" has invalid category: ${details.category}`);
      metadataIssues++;
    }

    // Check description
    if (!details.hasDescription) {
      warnings.push(`Tool "${name}" has no description`);
      metadataIssues++;
    }

    // Check parameters
    if (!details.hasParameters) {
      warnings.push(`Tool "${name}" has no parameters schema`);
      metadataIssues++;
    }
  }

  if (metadataIssues === 0) {
    log(`   ✓ All tools have valid metadata`, 'green');
  } else {
    log(`   ⚠ Found ${metadataIssues} metadata issues`, 'yellow');
  }

  // Step 6: Category distribution
  log('\n📈 Tool Distribution:', 'blue');

  const categoryCount = {};
  for (const details of Object.values(toolDetails)) {
    const cat = details.category || 'uncategorized';
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
  }

  for (const [cat, count] of Object.entries(categoryCount).sort((a, b) => b[1] - a[1])) {
    const bar = '█'.repeat(Math.ceil(count / 2));
    log(`   ${cat.padEnd(15)} ${String(count).padStart(2)} ${bar}`, 'cyan');
  }

  // Step 7: Confirmation requirements
  const writeCount = Object.values(toolDetails).filter(d => d.requiresConfirmation).length;
  const readCount = Object.values(toolDetails).filter(d => !d.requiresConfirmation).length;

  log(`\n   Write tools (require confirmation): ${writeCount}`, 'cyan');
  log(`   Read tools (no confirmation):       ${readCount}`, 'cyan');

  // Print summary
  printSummary(errors, warnings);

  // Exit with appropriate code
  if (errors.length > 0) {
    process.exit(1);
  }

  process.exit(0);
}

function printSummary(errors, warnings) {
  logHeader('Validation Summary');

  if (errors.length === 0 && warnings.length === 0) {
    log('\n✅ All validations passed!', 'green');
    log('\nAI tool definitions are consistent with handlers.\n', 'green');
  } else {
    if (errors.length > 0) {
      log(`\n❌ ${errors.length} Error(s):`, 'red');
      errors.forEach((e, i) => log(`   ${i + 1}. ${e}`, 'red'));
    }

    if (warnings.length > 0) {
      log(`\n⚠️  ${warnings.length} Warning(s):`, 'yellow');
      warnings.forEach((w, i) => log(`   ${i + 1}. ${w}`, 'yellow'));
    }

    if (errors.length > 0) {
      log('\n❌ Validation FAILED. Fix errors before committing.\n', 'red');
    } else {
      log('\n⚠️  Validation passed with warnings.\n', 'yellow');
    }
  }
}

// Run the validator
main().catch(err => {
  console.error('Validation script crashed:', err);
  process.exit(1);
});
