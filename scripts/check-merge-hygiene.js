#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFLICT_MARKER_PATTERN = /^(<<<<<<< |=======\s*$|>>>>>>> )/m;
const TEMP_CONFLICT_FILE_PATTERNS = [/\.orig$/, /\.rej$/];
const ALLOWED_DECISIONS = new Set(['adopt', 'combine', 'preserve-master', 'reject']);

class MergeHygieneError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'MergeHygieneError';
    this.code = options.code || 'MERGE_HYGIENE_FAILED';
    this.errors = options.errors || [message];
    this.warnings = options.warnings || [];
    this.report = options.report || null;
  }
}

function parseArgs(argv) {
  const options = {
    projectRoot: process.cwd(),
    base: process.env.MERGE_HYGIENE_BASE || '',
    head: process.env.MERGE_HYGIENE_HEAD || 'HEAD',
    target: process.env.MERGE_HYGIENE_TARGET || '',
    reportPath: process.env.MERGE_HYGIENE_REPORT_FILE || '',
    justificationPath: process.env.MERGE_HYGIENE_JUSTIFICATION || '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--project-root') {
      const value = argv[index + 1];
      if (!value) throw new MergeHygieneError('Missing value for --project-root', { code: 'INVALID_ARGS' });
      options.projectRoot = path.resolve(value);
      index += 1;
    } else if (arg === '--base') {
      options.base = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--head') {
      options.head = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--target') {
      options.target = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--report') {
      options.reportPath = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--justification') {
      options.justificationPath = argv[index + 1] || '';
      index += 1;
    } else {
      throw new MergeHygieneError(`Unknown argument: ${arg}`, { code: 'INVALID_ARGS' });
    }
  }

  if (!options.base) throw new MergeHygieneError('Missing value for --base', { code: 'INVALID_ARGS' });
  if (!options.head) throw new MergeHygieneError('Missing value for --head', { code: 'INVALID_ARGS' });
  return options;
}

function runGit(projectRoot, args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: projectRoot,
    encoding: options.encoding || 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });

  return {
    ok: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
  };
}

function resolveRef(projectRoot, ref, label) {
  const result = runGit(projectRoot, ['rev-parse', '--verify', `${ref}^{commit}`]);
  if (!result.ok) {
    throw new MergeHygieneError(`Could not resolve ${label} ref: ${ref}`, {
      code: 'REF_NOT_FOUND',
      errors: [result.stderr.trim() || `git rev-parse failed for ${ref}`],
    });
  }
  return result.stdout.trim();
}

function computeMergeBase(projectRoot, baseRef, headRef) {
  const result = runGit(projectRoot, ['merge-base', baseRef, headRef]);
  if (!result.ok) {
    throw new MergeHygieneError(`Could not compute merge base for ${baseRef}...${headRef}`, {
      code: 'MERGE_BASE_FAILED',
      errors: [result.stderr.trim() || `exit ${result.status}`],
    });
  }
  return result.stdout.trim();
}

function getCommitParents(projectRoot, ref) {
  const result = runGit(projectRoot, ['rev-list', '--parents', '-n', '1', ref]);
  if (!result.ok) return [];
  const parts = result.stdout.trim().split(/\s+/).filter(Boolean);
  return parts.slice(1);
}

function computeTargetComparisonBase(projectRoot, headRef, targetRef, fallbackMergeBase) {
  if (!targetRef) return fallbackMergeBase;
  const parents = getCommitParents(projectRoot, headRef);
  if (parents.length < 2) return fallbackMergeBase;

  const nonTargetParents = parents.filter((parent) => parent !== targetRef);
  if (nonTargetParents.length !== 1) return fallbackMergeBase;

  const result = runGit(projectRoot, ['merge-base', targetRef, nonTargetParents[0]]);
  if (!result.ok) return fallbackMergeBase;
  return result.stdout.trim();
}

function parseNameStatus(output) {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\t+/);
      const status = parts[0];
      if (status.startsWith('R') || status.startsWith('C')) {
        return { status, path: parts[2], oldPath: parts[1] };
      }
      return { status, path: parts[1] };
    })
    .filter((entry) => entry.path);
}

function collectNameStatus(projectRoot, fromRef, toRef) {
  const result = runGit(projectRoot, ['diff', '--name-status', `${fromRef}..${toRef}`, '--']);
  if (!result.ok) {
    throw new MergeHygieneError(`Could not inspect changed files for ${fromRef}..${toRef}`, {
      code: 'DIFF_FAILED',
      errors: [result.stderr.trim() || `exit ${result.status}`],
    });
  }
  return parseNameStatus(result.stdout);
}

