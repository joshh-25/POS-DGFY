import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Phase 242 (#1333, epic #1321). Modelled directly on
// storefrontVouchersDiscoveryIndexPersistence.contract.test.js -- the #713 regression guard, which
// is the exact failure class this column is exposed to: a value computed correctly but silently
// dropped because something downstream never declared or forwarded it. A behavioral round trip
// through a live DB would catch this too, but this repo doesn't run DB-backed tests by default, so
// this is a source-contract guard -- fast, DB-free, and fails loudly if any of these wiring points is
// ever removed or renamed out from under the field again.
//
// Also guards this phase's own two silent-wrong-but-green traps directly, as source contracts:
//   1. STOREFRONT_SETTING_KEYS must list both new settings keys, or they are never fetched.
//   2. LEGACY_SCHEMA_SAFE_ATTRIBUTES must NOT gain delivery_fee_mode -- that constant is the
//      missing-column FALLBACK attribute set; adding a brand-new column to it would make the
//      fallback path fail on exactly the legacy schema it exists to survive.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const modelPath = path.resolve(__dirname, '../src/models/Landlord/StorefrontDiscoveryIndex.js');
const migrationPath = path.resolve(__dirname, '../../dgfy-migration-runner/migrations/20260905000001-add-delivery-fee-mode-to-discovery-index.cjs');
const projectionPath = path.resolve(__dirname, '../src/services/storefrontDiscoveryIndexService.js');
const geoSearchRepositoryPath = path.resolve(__dirname, '../src/modules/geoSearch/repositories/geoSearchRepository.js');
const storefrontDiscoveryRepositoryPath = path.resolve(__dirname, '../src/modules/storefrontDiscovery/repositories/storefrontDiscoveryRepository.js');

describe('delivery_fee_mode discovery-index persistence contract (#1333)', () => {
    it('declares delivery_fee_mode as a STRING(32) attribute on the Landlord StorefrontDiscoveryIndex model', () => {
        const modelSource = fs.readFileSync(modelPath, 'utf8');
        expect(modelSource).toMatch(/delivery_fee_mode:\s*\{\s*type:\s*DataTypes\.STRING\(32\)/);
    });

    it('ships a migration adding storefront_discovery_index.delivery_fee_mode', () => {
        expect(fs.existsSync(migrationPath)).toBe(true);
        const migrationSource = fs.readFileSync(migrationPath, 'utf8');
        expect(migrationSource).toContain("addColumn('storefront_discovery_index', 'delivery_fee_mode'");
        expect(migrationSource).toContain("removeColumn('storefront_discovery_index', 'delivery_fee_mode')");
    });

    it('lists both store_delivery_fee_mode and store_delivery_fee_calc in STOREFRONT_SETTING_KEYS', () => {
        const projectionSource = fs.readFileSync(projectionPath, 'utf8');
        expect(projectionSource).toMatch(/STOREFRONT_SETTING_KEYS[\s\S]*?'store_delivery_fee_mode'[\s\S]*?\]\);/);
        expect(projectionSource).toMatch(/STOREFRONT_SETTING_KEYS[\s\S]*?'store_delivery_fee_calc'[\s\S]*?\]\);/);
    });

    it('parses store_delivery_fee_calc as JSON before it reaches resolveAdvertisedDeliveryFromPrice', () => {
        const projectionSource = fs.readFileSync(projectionPath, 'utf8');
        expect(projectionSource).toContain('store_delivery_fee_calc: parseJsonObject(settings.store_delivery_fee_calc)');
    });

    it('geoSearchRepository selects and maps sdi.delivery_fee_mode', () => {
        const source = fs.readFileSync(geoSearchRepositoryPath, 'utf8');
        expect(source).toContain('sdi.delivery_fee_mode');
        expect(source).toContain('delivery_fee_mode: r.delivery_fee_mode');
    });

    it('storefrontDiscoveryRepository maps delivery_fee_mode in the response mapper, and does NOT add it to the legacy-fallback attribute allowlist', () => {
        const source = fs.readFileSync(storefrontDiscoveryRepositoryPath, 'utf8');
        expect(source).toContain('delivery_fee_mode: plain.delivery_fee_mode');

        const legacyAttributesMatch = source.match(/LEGACY_SCHEMA_SAFE_ATTRIBUTES = Object\.freeze\(\[([\s\S]*?)\]\);/);
        expect(legacyAttributesMatch).not.toBeNull();
        expect(legacyAttributesMatch[1]).not.toContain('delivery_fee_mode');
    });
});
