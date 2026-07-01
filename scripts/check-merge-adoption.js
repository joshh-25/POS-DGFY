#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ALLOWED_DECISIONS = new Set(['adopt', 'combine', 'preserve-master', 'reject']);
const ALLOWED_SEMANTIC_CONFLICT_STATUSES = new Set(['none', 'user-approved']);

class MergeAdoptionError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'MergeAdoptionError';
    this.code = options.code || 'MERGE_ADOPTION_FAILED';
    this.errors = options.errors || [message];
    this.warnings = options.warnings || [];
    this.report = options.report || null;
  }
}

function parseArgs(argv) {
  const options = {
    projectRoot: process.cwd(),
    manifestPath: process.env.MERGE_ADOPTION_MANIFEST || process.env.RELEASE_MERGE_ADOPTION_MANIFEST || '',
    reportPath: process.env.MERGE_ADOPTION_REPORT_FILE || '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manifest') {
      const value = argv[index + 1];
      if (!value) throw new MergeAdoptionError('Missing value for --manifest', { code: 'INVALID_ARGS' });
      options.manifestPath = value;
      index += 1;
    } else if (arg === '--project-root') {
      const value = argv[index + 1];
      if (!value) throw new MergeAdoptionError('Missing value for --project-root', { code: 'INVALID_ARGS' });
      options.projectRoot = path.resolve(value);
      index += 1;
    } else if (arg === '--report') {
      const value = argv[index + 1];
      if (!value) throw new MergeAdoptionError('Missing value for --report', { code: 'INVALID_ARGS' });
      options.reportPath = value;
      index += 1;
    } else {
      throw new MergeAdoptionError(`Unknown argument: ${arg}`, { code: 'INVALID_ARGS' });
    }
  }

  if (!options.manifestPath) {
    throw new MergeAdoptionError(
      'A merge adoption manifest is required. Pass --manifest <path> or set MERGE_ADOPTION_MANIFEST.',
      { code: 'MANIFEST_REQUIRED' }
    );
  }

  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function pathExists(projectRoot, relativePath) {
  return fs.existsSync(path.join(projectRoot, relativePath));
}

