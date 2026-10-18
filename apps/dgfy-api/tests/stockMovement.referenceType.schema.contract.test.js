import fs from 'fs';
import path from 'path';
import { describe, expect, it } from '@jest/globals';
import defaultDb from '../src/models/index.js';
import { REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS } from '../scripts/sync-tenant-schemas.js';

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

    it('keeps Sequelize ENUMs and tenant schema registry contracts in sync', () => {
        const modelsByTable = new Map(Object.values(defaultDb)
            .filter((model) => model?.rawAttributes && typeof model.getTableName === 'function')
            .map((model) => [model.getTableName(), model]));
        const comparableContracts = [];

        for (const [tableName, columns] of Object.entries(REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS)) {
            const model = modelsByTable.get(tableName);
            if (!model) continue;

            for (const [columnName, contract] of Object.entries(columns)) {
                const modelValues = model.rawAttributes[columnName]?.values;
                if (!Array.isArray(modelValues)) continue;

                comparableContracts.push({
                    column: `${tableName}.${columnName}`,
                    modelValues,
                    registryValues: contract.enumValues
                });
            }
        }

        expect(comparableContracts.length).toBeGreaterThan(0);
        for (const { column, modelValues, registryValues } of comparableContracts) {
            expect({ [column]: [...modelValues].sort() }).toEqual({
                [column]: [...registryValues].sort()
            });
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
