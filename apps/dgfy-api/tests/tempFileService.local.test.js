import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  deleteTemporaryFile,
  getTempFileStorageMode,
  getTemporaryFile,
  storeTemporaryFile
} from '../src/services/tempFileService.js';

const originalEnv = { ...process.env };
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempDir = path.resolve(__dirname, '../storage/temp-ai-exports');

let createdFileIds = [];

beforeEach(() => {
  process.env = {
    ...originalEnv,
    HOSTING_PROFILE: 'shared',
    REDIS_URL: '',
    TEMP_FILE_STORAGE: 'local',
    AUTH_BLACKLIST_FAILURE_MODE: 'fail_open'
  };
  createdFileIds = [];
});

afterEach(async () => {
  for (const fileId of createdFileIds) {
    await deleteTemporaryFile(fileId);
  }
  process.env = originalEnv;
});

describe('tempFileService local storage', () => {
  it('stores, retrieves, and deletes AI temp exports without Redis', async () => {
    expect(getTempFileStorageMode()).toBe('local');

    const result = await storeTemporaryFile('sku,name\nA-1,Widget', 'items.csv', 42);
    createdFileIds.push(result.fileId);

    const localFilePath = path.join(tempDir, `ai-export-${result.fileId}.json`);
    await expect(fs.access(localFilePath)).resolves.toBeUndefined();

    const file = await getTemporaryFile(result.fileId, 42);
    expect(file).toEqual(expect.objectContaining({
      content: 'sku,name\nA-1,Widget',
      filename: 'items.csv',
      contentType: 'text/csv'
    }));

    await deleteTemporaryFile(result.fileId);
    const deletedFile = await getTemporaryFile(result.fileId, 42);
    expect(deletedFile).toBeNull();
    createdFileIds = [];
  });

  it('denies access when the requesting user does not own the export', async () => {
    const result = await storeTemporaryFile('sku,name\nA-2,Gadget', 'private.csv', 42);
    createdFileIds.push(result.fileId);

    await expect(getTemporaryFile(result.fileId, 99)).resolves.toBeNull();
    await expect(getTemporaryFile(result.fileId, 42)).resolves.toEqual(expect.objectContaining({
      content: 'sku,name\nA-2,Gadget',
      filename: 'private.csv'
    }));
  });
});
