#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_MANIFEST_PATH = 'scripts/frontend-split-path-map.json';
const DEFAULT_HEAD = 'origin/develop';
const LEGACY_ROOT_PREFIX = 'apps/dgfy-web/';

class FrontendSplitSyncError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'FrontendSplitSyncError';
    this.code = options.code || 'FRONTEND_SPLIT_SYNC_FAILED';
  }
}

function loadManifest(manifestPath) {
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);
  return {
    prefixMap: manifest.prefixMap || [],
    specialCases: manifest.specialCases || [],
    retired: manifest.retired || [],
    consumerPathPatterns: (manifest.consumerPathPatterns || []).map((pattern) => new RegExp(pattern)),
  };
}

function mapPrefix(filePath, manifest) {
  const specialCase = manifest.specialCases.find((entry) => entry.old === filePath);
  if (specialCase) {
    return specialCase.new;
  }
  const prefixEntry = manifest.prefixMap
    .filter((entry) => filePath.startsWith(entry.old))
    .sort((a, b) => b.old.length - a.old.length)[0];
  if (prefixEntry) {
    return prefixEntry.new + filePath.slice(prefixEntry.old.length);
  }
  return null;
}

function classifyPath(filePath, manifest, status) {
  if (manifest.retired.includes(filePath)) {
    return { category: 'retired', mappedTo: null };
  }
  if (manifest.consumerPathPatterns.some((pattern) => pattern.test(filePath))) {
    return { category: 'consumer', mappedTo: null };
  }
  const mappedTo = mapPrefix(filePath, manifest);
  if (mappedTo) {
    return { category: 'mapped', mappedTo };
  }
  if (filePath.startsWith(LEGACY_ROOT_PREFIX)) {
    return {
      category: status === 'A' ? 'unmapped-new' : 'unmapped',
      mappedTo: null,
    };
  }
  return { category: 'unrelated', mappedTo: null };
}

function runGit(args, projectRoot) {
  const result = spawnSync('git', args, { cwd: projectRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new FrontendSplitSyncError(`git ${args.join(' ')} failed: ${result.stderr}`, { code: 'GIT_FAILED' });
  }
  return result.stdout;
}

function resolveMergeBase(projectRoot, head) {
  return runGit(['merge-base', 'HEAD', head], projectRoot).trim();
}

function getDiffEntries(projectRoot, base, head) {
  const output = runGit(['diff', '--name-status', '--find-renames', `${base}..${head}`], projectRoot);
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t');
      const status = parts[0][0];
      if (status === 'R' || status === 'C') {
        return { status, renamedFrom: parts[1], path: parts[2] };
      }
      return { status, path: parts[1] };
    });
}

function classifyDiff(entries, manifest) {
  const grouped = { mapped: [], 'unmapped-new': [], unmapped: [], consumer: [], retired: [], unrelated: [] };
  for (const entry of entries) {
    const { category, mappedTo } = classifyPath(entry.path, manifest, entry.status);
    grouped[category].push({ ...entry, mappedTo });
  }
  return grouped;
}

function getTrackedUnderRetiredPrefixes(projectRoot, manifest) {
  const prefixes = [LEGACY_ROOT_PREFIX, ...manifest.retired];
  const results = [];
  for (const prefix of prefixes) {
    const output = runGit(['ls-files', '--', prefix.endsWith('/') ? `${prefix}**` : prefix], projectRoot);
    const files = output.split('\n').filter(Boolean);
    for (const file of files) {
      results.push({ path: file, mappedTo: mapPrefix(file, manifest) });
    }
  }
  return results;
}

function formatReport(grouped) {
  const lines = [];
  const sections = [
    ['mapped', 'Mapped (incoming change lands at a known new path)'],
    ['unmapped-new', 'ACTION REQUIRED - new file added under a retired/split path'],
    ['unmapped', 'ACTION REQUIRED - changed file under apps/dgfy-web/ has no manifest mapping'],
    ['consumer', 'REVIEW REQUIRED - consumer file changed, port intent to fanned-out equivalents'],
    ['retired', 'REVIEW REQUIRED - change targets a retired file, port intent manually'],
  ];
  for (const [key, title] of sections) {
    const items = grouped[key];
    if (items.length === 0) continue;
    lines.push(`\n${title} (${items.length}):`);
    for (const item of items) {
      const arrow = item.mappedTo ? ` -> ${item.mappedTo}` : '';
      const from = item.renamedFrom ? `${item.renamedFrom} -> ` : '';
      lines.push(`  [${item.status}] ${from}${item.path}${arrow}`);
    }
  }
  lines.push(
    `\nSummary: ${grouped.mapped.length} mapped, ${grouped['unmapped-new'].length} unmapped-new, ` +
      `${grouped.unmapped.length} unmapped, ${grouped.consumer.length} consumer, ${grouped.retired.length} retired, ` +
      `${grouped.unrelated.length} unrelated.`
  );
  return lines.join('\n');
}

function formatPostMergeReport(resurrected) {
  if (resurrected.length === 0) {
    return 'post-merge: clean - no tracked files under retired frontend-split paths.';
  }
  const lines = [`post-merge: ${resurrected.length} file(s) resurrected under a retired frontend-split path:`];
  for (const item of resurrected) {
    const arrow = item.mappedTo ? ` -> git mv to ${item.mappedTo}` : ' -> no manifest mapping, place manually';
    lines.push(`  ${item.path}${arrow}`);
  }
  return lines.join('\n');
}

function hasActionRequired(grouped) {
  return grouped['unmapped-new'].length > 0 || grouped.unmapped.length > 0;
}

function parseArgs(argv) {
  const options = {
    projectRoot: process.cwd(),
    manifestPath: DEFAULT_MANIFEST_PATH,
    base: '',
    head: DEFAULT_HEAD,
    strict: false,
    postMerge: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--project-root') {
      options.projectRoot = path.resolve(argv[index + 1] || '');
      index += 1;
    } else if (arg === '--manifest') {
      options.manifestPath = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--base') {
      options.base = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--head') {
      options.head = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--strict') {
      options.strict = true;
    } else if (arg === '--post-merge') {
      options.postMerge = true;
    }
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifestPath = path.isAbsolute(options.manifestPath)
    ? options.manifestPath
    : path.join(options.projectRoot, options.manifestPath);
  const manifest = loadManifest(manifestPath);

  if (options.postMerge) {
    const resurrected = getTrackedUnderRetiredPrefixes(options.projectRoot, manifest);
    console.log(formatPostMergeReport(resurrected));
    if (options.strict && resurrected.length > 0) {
      process.exit(1);
    }
    return;
  }

  const base = options.base || resolveMergeBase(options.projectRoot, options.head);
  const entries = getDiffEntries(options.projectRoot, base, options.head);
  const grouped = classifyDiff(entries, manifest);
  console.log(`Comparing ${base}..${options.head}`);
  console.log(formatReport(grouped));
  if (options.strict && hasActionRequired(grouped)) {
    process.exit(1);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    if (error instanceof FrontendSplitSyncError) {
      console.error(`[report-frontend-split-sync] ${error.code}: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

module.exports = {
  FrontendSplitSyncError,
  loadManifest,
  mapPrefix,
  classifyPath,
  classifyDiff,
  getDiffEntries,
  getTrackedUnderRetiredPrefixes,
  formatReport,
  formatPostMergeReport,
  hasActionRequired,
  parseArgs,
};
