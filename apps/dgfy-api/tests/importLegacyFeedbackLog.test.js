import { jest } from '@jest/globals';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { importLegacyFeedbackLog } from '../scripts/import-legacy-feedback-log.js';

it('dry-runs, reports malformed lines, and applies without duplicate inserts', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'feedback-import-'));
  const file = path.join(directory, 'feedback.log');
  const valid = JSON.stringify({ timestamp: '2026-10-01T00:00:00Z', type: 'bug', description: 'Lost text' });
  await fs.writeFile(file, `${valid}\n{bad\n${valid}\n`);
  const hashes = new Set();
  const repository = {
    existingLegacyHashes: jest.fn(async (values) => new Set(values.filter((value) => hashes.has(value)))),
    importLegacy: jest.fn(async (rows) => {
      for (const row of rows) hashes.add(row.legacy_source_hash);
      return rows.length;
    })
  };
  try {
    const dry = await importLegacyFeedbackLog({ file, repository });
    expect(dry).toEqual(expect.objectContaining({ mode: 'dry-run', total: 3, parsed: 2, inserted: 1, duplicateSkipped: 1 }));
    expect(dry.malformed).toEqual([expect.objectContaining({ line: 2 })]);
    expect(repository.importLegacy).not.toHaveBeenCalled();
    const apply = await importLegacyFeedbackLog({ file, repository, apply: true });
    expect(apply.inserted).toBe(1);
    const again = await importLegacyFeedbackLog({ file, repository, apply: true });
    expect(again.inserted).toBe(0);
    expect(again.duplicateSkipped).toBe(2);
    expect(await fs.readFile(file, 'utf8')).toBe(`${valid}\n{bad\n${valid}\n`);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
