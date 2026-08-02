import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { isAssetPathReferencedByOtherItems, safeDeleteReplacedImageAsset } from '../src/modules/shared/utils/imageCleanupService.js';

describe('imageCleanupService', () => {
    let tempDir;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cleanup-test-'));
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
