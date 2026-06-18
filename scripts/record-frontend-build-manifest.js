#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const options = {
    projectRoot: process.cwd(),
    targetSha: process.env.RELEASE_TARGET_SHA || process.env.DEPLOY_TARGET_SHA || '',
    output: process.env.FRONTEND_BUILD_MANIFEST_FILE || '',
    surfaces: ['skupervisor', 'pos', 'store'],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--project-root') {
      options.projectRoot = path.resolve(argv[index + 1] || '');
      index += 1;
    } else if (arg === '--target-sha') {
      options.targetSha = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--output') {
      options.output = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--surface') {
      options.surfaces.push(argv[index + 1] || '');
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.output) {
    throw new Error('Missing --output or FRONTEND_BUILD_MANIFEST_FILE');
  }

  options.surfaces = Array.from(new Set(options.surfaces.filter(Boolean)));
  return options;
}

function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function walkFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

function surfaceManifest(projectRoot, surface) {
  const outputDir = path.join(projectRoot, 'dist-apps', surface);
  const files = walkFiles(outputDir);
  const aggregate = crypto.createHash('sha256');
  for (const filePath of files) {
    const relativePath = path.relative(outputDir, filePath).replace(/\\/g, '/');
    aggregate.update(relativePath);
    aggregate.update('\0');
    aggregate.update(hashFile(filePath));
    aggregate.update('\0');
  }

  const indexPath = path.join(outputDir, 'index.html');
  return {
    surface,
    output_dir: path.relative(projectRoot, outputDir).replace(/\\/g, '/'),
    exists: fs.existsSync(outputDir),
    file_count: files.length,
    index_html_sha256: fs.existsSync(indexPath) ? hashFile(indexPath) : null,
    aggregate_sha256: files.length > 0 ? aggregate.digest('hex') : null,
  };
}

function recordFrontendBuildManifest(options) {
  const projectRoot = path.resolve(options.projectRoot);
  const manifest = {
    generated_at: new Date().toISOString(),
    target_sha: options.targetSha || null,
    project_root: projectRoot,
    surfaces: options.surfaces.map((surface) => surfaceManifest(projectRoot, surface)),
  };

  const missing = manifest.surfaces.filter((surface) => !surface.exists || surface.file_count === 0);
  if (missing.length > 0) {
    throw new Error(`Frontend build output missing or empty: ${missing.map((surface) => surface.surface).join(', ')}`);
  }

  fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true });
  fs.writeFileSync(options.output, JSON.stringify(manifest, null, 2));
  console.log(`[frontend-build-manifest] wrote ${options.output}`);
  return manifest;
}

function main() {
  try {
    recordFrontendBuildManifest(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(`[frontend-build-manifest] FAIL: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  recordFrontendBuildManifest,
  surfaceManifest,
};
