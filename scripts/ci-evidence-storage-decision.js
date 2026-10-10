#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function listFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    }
  };
  visit(root);
  return files;
}

async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function inspectSource(sourcePath) {
  try {
    if (!fs.existsSync(sourcePath)) return { source_status: 'missing', size_bytes: '', source_sha256: '' };
    const stat = fs.statSync(sourcePath);
    if (!stat.isFile() && !stat.isDirectory()) return { source_status: 'missing', size_bytes: '', source_sha256: '' };
    fs.accessSync(sourcePath, fs.constants.R_OK);
    if (stat.isFile()) {
      return { source_status: 'ready', size_bytes: String(stat.size), source_sha256: await hashFile(sourcePath) };
    }

    const files = listFiles(sourcePath);
    if (files.length === 0) return { source_status: 'missing', size_bytes: '', source_sha256: '' };
    const digest = crypto.createHash('sha256');
    let size = 0;
    for (const file of files) {
      fs.accessSync(file, fs.constants.R_OK);
      const relative = path.relative(sourcePath, file).split(path.sep).join('/');
      const fileStat = fs.statSync(file);
      size += fileStat.size;
      digest.update(relative);
      digest.update('\0');
      digest.update(await hashFile(file));
      digest.update('\n');
    }
    return { source_status: 'ready', size_bytes: String(size), source_sha256: digest.digest('hex') };
  } catch {
    return { source_status: 'missing', size_bytes: '', source_sha256: '' };
  }
}

function decideStorage({ sourceStatus, githubOutcome, githubArtifactId, githubArtifactDigest, s3Outcome, s3Status }) {
  if (sourceStatus !== 'ready') return { storage_status: 'missing', backend: 'missing' };
  if (githubOutcome === 'success' && githubArtifactId && githubArtifactDigest) {
    return { storage_status: 'github', backend: 'github' };
  }
  if (githubOutcome === 'failure' && s3Outcome === 'success' && s3Status === 'verified') {
    return { storage_status: 's3-fallback', backend: 's3' };
  }
  return { storage_status: 'failed', backend: 'none' };
}

function writeOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  const safeValue = String(value ?? '').replace(/[\r\n]/g, ' ');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${safeValue}\n`);
}

function appendSummary(lines) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
}

function record(env = process.env) {
  const result = decideStorage({
    sourceStatus: env.SOURCE_STATUS,
    githubOutcome: env.GITHUB_OUTCOME,
    githubArtifactId: env.GITHUB_ARTIFACT_ID,
    githubArtifactDigest: env.GITHUB_ARTIFACT_DIGEST,
    s3Outcome: env.S3_OUTCOME,
    s3Status: env.S3_STATUS,
  });
  const ref = result.backend === 'github' ? env.GITHUB_ARTIFACT_URL : result.backend === 's3' ? env.S3_URI : '';
  const size = result.backend === 's3' ? env.S3_SIZE_BYTES : env.SOURCE_SIZE_BYTES;
  const sha = result.backend === 's3' ? env.S3_SOURCE_SHA256 : env.SOURCE_SHA256;
  const lines = [
    `### Evidence storage: ${env.ARTIFACT_NAME || 'artifact'}`,
    '',
    `- Result: **${result.storage_status}** (backend: ${result.backend}).`,
    `- Source run: ${env.GITHUB_RUN_ID || 'unknown'} attempt ${env.GITHUB_RUN_ATTEMPT || 'unknown'}; commit: ${env.SOURCE_COMMIT_SHA || 'unknown'}.`,
    `- Size: ${size || 'unknown'} bytes; source SHA-256: ${sha || 'unknown'}.`,
    `- GitHub Artifacts (${env.GITHUB_ARTIFACT_NAME || 'unnamed'}): ${env.GITHUB_OUTCOME || 'not run'}${env.GITHUB_ARTIFACT_ID ? `; ID ${env.GITHUB_ARTIFACT_ID}` : ''}${env.GITHUB_ARTIFACT_DIGEST ? `; digest ${env.GITHUB_ARTIFACT_DIGEST}` : ''}.`,
    `- S3 fallback: ${env.S3_OUTCOME || 'not run'}${env.S3_STATUS ? ` (${env.S3_STATUS})` : ''}.`,
  ];
  if (result.backend === 'github') {
    lines.push(`- GitHub artifact URL: ${env.GITHUB_ARTIFACT_URL || 'unavailable'}.`);
    lines.push(`- Retrieval: \`gh run download ${env.GITHUB_RUN_ID} -n ${env.GITHUB_ARTIFACT_NAME}\` (requires repository read access).`);
    lines.push(`- Retention: ${env.RETENTION_DAYS} days.`);
  } else if (result.backend === 's3') {
    lines.push(`- S3 object URI: ${env.S3_URI || 'unavailable'}.`);
    lines.push(`- S3 source SHA-256: ${env.S3_SOURCE_SHA256 || 'unknown'}; direct readback: ${env.S3_DIRECT_SHA256 || 'unknown'}; presigned readback: ${env.S3_PRESIGNED_SHA256 || 'unknown'} (HTTP ${env.S3_PRESIGNED_HTTP_STATUS || 'unknown'}).`);
    lines.push(`- Retrieval: \`aws s3 cp '${env.S3_URI || '<object-uri>'}' ./evidence --endpoint-url "$ARTIFACT_S3_ENDPOINT"\`${env.S3_PRESIGNED_URL && env.S3_STATUS === 'verified' ? `; verified 48-hour bearer URL: ${env.S3_PRESIGNED_URL}` : ''}.`);
    lines.push('- S3 object lifecycle follows the configured bucket policy.');
  } else if (result.storage_status === 'failed') {
    lines.push(`- Both storage attempts failed: GitHub=${env.GITHUB_OUTCOME || 'unknown'}; S3=${env.S3_OUTCOME || 'unknown'} (${env.S3_STATUS || 'no verified result'}).`);
    lines.push('- No retrieval location is available.');
  } else {
    lines.push('- Evidence source is missing or unreadable; no storage attempt ran, matching the existing missing-file warning behavior.');
  }

  if (result.storage_status === 's3-fallback') console.log('::warning::GitHub artifact upload failed; evidence was stored using the verified S3 fallback.');
  if (result.storage_status === 'failed') console.log('::error::Evidence storage failed: GitHub Artifacts and S3 fallback did not store the evidence.');
  if (result.storage_status === 'missing') console.log('::warning::Evidence source is missing or unreadable; no artifact storage was attempted.');
  for (const [key, value] of Object.entries({ ...result, artifact_ref: ref, size_bytes: size || '', source_sha256: sha || '' })) writeOutput(key, value);
  appendSummary(lines);
  return result;
}

async function main() {
  const [mode, sourcePath] = process.argv.slice(2);
  if (mode === 'inspect') {
    const result = await inspectSource(process.env.EVIDENCE_PATH || sourcePath || '');
    for (const [key, value] of Object.entries(result)) writeOutput(key, value);
    if (result.source_status === 'missing') console.log('::warning::Evidence source is missing or unreadable; uploads are skipped.');
    return;
  }
  if (mode === 'record') return record();
  throw new Error('Usage: ci-evidence-storage-decision.js <inspect|record> [path]');
}

if (require.main === module) main().catch((error) => {
  console.error(`::error::Could not record evidence storage state: ${error.message}`);
  process.exitCode = 1;
});

module.exports = { decideStorage, inspectSource, record };
