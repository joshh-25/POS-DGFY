import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workerPath = path.resolve(__dirname, '../src/workers/geoInventoryWorker.js');
const modelPath = path.resolve(__dirname, '../src/models/Landlord/GeoStoreItem.js');

describe('geo inventory SKU persistence contract', () => {
    it('persists tenant supplied sku_code from inventory push payloads', () => {
        const workerSource = fs.readFileSync(workerPath, 'utf8');
        const modelSource = fs.readFileSync(modelPath, 'utf8');

        expect(modelSource).toContain('sku_code');
        expect(workerSource).toContain('(tenant_id, location_id, item_id, sku_code, price');
        expect(workerSource).toContain('sku_code      = VALUES(sku_code)');
        expect(workerSource).toContain('skuCode: item.sku_code || null');
    });
});
