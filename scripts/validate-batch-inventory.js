#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const {
  BatchInventoryError,
  changedFiles,
  validateInventory,
  normalizeSlices,
} = require('./check-batch-inventory');

function parseArgs(argv) {
  const options = {
    projectRoot: process.cwd(),
    inventoryPath: process.env.BATCH_INVENTORY_FILE || '',
    base: process.env.BATCH_INVENTORY_BASE || '',
    head: process.env.BATCH_INVENTORY_HEAD || process.env.RELEASE_TARGET_SHA || process.env.GITHUB_SHA || '',
    requireShip: process.env.BATCH_INVENTORY_REQUIRE_SHIP === '1',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--project-root') {
      options.projectRoot = path.resolve(argv[index + 1] || '');
      index += 1;
    } else if (arg === '--inventory') {
      options.inventoryPath = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--base') {
      options.base = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--head') {
      options.head = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--require-ship') {
      options.requireShip = true;
    } else {
      throw new BatchInventoryError(`Unknown argument: ${arg}`, { code: 'INVALID_ARGS' });
    }
  }

  if (!options.inventoryPath) {
    throw new BatchInventoryError('Missing --inventory', { code: 'INVALID_ARGS' });
  }
  return options;
}

function validateBatchInventoryFile(options, logger = console) {
  const absoluteInventoryPath = path.resolve(options.projectRoot, options.inventoryPath);
  if (!fs.existsSync(absoluteInventoryPath)) {
    throw new BatchInventoryError(`Batch inventory is missing: ${options.inventoryPath}`, {
      code: 'INVENTORY_MISSING',
    });
  }

  let inventory;
  try {
    inventory = JSON.parse(fs.readFileSync(absoluteInventoryPath, 'utf8'));
  } catch (error) {
    throw new BatchInventoryError(`Could not parse batch inventory JSON: ${error.message}`, {
      code: 'INVENTORY_PARSE_FAILED',
    });
  }

  let expectedChangedFiles = inventory.expected_changed_files || [];
  if (options.base && options.head) {
    expectedChangedFiles = changedFiles(options.projectRoot, options.base, options.head).sort();
  }

  const failures = validateInventory(inventory, {
    requireShip: options.requireShip,
    expectedChangedFiles,
  });

  if (failures.length > 0) {
    throw new BatchInventoryError(failures.join('\n'), {
      code: 'INVENTORY_INVALID',
      failures,
      report: inventory,
    });
  }

  logger.log(
    `[batch-inventory-validate] PASS inventory=${options.inventoryPath} slices=${normalizeSlices(inventory).length} files=${inventory.changed_file_count || 0}`
  );
  return inventory;
}

function main() {
  try {
    validateBatchInventoryFile(parseArgs(process.argv.slice(2)));
  } catch (error) {
    if (error instanceof BatchInventoryError) {
      console.error(`[batch-inventory-validate] ${error.code}: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

if (require.main === module) main();

module.exports = {
  parseArgs,
  validateBatchInventoryFile,
};
