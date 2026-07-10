import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Sequelize } from 'sequelize';
import {
    createSourceConnection,
    createTargetConnection,
    createMetaConnection,
    createBusinessTargetConnection
} from '../src/config/db.js';
import { computeFileChecksum } from '../src/metadata/checksum.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureConfig = {
    runtimeMode: 'development',
    sourceDb: { host: 'localhost', port: 3306, user: 'source_user', password: 'source_pass', name: 'legacy_ims' },
    targetDb: { host: 'localhost', port: 3306, user: 'target_user', password: 'target_pass', name: 'dgfy_landlord' },
    metaDb: { name: 'dgfy_migration_meta' },
    reportDir: './reports',
    actor: 'operator@dgfy.ph'
};

describe('DB connection factories', () => {
    test('createSourceConnection, createTargetConnection, createMetaConnection, createBusinessTargetConnection are exported functions', () => {
        expect(typeof createSourceConnection).toBe('function');
        expect(typeof createTargetConnection).toBe('function');
        expect(typeof createMetaConnection).toBe('function');
        expect(typeof createBusinessTargetConnection).toBe('function');
    });

    test('each factory returns a Sequelize instance without throwing or opening a socket', () => {
        const source = createSourceConnection(fixtureConfig);
        const target = createTargetConnection(fixtureConfig);
        const meta = createMetaConnection(fixtureConfig);
        const business = createBusinessTargetConnection(fixtureConfig, 'dgfy_business_alpha');

        expect(source).toBeInstanceOf(Sequelize);
        expect(target).toBeInstanceOf(Sequelize);
        expect(meta).toBeInstanceOf(Sequelize);
        expect(business).toBeInstanceOf(Sequelize);
    });

    test('createBusinessTargetConnection uses targetDb credentials but the given business database name', () => {
        const business = createBusinessTargetConnection(fixtureConfig, 'dgfy_business_alpha');

        expect(business.config.database).toBe('dgfy_business_alpha');
        expect(business.config.host).toBe(fixtureConfig.targetDb.host);
        expect(business.config.username).toBe(fixtureConfig.targetDb.user);
    });

    test('db.js source has zero top-level (module-scope) new Sequelize( calls', () => {
        const source = readFileSync(join(__dirname, '..', 'src', 'config', 'db.js'), 'utf8');
        const codeLines = source
            .split('\n')
            .filter((line) => {
                const trimmed = line.trim();
                return !trimmed.startsWith('*') && !trimmed.startsWith('//') && !trimmed.startsWith('/**');
            });

        let depth = 0;
        const topLevelCalls = [];
        codeLines.forEach((line) => {
            if (depth === 0 && line.includes('new Sequelize(')) {
                topLevelCalls.push(line);
            }
            for (const char of line) {
                if (char === '{') depth += 1;
                if (char === '}') depth -= 1;
            }
        });

        expect(topLevelCalls).toEqual([]);

        const totalOccurrences = (codeLines.join('\n').match(/new Sequelize\(/g) || []).length;
        expect(totalOccurrences).toBe(4);
    });
});

describe('computeFileChecksum', () => {
    const fixtureA = join(__dirname, 'fixtures', 'checksum-a.txt');
    const fixtureB = join(__dirname, 'fixtures', 'checksum-b.txt');

    test('returns a stable 16-character lowercase hex string across repeated calls', async () => {
        const first = await computeFileChecksum(fixtureA);
        const second = await computeFileChecksum(fixtureA);

        expect(first).toMatch(/^[0-9a-f]{16}$/);
        expect(first).toBe(second);
    });

    test('returns a different checksum for a fixture file with different content', async () => {
        const checksumA = await computeFileChecksum(fixtureA);
        const checksumB = await computeFileChecksum(fixtureB);

        expect(checksumA).not.toBe(checksumB);
    });
});
