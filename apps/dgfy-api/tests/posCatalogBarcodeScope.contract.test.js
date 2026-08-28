import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryPath = path.resolve(__dirname, '../src/modules/pos/repositories/posRepository.js');

describe('POS catalog barcode contract', () => {
  it('exposes only barcodes that the POS scanner can resolve', () => {
    const repository = fs.readFileSync(repositoryPath, 'utf8');

    expect(repository).toContain("attributes: ['item_barcode_id', 'item_id', 'code', 'source', 'scope', 'is_primary']");
    expect(repository).toContain("isBarcodeScopeAllowedForSurface(row.scope, 'pos')");
  });
});
