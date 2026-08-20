import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// #776 (#713 regression). buildPublicStorefrontVouchers computed storefront_vouchers correctly the
// whole time -- the bug was that nothing downstream ever declared or forwarded the field, so it was
// silently dropped twice: once by Sequelize (undeclared model attribute), once by the response
// mapper (explicit field allowlist). A behavioral round trip through a live DB would catch this too,
// but this repo doesn't run DB-backed tests by default (see docs on the split), so this is a
// source-contract guard matching the existing precedent (geoInventoryWorkerSku.contract.test.js) --
// fast, DB-free, and fails loudly if either declaration is ever removed or renamed out from under
// the field again. The behavioral half (storefrontDiscoveryRepository.test.js's "carries
// storefront_vouchers through..." tests) covers the response-mapping layer with mocked models.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modelPath = path.resolve(__dirname, '../src/models/Landlord/StorefrontDiscoveryIndex.js');
const migrationPath = path.resolve(__dirname, '../../dgfy-migration-runner/migrations/20260820000002-add-storefront-vouchers-to-discovery-index.cjs');

describe('storefront_vouchers discovery-index persistence contract (#776)', () => {
    it('declares storefront_vouchers as a JSON attribute on the Landlord StorefrontDiscoveryIndex model', () => {
        const modelSource = fs.readFileSync(modelPath, 'utf8');
        expect(modelSource).toMatch(/storefront_vouchers:\s*\{\s*type:\s*DataTypes\.JSON/);
    });

    it('ships a migration adding storefront_discovery_index.storefront_vouchers', () => {
        expect(fs.existsSync(migrationPath)).toBe(true);
        const migrationSource = fs.readFileSync(migrationPath, 'utf8');
        expect(migrationSource).toContain("addColumn('storefront_discovery_index', 'storefront_vouchers'");
        expect(migrationSource).toContain("removeColumn('storefront_discovery_index', 'storefront_vouchers')");
    });
});
