import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

describe('POS catalog event transport contract', () => {
    test('protects the stream with POS view permission', () => {
        const routes = read('src/routes/pos.js');
        expect(routes).toContain("router.get('/catalog/events', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), posController.streamCatalogEvents);");
    });

    test('sends invalidation metadata only and subscribes by tenant', () => {
        const handlers = read('src/modules/pos/controllers/posHandlers.js');
        expect(handlers).toContain('subscribeCatalogChanges(tenantId');
        expect(handlers).toContain("writeCatalogEvent(res, 'pos.catalog.changed'");
        expect(handlers).toContain('reason: event?.reason');
        expect(handlers).toContain('emitted_at: event?.emitted_at');
        expect(handlers).not.toContain('item_ids: event?.item_ids');
    });
});
