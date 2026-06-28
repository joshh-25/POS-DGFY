#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

class MasterPromotionAuditError extends Error {
  constructor(code, message, report) {
    super(message);
    this.name = 'MasterPromotionAuditError';
    this.code = code;
    this.report = report;
  }
}

function parseArgs(argv) {
  const options = {
    projectRoot: process.cwd(),
    targetSha: process.env.RELEASE_TARGET_SHA || process.env.GITHUB_SHA || '',
    prEvidencePath: process.env.PROMOTION_PR_EVIDENCE || '',
    reportPath: process.env.MASTER_PROMOTION_AUDIT_REPORT || '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--project-root') {
      options.projectRoot = path.resolve(argv[++index] || '');
    } else if (arg === '--target-sha') {
      options.targetSha = argv[++index] || '';
    } else if (arg === '--pr-evidence') {
      options.prEvidencePath = argv[++index] || '';
    } else if (arg === '--report') {
      options.reportPath = argv[++index] || '';
    } else {
      throw new MasterPromotionAuditError('INVALID_ARGS', `Unknown argument: ${arg}`);
    }
  }
  if (!/^[0-9a-f]{40}$/.test(options.targetSha)) throw new MasterPromotionAuditError('INVALID_ARGS', 'A lowercase 40-character --target-sha is required');
  if (!options.prEvidencePath) throw new MasterPromotionAuditError('INVALID_ARGS', '--pr-evidence is required');
  return options;
}

function git(projectRoot, args) {
  const result = spawnSync('git', args, { cwd: projectRoot, encoding: 'utf8', shell: false });
  if (result.status !== 0) throw new MasterPromotionAuditError('GIT_FAILED', (result.stderr || result.stdout).trim());
  return result.stdout.trim();
}

function auditMasterPromotion(options, logger = console) {
  const evidencePath = path.resolve(options.projectRoot, options.prEvidencePath);
  if (!fs.existsSync(evidencePath)) throw new MasterPromotionAuditError('PR_EVIDENCE_MISSING', `PR evidence is missing: ${options.prEvidencePath}`);
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  const parents = git(options.projectRoot, ['show', '-s', '--format=%P', options.targetSha]).split(/\s+/).filter(Boolean);
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });

  add('master.commit.is_two_parent_merge', parents.length === 2, `parent_count=${parents.length}`);
  add('promotion.pr.exists', Number.isInteger(evidence.number) && evidence.number > 0, `pr=${evidence.number || '<missing>'}`);
  add('promotion.pr.merged', evidence.merged === true, `merged=${evidence.merged}`);
  add('promotion.pr.refs', evidence.base === 'master' && evidence.head === 'staging', `${evidence.head || '<missing>'} -> ${evidence.base || '<missing>'}`);
  add('promotion.pr.merge_sha', evidence.merge_commit_sha === options.targetSha, `merge_commit_sha=${evidence.merge_commit_sha || '<missing>'}`);
  add('promotion.pr.head_parent', parents.length === 2 && evidence.head_sha === parents[1], `head_sha=${evidence.head_sha || '<missing>'}; second_parent=${parents[1] || '<missing>'}`);
  add('promotion.authorization.tag_present', evidence.promotion_authorization?.status === 'present' && Boolean(evidence.promotion_authorization?.tag), evidence.promotion_authorization?.tag || '<missing>');
  add('promotion.inventory.reviewed', evidence.inventory?.review_status === 'reviewed' && /^[0-9a-f]{64}$/.test(evidence.inventory?.sha256 || ''), evidence.inventory?.sha256 || '<missing>');

  const failed = checks.filter((check) => !check.ok);
  const report = {
    schema: 'sku-master-promotion-audit/v1',
    generated_at: new Date().toISOString(),
    target_sha: options.targetSha,
    status: failed.length === 0 ? 'pass' : 'fail',
    governed_promotion: failed.length === 0,
    pr_number: evidence.number || null,
    checks,
  };
  if (options.reportPath) {
    const output = path.resolve(options.projectRoot, options.reportPath);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  }
  for (const check of checks) logger.log(`[master-promotion-audit] ${check.ok ? 'PASS' : 'FAIL'} ${check.name}: ${check.detail}`);
  if (failed.length > 0) throw new MasterPromotionAuditError('UNGOVERNED_MASTER_UPDATE', 'Master update lacks governed promotion evidence', report);
  return report;
}

function main() {
  try {
    auditMasterPromotion(parseArgs(process.argv.slice(2)));
  } catch (error) {
    if (error instanceof MasterPromotionAuditError) {
      console.error(`[master-promotion-audit] ${error.code}: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

if (require.main === module) main();

module.exports = { MasterPromotionAuditError, parseArgs, auditMasterPromotion };