function listAddedInHistory(projectRoot, fromRef, toRef) {
  const result = runGit(projectRoot, [
    'log',
    '--diff-filter=A',
    '--name-only',
    '--format=',
    `${fromRef}..${toRef}`,
    '--',
  ]);
  if (!result.ok) {
    throw new MergeHygieneError(`Could not inspect added-file history for ${fromRef}..${toRef}`, {
      code: 'LOG_FAILED',
      errors: [result.stderr.trim() || `exit ${result.status}`],
    });
  }
  return Array.from(new Set(result.stdout.split(/\r?\n/).filter(Boolean)));
}

function fileExistsAt(projectRoot, ref, filePath) {
  return runGit(projectRoot, ['cat-file', '-e', `${ref}:${filePath}`]).ok;
}

function readFileAt(projectRoot, ref, filePath) {
  const result = runGit(projectRoot, ['show', `${ref}:${filePath}`]);
  if (!result.ok) return null;
  return result.stdout;
}

function loadJustification(projectRoot, justificationPath) {
  if (!justificationPath) {
    return {
      intentional_deletions: new Map(),
      accepted_reversions: new Map(),
      intentional_dropped_additions: new Map(),
      warnings: [],
    };
  }

  const absolutePath = path.resolve(projectRoot, justificationPath);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    throw new MergeHygieneError(`Could not read merge hygiene justification: ${error.message}`, {
      code: 'JUSTIFICATION_PARSE_FAILED',
    });
  }

  const warnings = [];
  const normalizeEntries = (field) => {
    const entries = Array.isArray(parsed[field]) ? parsed[field] : [];
    const map = new Map();
    for (const entry of entries) {
      if (!entry || typeof entry.path !== 'string') {
        warnings.push(`${field} entry is missing path`);
        continue;
      }
      if (!entry.reason || typeof entry.reason !== 'string') {
        warnings.push(`${field} entry for ${entry.path} is missing reason`);
        continue;
      }
      if (entry.decision && !ALLOWED_DECISIONS.has(entry.decision)) {
        warnings.push(`${field} entry for ${entry.path} has unsupported decision ${entry.decision}`);
        continue;
      }
      map.set(entry.path, entry);
    }
    return map;
  };

  return {
    intentional_deletions: normalizeEntries('intentional_deletions'),
    accepted_reversions: normalizeEntries('accepted_reversions'),
    intentional_dropped_additions: normalizeEntries('intentional_dropped_additions'),
    warnings,
  };
}

function isJustified(map, filePath) {
  return map.has(filePath);
}

function changedFileSummary(entry) {
  return {
    status: entry.status,
    path: entry.path,
    ...(entry.oldPath ? { old_path: entry.oldPath } : {}),
  };
}

function inspectConflictMarkers(projectRoot, headRef, changedFiles) {
  const findings = [];
  for (const entry of changedFiles) {
    const filePath = entry.path;
    if (TEMP_CONFLICT_FILE_PATTERNS.some((pattern) => pattern.test(filePath))) {
      findings.push({ path: filePath, reason: 'conflict-resolution temporary file is present' });
      continue;
    }
    if (!fileExistsAt(projectRoot, headRef, filePath)) continue;
    const content = readFileAt(projectRoot, headRef, filePath);
    if (content === null || content.length > 1024 * 1024) continue;
    if (CONFLICT_MARKER_PATTERN.test(content)) {
      findings.push({ path: filePath, reason: 'unresolved conflict marker is present' });
    }
  }
  return findings;
}

function inspectDroppedAdditions(projectRoot, mergeBase, headRef, justification) {
  return listAddedInHistory(projectRoot, mergeBase, headRef)
    .filter((filePath) => !fileExistsAt(projectRoot, headRef, filePath))
    .filter((filePath) => !isJustified(justification.intentional_dropped_additions, filePath))
    .map((filePath) => ({
      path: filePath,
      reason: 'file was added in this branch history but is absent from the final head tree',
    }));
}

function inspectSuspiciousDeletions(changedFiles, justification) {
  return changedFiles
    .filter((entry) => entry.status === 'D')
    .filter((entry) => !isJustified(justification.intentional_deletions, entry.path))
    .map((entry) => ({
      path: entry.path,
      status: entry.status,
      reason: 'deleted file needs an intentional deletion reason for always-on merge hygiene',
    }));
}

