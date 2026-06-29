const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const { BatchInventoryError, checkBatchInventory } = require('./check-batch-inventory');
const { makeRepo, createReviewedManifest, writeFile, runGit, silentLogger } = require('./check-batch-inventory.test');

function strictInventory(root, mutate) {
  writeFile(root, 'scripts/change.js', 'module.exports = true;\n');
  runGit(root, ['add', '.']);
  runGit(root, ['commit', '-m', 'change']);
  const reviewedManifestPath = createReviewedManifest(root, mutate);
  return () => checkBatchInventory({
    projectRoot: root,
    base: 'origin/master',
    head: 'HEAD',
    reviewedManifestPath,
    write: false,
    requireShip: true,
  }, silentLogger);
}

test('missing documentation closure fails strict inventory', () => {
  const root = makeRepo();
  try {
    const run = strictInventory(root, (manifest) => {
      delete manifest.release_slices[0].documentation_closure;
      return manifest;
    });
    assert.throws(run, (error) => error instanceof BatchInventoryError && /requires documentation_closure/.test(error.message));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('placeholder documentation closure fails strict inventory', () => {
  const root = makeRepo();
  try {
    const run = strictInventory(root, (manifest) => {
      manifest.release_slices[0].documentation_closure.reviewed_by = 'TODO reviewer';
      return manifest;
    });
    assert.throws(run, /reviewed_by is missing or placeholder/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('updated documentation absent from the candidate diff fails', () => {
  const root = makeRepo();
  try {
    const run = strictInventory(root, (manifest) => {
      const closure = manifest.release_slices[0].documentation_closure;
      closure.decision = 'updated';
      closure.documents[0].action = 'updated';
      closure.rationale = 'The release workflow documentation was updated for this implementation.';
      return manifest;
    });
    assert.throws(run, /marks an unchanged document as updated/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('reviewed-current documentation passes with a specific reason', () => {
  const root = makeRepo();
  try {
    const run = strictInventory(root);
    const { inventory } = run();
    assert.equal(inventory.status, 'pass');
    assert.equal(inventory.release_slices[0].documentation_closure.decision, 'no_change_required');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('cross-boundary slice without an updated ADR fails', () => {
  const root = makeRepo();
  try {
    const run = strictInventory(root, (manifest) => {
      manifest.release_slices[0].architecture_classification = 'cross-boundary';
      return manifest;
    });
    assert.throws(run, /cross-boundary and requires an updated ADR/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
