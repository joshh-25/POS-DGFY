import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

describe('POS catalog realtime contract', () => {
    test('uses authenticated SSE invalidations and the normal catalog reload path', () => {
        const refresh = read('../utils/posCatalogRefresh.js');
        expect(refresh).toContain('subscribeToRemotePosCatalogUpdates');
        expect(refresh).toContain("Authorization: `Bearer ${accessToken}`");
        expect(refresh).toContain("'pos.catalog.changed'");
        expect(refresh).toContain('notifyPosCatalogUpdated();');
    });

    test('keeps terminal cart state independent of catalog refresh', () => {
        const catalogWorkflow = read('../hooks/usePosCatalogWorkflow.js');
        expect(catalogWorkflow).toContain('subscribeToRemotePosCatalogUpdates');
        expect(catalogWorkflow).toContain('refreshCatalogAfterInvalidation');
        expect(catalogWorkflow).toContain('loadCatalog();');
        expect(catalogWorkflow).not.toContain('setCart([]);\n            loadCatalog();');
    });
});
