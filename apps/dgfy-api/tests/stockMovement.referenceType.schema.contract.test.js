import fs from 'fs';
import path from 'path';
import { describe, expect, it } from '@jest/globals';
import defaultDb from '../src/models/index.js';

const posParkedSaleReferenceTypeMigrationSource = fs.readFileSync(
    path.resolve(process.cwd(), '../dgfy-migration-runner/migrations/20261007000001-add-pos-parked-sale-reference-type.cjs'),
    'utf8'
);

// Every reference_type literal the app code actually writes to stock_movements, grepped across
// apps/dgfy-api/src — keep in sync with the writer call sites, not the other way around. This
// test exists because #2321 was exactly this list drifting out of sync with the Sequelize ENUM:
// apps/dgfy-api/src/modules/pos/usecases/parkedSaleUseCases.js wrote 'POS_PARKED_SALE' for years
// before the model/migration ever declared it, and nothing caught the drift pre-production.
const REFERENCE_TYPE_LITERALS_WRITTEN_BY_APP_CODE = [
    'PO',
    'JO',
    'MANUAL',
    'RETURN',
    'DO',
    'POS',
    'POS_PARKED_SALE'
];

describe('stock_movements.reference_type schema contract', () => {
    it('declares every reference_type literal the application writes', () => {
        const declaredValues = defaultDb.StockMovement.rawAttributes.reference_type.values;
        for (const literal of REFERENCE_TYPE_LITERALS_WRITTEN_BY_APP_CODE) {
            expect(declaredValues).toContain(literal);
        }
    });

    it('adds POS_PARKED_SALE via an additive migration with a safe, scoped down path (#2321)', () => {
        expect(posParkedSaleReferenceTypeMigrationSource).toContain("'POS_PARKED_SALE'");
        expect(posParkedSaleReferenceTypeMigrationSource).toContain(
            "Sequelize.ENUM('PO', 'JO', 'MANUAL', 'RETURN', 'DO', 'POS', 'POS_PARKED_SALE')"
        );
        expect(posParkedSaleReferenceTypeMigrationSource).toContain(
            "UPDATE stock_movements SET reference_type = 'POS' WHERE reference_type = 'POS_PARKED_SALE'"
        );
    });
});