function inspectTargetReversions(projectRoot, mergeBase, headRef, targetRef, justification) {
  if (!targetRef) return { preserved: [], suspicious: [] };

  const targetChanges = collectNameStatus(projectRoot, mergeBase, targetRef);
  const preserved = [];
  const suspicious = [];

  for (const entry of targetChanges) {
    const filePath = entry.path;
    if (entry.status === 'D') continue;

    const targetExists = fileExistsAt(projectRoot, targetRef, filePath);
    if (!targetExists) continue;

    const headExists = fileExistsAt(projectRoot, headRef, filePath);
    if (!headExists) {
      if (!isJustified(justification.accepted_reversions, filePath)) {
        suspicious.push({
          path: filePath,
          status: entry.status,
          reason: 'target-side changed file is absent from the final head tree',
        });
      }
      continue;
    }

    const baseContent = fileExistsAt(projectRoot, mergeBase, filePath)
      ? readFileAt(projectRoot, mergeBase, filePath)
      : null;
    const targetContent = readFileAt(projectRoot, targetRef, filePath);
    const headContent = readFileAt(projectRoot, headRef, filePath);

    if (baseContent !== null && targetContent !== baseContent && headContent === baseContent) {
      if (!isJustified(justification.accepted_reversions, filePath)) {
        suspicious.push({
          path: filePath,
          status: entry.status,
          reason: 'final head restores the merge-base content and drops target-side changes',
        });
      }
    } else {
      preserved.push({ path: filePath, status: entry.status });
    }
  }

  return { preserved, suspicious };
}

function checkMergeHygiene(options, logger = console) {
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const baseSha = resolveRef(projectRoot, options.base, 'base');
  const headSha = resolveRef(projectRoot, options.head, 'head');
  const targetSha = options.target ? resolveRef(projectRoot, options.target, 'target') : '';
  const mergeBase = computeMergeBase(projectRoot, baseSha, headSha);
  const justification = loadJustification(projectRoot, options.justificationPath || '');
  const changedFiles = collectNameStatus(projectRoot, mergeBase, headSha);

  const suspiciousDeletions = inspectSuspiciousDeletions(changedFiles, justification);
  const suspiciousDroppedAdditions = inspectDroppedAdditions(projectRoot, mergeBase, headSha, justification);
  const conflictFindings = inspectConflictMarkers(projectRoot, headSha, changedFiles);
  const targetComparisonBase = computeTargetComparisonBase(projectRoot, headSha, targetSha, mergeBase);
  const targetReview = inspectTargetReversions(projectRoot, targetComparisonBase, headSha, targetSha, justification);

  const warnings = [...justification.warnings];
  const errors = [];

  for (const deletion of suspiciousDeletions) errors.push(`${deletion.path}: ${deletion.reason}`);
  for (const dropped of suspiciousDroppedAdditions) errors.push(`${dropped.path}: ${dropped.reason}`);
  for (const conflict of conflictFindings) errors.push(`${conflict.path}: ${conflict.reason}`);
  for (const reversion of targetReview.suspicious) errors.push(`${reversion.path}: ${reversion.reason}`);

  const report = {
    version: 1,
    generated_at: new Date().toISOString(),
    status: errors.length > 0 ? 'fail' : (warnings.length > 0 ? 'warn' : 'pass'),
    base: options.base,
    head: options.head,
    target: options.target || '',
    base_sha: baseSha,
    head_sha: headSha,
    target_sha: targetSha,
    merge_base: mergeBase,
    target_comparison_base: targetComparisonBase,
    justification_path: options.justificationPath || '',
    changed_files: changedFiles.map(changedFileSummary),
    added_files: changedFiles.filter((entry) => entry.status === 'A').map(changedFileSummary),
    deleted_files: changedFiles.filter((entry) => entry.status === 'D').map(changedFileSummary),
    target_changes_preserved: targetReview.preserved,
    suspicious_reversions: targetReview.suspicious,
    suspicious_deletions: suspiciousDeletions,
    suspicious_dropped_additions: suspiciousDroppedAdditions,
    conflict_markers: conflictFindings,
    warnings,
    errors,
  };

  if (options.reportPath) {
    const absoluteReportPath = path.resolve(projectRoot, options.reportPath);
    fs.mkdirSync(path.dirname(absoluteReportPath), { recursive: true });
    fs.writeFileSync(absoluteReportPath, JSON.stringify(report, null, 2));
  }

  logger.log(`[merge-hygiene] ${report.status.toUpperCase()} base=${options.base} head=${options.head}`);
  if (options.target) logger.log(`[merge-hygiene] target=${options.target}`);
  for (const warning of warnings) logger.warn(`[merge-hygiene] WARN ${warning}`);
  for (const error of errors) logger.error(`[merge-hygiene] FAIL ${error}`);

  if (errors.length > 0) {
    throw new MergeHygieneError('Merge hygiene check failed.', {
      code: 'MERGE_HYGIENE_FAILED',
      errors,
      warnings,
      report,
    });
  }

  return report;
}

function main() {
  try {
    checkMergeHygiene(parseArgs(process.argv.slice(2)));
  } catch (error) {
    if (error instanceof MergeHygieneError) {
      console.error(`[merge-hygiene] ${error.code}: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  MergeHygieneError,
  parseArgs,
  checkMergeHygiene,
  collectNameStatus,
  inspectSuspiciousDeletions,
  inspectTargetReversions,
  loadJustification,
};
