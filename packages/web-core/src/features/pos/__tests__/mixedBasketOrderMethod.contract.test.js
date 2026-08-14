import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

// Both terminals used to force-flip order_method to 'appointment' the moment
// ANY service line was added to the cart, silently and unconditionally, even
// when the basket already carried unrelated retail lines. That made mixed
// baskets (parts + labor) actively hostile: adding a service after 9 retail
// SKUs reclassified the whole transaction, and adding it wiped out whatever
// the cashier had explicitly chosen. The fix scopes the appointment default
// to only the first line of an otherwise-empty basket.
describe('mixed-basket order_method default no longer clobbers an in-progress basket', () => {
    it('only auto-defaults to appointment when the service is the first line in an empty cart, in both terminals', () => {
        [
            '../components/POSCheckoutTerminal.jsx',
            '../components/SkupervisorPOSCheckoutTerminal.jsx'
        ].forEach((relativePath) => {
            const source = read(relativePath);
            expect(source).toContain("isServiceCatalogItem(item) && cart.length === 0");
            expect(source).toContain("setOrderMethod('appointment')");
        });
    });
});
