import { afterAll, describe, expect, it } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import dbStore from '../src/utils/dbStore.js';
import { deliveryCompletionEvidenceStorage } from '../src/modules/pos/repositories/deliveryCompletionEvidenceStorage.js';

const tempRoots = [];

afterAll(async () => {
    await Promise.all(tempRoots.map((root) => fs.rm(root, { recursive: true, force: true })));
    delete process.env.DELIVERY_EVIDENCE_ROOT;
});

describe('delivery completion evidence private storage', () => {
    it('normalizes images and strips orientation/EXIF metadata', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'delivery-evidence-storage-'));
        tempRoots.push(root);
        process.env.DELIVERY_EVIDENCE_ROOT = root;
        const sourcePath = path.join(root, 'source.jpg');
        const source = await sharp({
            create: {
                width: 64,
                height: 64,
                channels: 3,
                background: { r: 20, g: 80, b: 140 }
            }
        })
            .withMetadata({ orientation: 6 })
            .jpeg()
            .toBuffer();
        await fs.writeFile(sourcePath, source);

        const stored = await dbStore.run({ tenantId: 'tenant-storage-test' }, () => (
            deliveryCompletionEvidenceStorage.store({ posTransactionId: 77, tempPath: sourcePath })
        ));
        const storedPath = path.join(root, stored.storage_key);
        const metadata = await sharp(storedPath).metadata();

        expect(stored.mime_type).toBe('image/webp');
        expect(metadata.format).toBe('webp');
        expect(metadata.orientation).toBeUndefined();
        expect(metadata.exif).toBeUndefined();

        await deliveryCompletionEvidenceStorage.remove(stored.storage_key);
    });
});
