import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLegacyFeedbackLine } from '../src/modules/feedback/usecases/feedbackSubmissionMapper.js';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const defaultFeedbackLog = path.join(apiRoot, 'logs/user_feedback.log');

export const importLegacyFeedbackLog = async ({ file = defaultFeedbackLog, apply = false, repository }) => {
  const content = await fs.readFile(file, 'utf8');
  const lines = content.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const report = { file, mode: apply ? 'apply' : 'dry-run', total: 0, parsed: 0, malformed: [], inserted: 0, duplicateSkipped: 0 };
  const seen = new Set();
  const batch = [];

  const flush = async () => {
    if (!batch.length) return;
    const hashes = batch.map((row) => row.legacy_source_hash);
    const existing = await repository.existingLegacyHashes(hashes);
    report.duplicateSkipped += existing.size;
    const pending = batch.filter((row) => !existing.has(row.legacy_source_hash));
    if (apply) {
      const inserted = await repository.importLegacy(pending);
      report.inserted += inserted;
      report.duplicateSkipped += pending.length - inserted;
    } else {
      report.inserted += pending.length; // projected inserts; dry-run never writes.
    }
    batch.length = 0;
  };

  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    report.total += 1;
    try {
      const row = parseLegacyFeedbackLine(line);
      report.parsed += 1;
      if (seen.has(row.legacy_source_hash)) {
        report.duplicateSkipped += 1;
      } else {
        seen.add(row.legacy_source_hash);
        batch.push(row);
        if (batch.length >= 500) await flush();
      }
    } catch (error) {
      report.malformed.push({ line: index + 1, reason: error.message });
    }
  }
  await flush();
  return report;
};

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf('--file');
  if (args.some((arg) => !['--file', '--apply'].includes(arg) && (fileIndex < 0 || args[fileIndex + 1] !== arg)) ||
      (fileIndex >= 0 && (!args[fileIndex + 1] || args[fileIndex + 1].startsWith('--')))) {
    console.error('Usage: node scripts/import-legacy-feedback-log.js [--file PATH] [--apply]');
    process.exitCode = 2;
  } else {
    try {
      const { feedbackRepository } = await import('../src/modules/feedback/repositories/feedbackRepository.js');
      const { sequelize } = await import('../src/models/index.js');
      try {
        const report = await importLegacyFeedbackLog({
          file: fileIndex < 0 ? defaultFeedbackLog : path.resolve(args[fileIndex + 1]),
          apply: args.includes('--apply'),
          repository: feedbackRepository
        });
        console.log(JSON.stringify(report, null, 2));
        if (report.malformed.length) process.exitCode = 1;
      } finally {
        await sequelize.close();
      }
    } catch (error) {
      console.error('Feedback import failed:', error);
      process.exitCode = 1;
    }
  }
}
