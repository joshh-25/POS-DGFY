import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.resolve(__dirname, '../src/server.js');

describe('geo inventory worker startup contract', () => {
    it('starts and stops the geo inventory worker with the backend server lifecycle', () => {
        const serverSource = fs.readFileSync(serverPath, 'utf8');

        expect(serverSource).toContain("from './workers/geoInventoryWorker.js'");
        expect(serverSource).toMatch(/\bstartGeoInventoryWorker\(\);/);
        expect(serverSource).toMatch(/\bstopGeoInventoryWorker\(\);/);
    });
});
