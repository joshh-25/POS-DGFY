import { readFileSync } from 'node:fs';
import { describe, expect, it } from '@jest/globals';

const repositorySource = readFileSync(
    new URL('../src/modules/pos/repositories/posRepository.js', import.meta.url),
    'utf8'
);

describe('POS catalog category contract', () => {
    it('returns the saved category mapping needed by the POS item editor', () => {
        expect(repositorySource).toContain("'folder_id'");
        expect(repositorySource).toContain("'product_folder'");
        expect(repositorySource).toContain('const buildItemFolderInclude = () => {');
        expect(repositorySource).toContain("as: 'folder'");
        expect(repositorySource).toContain('...buildItemFolderInclude(),');
    });
});
