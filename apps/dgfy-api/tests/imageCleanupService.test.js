import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// #1022: this file never mocked dbStore, so isAssetPathReferencedByOtherItems's
// `dbStore.get('StorefrontCatalogOverride')` fell through to dbStore.js's own documented
// fallback -- the real, unmocked Sequelize model -- and its findAll() hit the real DB. That was
// silently masked whenever a reachable test DB happened to have zero StorefrontCatalogOverride
// rows for this asset path; with DB_HOST/DB_PORT deliberately pinned unreachable (the fast tier's
// default, #1015), findAll() throws instead, and the function's own fail-safe catch treats the
// asset as referenced -- exactly backwards from what both tests below assert. Mirrors the
// dbStore-mock shape already used by tests/auditRepository.test.js.
const findAll = jest.fn();
const storefrontCatalogOverrideModel = { findAll };

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        get: jest.fn((modelName) => (modelName === 'StorefrontCatalogOverride' ? storefrontCatalogOverrideModel : null))
    }
}));

const { isAssetPathReferencedByOtherItems, safeDeleteReplacedImageAsset } = await import('../src/modules/shared/utils/imageCleanupService.js');

describe('imageCleanupService', () => {
    let tempDir;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cleanup-test-'));
        findAll.mockReset().mockResolvedValue([]);
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    test('returns false when checking empty or unreferenced asset path with mock DB', async () => {
        const isReferenced = await isAssetPathReferencedByOtherItems({
            storedPath: 'storefront-catalog/item-123/large.png',
            excludeItemId: 123
        });
        expect(isReferenced).toBe(false);
    });

    test('safeDeleteReplacedImageAsset handles missing files gracefully without throwing', async () => {
        const result = await safeDeleteReplacedImageAsset({
            uploadsRoot: tempDir,
            storedPath: 'storefront-catalog/nonexistent/large.png',
            itemId: 99
        });
        expect(result).toBe(true);
    });
});
