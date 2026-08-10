import dotenv from 'dotenv';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import sequelize from '../src/config/database.js';
import { auditRequiredIndexes } from '../src/services/schemaIndexAuditService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const normalizeIdentifier = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'idx';

const buildIndexName = (table, columns) => {
    const base = normalizeIdentifier(`idx_req_${table}_${columns.join('_')}`);
    if (base.length <= 64) return base;
    const digest = crypto
        .createHash('sha1')
        .update(`${table}|${columns.join(',')}`)
        .digest('hex')
        .slice(0, 8);
    const truncated = base.slice(0, 55);
    return `${truncated}_${digest}`;
};

const quoteIdentifier = (value) => `\`${String(value).replace(/`/g, '``')}\``;

const addIndex = async ({ database, table, columns }) => {
    const indexName = buildIndexName(table, columns);
    const columnSql = columns.map((column) => quoteIdentifier(column)).join(', ');

    await sequelize.query(
        `ALTER TABLE ${quoteIdentifier(database)}.${quoteIdentifier(table)}
         ADD INDEX ${quoteIdentifier(indexName)} (${columnSql})`
    );

    return indexName;
};

const repair = async () => {
    try {
        const initial = await auditRequiredIndexes({ sequelizeInstance: sequelize });
        console.log(
            `[RepairRequiredIndexes] initial_status=${initial.status} missing=${initial.missingCount} tenants_checked=${initial.tenantsChecked}`
        );

        if (initial.missingCount === 0) {
            console.log('[RepairRequiredIndexes] no repair needed.');
            process.exit(0);
        }

        const actionable = [];
        const skipped = [];

        initial.missingIndexes.forEach((entry) => {
            const reason = String(entry.reason || '');
            if (reason === 'table_missing' || reason === 'database_audit_failed' || reason === 'table_stats_query_failed') {
                skipped.push(entry);
                return;
            }
            actionable.push(entry);
        });

        for (const entry of actionable) {
            try {
                const createdIndex = await addIndex({
                    database: entry.database,
                    table: entry.table,
                    columns: entry.columns
                });
                console.log(
                    `[RepairRequiredIndexes] added db=${entry.database} table=${entry.table} cols=${entry.columns.join(',')} index=${createdIndex}`
                );
            } catch (error) {
                const msg = String(error.message || '');
                if (msg.includes('Duplicate key name') || msg.includes('Duplicate index')) {
                    console.log(
                        `[RepairRequiredIndexes] already_exists db=${entry.database} table=${entry.table} cols=${entry.columns.join(',')}`
                    );
                    continue;
                }
                console.log(
                    `[RepairRequiredIndexes] failed db=${entry.database} table=${entry.table} cols=${entry.columns.join(',')} error=${error.message}`
                );
            }
        }

        if (skipped.length > 0) {
            console.log('[RepairRequiredIndexes] skipped_non_actionable_entries:');
            skipped.forEach((entry) => {
                console.log(
                    ` - db=${entry.database} table=${entry.table} type=${entry.type} columns=${entry.columns.join(',')} reason=${entry.reason}`
                );
            });
        }

        const finalResult = await auditRequiredIndexes({ sequelizeInstance: sequelize });
        console.log(
            `[RepairRequiredIndexes] final_status=${finalResult.status} missing=${finalResult.missingCount} tenants_checked=${finalResult.tenantsChecked}`
        );

        if (finalResult.missingCount > 0) {
            console.log('[RepairRequiredIndexes] remaining_missing_indexes:');
            finalResult.missingIndexes.forEach((entry) => {
                console.log(
                    ` - db=${entry.database} table=${entry.table} type=${entry.type} columns=${entry.columns.join(',')} reason=${entry.reason}`
                );
            });
        }

        process.exit(finalResult.status === 'healthy' ? 0 : 1);
    } catch (error) {
        console.error('[RepairRequiredIndexes] fatal:', error.message);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
};

repair();