function readText(projectRoot, relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function normalizeList(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeRejectedFiles(manifest) {
  const rejected = new Map();
  for (const entry of normalizeList(manifest.explicitly_rejected_files)) {
    if (typeof entry === 'string') {
      rejected.set(entry, '<missing reason>');
    } else if (entry && typeof entry.path === 'string') {
      rejected.set(entry.path, entry.reason || '<missing reason>');
    }
  }
  return rejected;
}

function matchText(content, matcher) {
  if (typeof matcher.text === 'string') {
    return content.includes(matcher.text);
  }

  if (typeof matcher.regex === 'string') {
    return new RegExp(matcher.regex, matcher.flags || '').test(content);
  }

  return false;
}

function matcherLabel(matcher) {
  if (typeof matcher.text === 'string') return `text:${matcher.text}`;
  if (typeof matcher.regex === 'string') return `regex:${matcher.regex}`;
  return '<invalid matcher>';
}

function runGit(projectRoot, args) {
  const result = spawnSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  return {
    ok: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
  };
}

function ensureSourceRefAvailable(projectRoot, ref) {
  let revCheck = runGit(projectRoot, ['rev-parse', '--verify', `${ref}^{commit}`]);
  if (revCheck.ok) return revCheck;

  const pullRefMatch = /^origin\/pr\/(\d+)$/.exec(ref);
  if (pullRefMatch) {
    runGit(projectRoot, ['fetch', 'origin', `pull/${pullRefMatch[1]}/head:refs/remotes/${ref}`]);
    revCheck = runGit(projectRoot, ['rev-parse', '--verify', `${ref}^{commit}`]);
  }

  return revCheck;
}

function collectAddedFilesFromSourceRefs(projectRoot, sourceRefs, errors) {
  const added = [];

  for (const sourceRef of normalizeList(sourceRefs)) {
    const ref = typeof sourceRef === 'string' ? sourceRef : sourceRef && sourceRef.ref;
    const base = typeof sourceRef === 'object' && sourceRef ? sourceRef.base : '';
    if (!ref || !base) {
      errors.push(`source_refs entries must include both ref and base: ${JSON.stringify(sourceRef)}`);
      continue;
    }

    const revCheck = ensureSourceRefAvailable(projectRoot, ref);
    if (!revCheck.ok) {
      errors.push(`source ref is not available locally: ${ref}`);
      continue;
    }

    const baseCheck = runGit(projectRoot, ['rev-parse', '--verify', `${base}^{commit}`]);
    if (!baseCheck.ok) {
      errors.push(`source base is not available locally: ${base}`);
      continue;
    }

    const diff = runGit(projectRoot, ['diff', '--name-status', '--diff-filter=A', `${base}..${ref}`, '--']);
    if (!diff.ok) {
      errors.push(`could not inspect added files for ${base}..${ref}: ${diff.stderr.trim() || `exit ${diff.status}`}`);
      continue;
    }

    for (const line of diff.stdout.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const parts = line.split(/\t+/);
      const status = parts[0];
      const filePath = parts[1];
      if (status === 'A' && filePath) {
        added.push({ source_ref: ref, base, path: filePath });
      }
    }
  }

  return added;
}

function validateManifest({ projectRoot, manifestPath, reportPath = '', logger = console }) {
  const absoluteManifestPath = path.resolve(projectRoot, manifestPath);
  const errors = [];
  const warnings = [];
  const checked = {
    files_present: [],
    files_absent: [],
    strings_present: [],
    strings_absent: [],
    source_added_files: [],
  };

  if (!fs.existsSync(absoluteManifestPath)) {
    throw new MergeAdoptionError(`Merge adoption manifest not found: ${manifestPath}`, { code: 'MANIFEST_NOT_FOUND' });
  }

  let manifest;
  try {
    manifest = readJson(absoluteManifestPath);
  } catch (error) {
    throw new MergeAdoptionError(`Could not parse merge adoption manifest: ${error.message}`, {
      code: 'MANIFEST_PARSE_FAILED',
    });
  }

  if (manifest.version !== 1) errors.push('manifest.version must be 1');
  if (!manifest.merge_name) errors.push('manifest.merge_name is required');
  if (!manifest.target_branch) errors.push('manifest.target_branch is required');
  if (!Array.isArray(manifest.feature_areas) || manifest.feature_areas.length === 0) {
    errors.push('manifest.feature_areas must include at least one feature area');
  }

  const semanticReview = manifest.semantic_conflict_review;
  if (!semanticReview || typeof semanticReview !== 'object') {
    errors.push('manifest.semantic_conflict_review is required');
  } else {
    const status = semanticReview.status || '';
    if (!ALLOWED_SEMANTIC_CONFLICT_STATUSES.has(status)) {
      errors.push(
        `manifest.semantic_conflict_review.status must be one of ${Array.from(ALLOWED_SEMANTIC_CONFLICT_STATUSES).join(', ')}`
      );
    }
    const decisions = normalizeList(semanticReview.user_approved_decisions);
    if (status === 'user-approved' && decisions.length === 0) {
      errors.push('manifest.semantic_conflict_review.user_approved_decisions is required when status is user-approved');
    }
    for (const decision of decisions) {
      if (!decision || typeof decision !== 'object') {
        errors.push('semantic conflict decisions must be objects');
        continue;
      }
      if (!decision.area) errors.push('semantic conflict decision requires area');
      if (!decision.question_asked) errors.push('semantic conflict decision requires question_asked');
      if (!ALLOWED_DECISIONS.has(decision.resolution || '')) {
        errors.push(`semantic conflict decision resolution must be one of ${Array.from(ALLOWED_DECISIONS).join(', ')}`);
      }
      if (!decision.approved_by) errors.push('semantic conflict decision requires approved_by');
      if (!decision.rationale) errors.push('semantic conflict decision requires rationale');
    }
  }

  const rejectedFiles = normalizeRejectedFiles(manifest);
  for (const [filePath, reason] of rejectedFiles.entries()) {
    if (!reason || reason === '<missing reason>') {
      errors.push(`explicitly_rejected_files entry requires a reason: ${filePath}`);
    }
  }

  const sourceAddedFiles = collectAddedFilesFromSourceRefs(projectRoot, manifest.source_refs, errors);
  for (const addedFile of sourceAddedFiles) {
    const exists = pathExists(projectRoot, addedFile.path);
    const rejected = rejectedFiles.has(addedFile.path);
    checked.source_added_files.push({ ...addedFile, exists, rejected });
    if (!exists && !rejected) {
      errors.push(
        `source-added file is missing from final tree and is not explicitly rejected: ${addedFile.path} (${addedFile.source_ref})`
      );
    }
  }

  for (const area of normalizeList(manifest.feature_areas)) {
    if (!area || typeof area !== 'object') {
      errors.push('feature_areas entries must be objects');
      continue;
    }

    const areaId = area.id || '<missing id>';
    const decision = area.decision || '';
    const proof = area.proof || {};

    if (!area.id) errors.push('feature area id is required');
    if (!ALLOWED_DECISIONS.has(decision)) {
      errors.push(`${areaId}: decision must be one of ${Array.from(ALLOWED_DECISIONS).join(', ')}`);
    }
    if (!area.intent) errors.push(`${areaId}: intent is required`);
    if (decision === 'reject' && !area.rejection_reason) {
      errors.push(`${areaId}: rejected feature areas require rejection_reason`);
    }

    const proofCount = [
      proof.required_files_present,
      proof.required_files_absent,
      proof.required_strings_present,
      proof.required_strings_absent,
      proof.tests,
      proof.rendered_evidence,
      proof.production_evidence_required,
    ].reduce((count, value) => count + normalizeList(value).length, 0);

    if (decision !== 'reject' && proofCount === 0) {
      errors.push(`${areaId}: adopted or preserved feature areas require proof entries`);
    }

    for (const filePath of normalizeList(proof.required_files_present)) {
      const exists = pathExists(projectRoot, filePath);
      checked.files_present.push({ area: areaId, path: filePath, ok: exists });
      if (!exists) errors.push(`${areaId}: required file is missing: ${filePath}`);
    }

    for (const filePath of normalizeList(proof.required_files_absent)) {
      const exists = pathExists(projectRoot, filePath);
      checked.files_absent.push({ area: areaId, path: filePath, ok: !exists });
      if (exists) errors.push(`${areaId}: rejected/obsolete file still exists: ${filePath}`);
    }

    for (const matcher of normalizeList(proof.required_strings_present)) {
      if (!matcher || typeof matcher.file !== 'string') {
        errors.push(`${areaId}: required_strings_present entries need file plus text or regex`);
        continue;
      }
      if (!pathExists(projectRoot, matcher.file)) {
        errors.push(`${areaId}: string target file is missing: ${matcher.file}`);
        continue;
      }
      const ok = matchText(readText(projectRoot, matcher.file), matcher);
      checked.strings_present.push({ area: areaId, file: matcher.file, matcher: matcherLabel(matcher), ok });
      if (!ok) errors.push(`${areaId}: required string not found in ${matcher.file}: ${matcherLabel(matcher)}`);
    }

    for (const matcher of normalizeList(proof.required_strings_absent)) {
      if (!matcher || typeof matcher.file !== 'string') {
        errors.push(`${areaId}: required_strings_absent entries need file plus text or regex`);
        continue;
      }
      if (!pathExists(projectRoot, matcher.file)) {
        checked.strings_absent.push({ area: areaId, file: matcher.file, matcher: matcherLabel(matcher), ok: true });
        continue;
      }
      const ok = !matchText(readText(projectRoot, matcher.file), matcher);
      checked.strings_absent.push({ area: areaId, file: matcher.file, matcher: matcherLabel(matcher), ok });
      if (!ok) errors.push(`${areaId}: forbidden string is still present in ${matcher.file}: ${matcherLabel(matcher)}`);
    }

    if (decision === 'combine' && normalizeList(area.master_behaviors_preserved).length === 0) {
      warnings.push(`${areaId}: combine decision should list master_behaviors_preserved for reviewer traceability`);
    }
  }

  const status = errors.length > 0 ? 'fail' : 'pass';
  const report = {
    version: 1,
    generated_at: new Date().toISOString(),
    status,
    manifest_path: path.relative(projectRoot, absoluteManifestPath),
    merge_name: manifest.merge_name || '',
    target_branch: manifest.target_branch || '',
    feature_area_count: Array.isArray(manifest.feature_areas) ? manifest.feature_areas.length : 0,
    source_added_file_count: sourceAddedFiles.length,
    errors,
    warnings,
    checked,
  };

  if (reportPath) {
    const absoluteReportPath = path.resolve(projectRoot, reportPath);
    fs.mkdirSync(path.dirname(absoluteReportPath), { recursive: true });
    fs.writeFileSync(absoluteReportPath, JSON.stringify(report, null, 2));
    report.report_path = path.relative(projectRoot, absoluteReportPath);
  }

  logger.log(`[merge-adoption] ${status.toUpperCase()} ${report.merge_name || manifestPath}`);
  logger.log(`[merge-adoption] feature_areas=${report.feature_area_count} source_added_files=${report.source_added_file_count}`);
  for (const warning of warnings) logger.warn(`[merge-adoption] WARN ${warning}`);
  for (const error of errors) logger.error(`[merge-adoption] FAIL ${error}`);

  if (errors.length > 0) {
    throw new MergeAdoptionError('Merge adoption gate failed.', {
      code: 'MERGE_ADOPTION_FAILED',
      errors,
      warnings,
      report,
    });
  }

  return report;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    validateManifest(options);
  } catch (error) {
    if (error instanceof MergeAdoptionError) {
      console.error(`[merge-adoption] ${error.code}: ${error.message}`);
      if (error.report && error.report.report_path) {
        console.error(`[merge-adoption] Report: ${error.report.report_path}`);
      }
      process.exit(1);
    }
    throw error;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  ALLOWED_DECISIONS,
  ALLOWED_SEMANTIC_CONFLICT_STATUSES,
  MergeAdoptionError,
  parseArgs,
  validateManifest,
};
