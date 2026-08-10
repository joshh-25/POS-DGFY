import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TENANT_LOCATION_REFERENCE_SOURCES } from '../src/modules/tenantLocations/repositories/tenantLocationReferenceSources.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modelsIndexPath = path.resolve(__dirname, '../src/models/index.js');

const extractTenantLocationAssociations = () => {
    const source = fs.readFileSync(modelsIndexPath, 'utf8');
    const associations = new Map();
    const pattern = /(\w+)\.belongsTo\(\s*TenantLocation\s*,\s*\{([\s\S]*?)\}\s*\)/g;
    let match = pattern.exec(source);
    while (match) {
        const [, modelName, optionsBody] = match;
        const foreignKey = /foreignKey:\s*['"]([^'"]+)['"]/.exec(optionsBody)?.[1];
        const associationName = /as:\s*['"]([^'"]+)['"]/.exec(optionsBody)?.[1];
        if (foreignKey && associationName) {
            associations.set(`${modelName}.${associationName}`, foreignKey);
        }
        match = pattern.exec(source);
    }
    return associations;
};

const collectWhereKeys = (value, keys = new Set()) => {
    if (!value || typeof value !== 'object') return keys;

    for (const key of Object.keys(value)) {
        keys.add(key);
        collectWhereKeys(value[key], keys);
    }

    for (const symbol of Object.getOwnPropertySymbols(value)) {
        collectWhereKeys(value[symbol], keys);
    }

    if (Array.isArray(value)) {
        value.forEach((entry) => collectWhereKeys(entry, keys));
    }

    return keys;
};

const guardedAssociations = () => {
    const associations = new Map();
    TENANT_LOCATION_REFERENCE_SOURCES.forEach((source) => {
        const names = String(source.association || '')
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean);
        expect(names).toHaveLength(source.foreignKeys.length);
        names.forEach((name, index) => {
            associations.set(name, source.foreignKeys[index]);
        });
    });
    return associations;
};

describe('tenant location permanent-delete reference coverage', () => {
    it('covers every direct TenantLocation model association and foreign key in the delete guard manifest', () => {
        const modelAssociations = extractTenantLocationAssociations();
        const manifestAssociations = guardedAssociations();

        expect([...modelAssociations.keys()].sort()).toEqual([...manifestAssociations.keys()].sort());
        expect(Object.fromEntries([...modelAssociations.entries()].sort())).toEqual(
            Object.fromEntries([...manifestAssociations.entries()].sort())
        );
    });

    it('keeps each manifest source where-clause aligned to its declared foreign keys', () => {
        TENANT_LOCATION_REFERENCE_SOURCES.forEach((source) => {
            const whereKeys = collectWhereKeys(source.where('__LOCATION_ID__'));

            source.foreignKeys.forEach((foreignKey) => {
                expect(whereKeys.has(foreignKey)).toBe(true);
            });
        });
    });
});
