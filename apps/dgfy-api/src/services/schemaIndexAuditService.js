import sequelize from '../config/database.js';
import { REQUIRED_INDEX_CONTRACT } from '../config/requiredIndexContract.js';

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_AUDIT_MODE = 'standard';
const TEST_TENANT_DB_PREFIX = 'test_tenant_';

const normalizeIdentifier = (value) => String(value || '').trim().toLowerCase();

const parsePositiveInt = (value, fallback) => {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseBoolean = (value, fallback = false) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
    }
    return fallback;
};

const normalizeAuditMode = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (['local', 'test', 'standard'].includes(normalized)) {
        return normalized;
    }
    return DEFAULT_AUDIT_MODE;
};

const withTimeout = async (promise, timeoutMs, label) => {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        clearTimeout(timeoutId);
    }
};

const toIndexColumnsMap = (rows) => {
    const indexMap = new Map();
    rows.forEach((row) => {
        const indexName = normalizeIdentifier(row.INDEX_NAME);
        const columnName = normalizeIdentifier(row.COLUMN_NAME);
        const seq = parseInt(row.SEQ_IN_INDEX, 10);
        if (!indexName || !columnName || !Number.isFinite(seq)) return;
        if (!indexMap.has(indexName)) {
            indexMap.set(indexName, []);
        }
        const columns = indexMap.get(indexName);
        columns[seq - 1] = columnName;
    });
    return indexMap;
};

const missingSingleIndex = (database, table, column, reason = 'missing_leftmost_index') => ({
    database,
    table,
    type: 'single',
    columns: [column],
    reason
});

const missingCompositeIndex = (database, table, columns, reason = 'missing_exact_composite_index') => ({
    database,
    table,
    type: 'composite',
    columns,
    reason
});

const getCurrentDatabase = async (sequelizeInstance) => {
    const [rows] = await sequelizeInstance.query('SELECT DATABASE() AS db_name');
    return normalizeIdentifier(rows?.[0]?.db_name || process.env.DB_NAME);
};

export const resolveAuditDatabases = async (sequelizeInstance) => {
    const currentDb = await getCurrentDatabase(sequelizeInstance);

    try {
        const [tenantTableRows] = await sequelizeInstance.query("SHOW TABLES LIKE 'tenants'");
        if (!Array.isArray(tenantTableRows) || tenantTableRows.length === 0) {
            return {
                databases: currentDb ? [currentDb] : [],
                source: 'current_db_fallback'
            };
        }

        const [tenantRows] = await sequelizeInstance.query(
            "SELECT db_name FROM tenants WHERE status = 'active' AND db_name IS NOT NULL AND db_name <> ''"
        );

        const databases = [...new Set((tenantRows || [])
            .map(row => normalizeIdentifier(row.db_name))
            .filter(Boolean))];

        if (databases.length === 0) {
            return {
                databases: currentDb ? [currentDb] : [],
                source: 'current_db_fallback'
            };
        }

        return {
            databases,
            source: 'active_tenants'
        };
    } catch (error) {
        return {
            databases: currentDb ? [currentDb] : [],
            source: 'current_db_fallback',
            warning: error.message
        };
    }
};

const checkTableIndexes = async (sequelizeInstance, databaseName, tableName) => {
    const [rows] = await sequelizeInstance.query(
        `SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
         ORDER BY INDEX_NAME ASC, SEQ_IN_INDEX ASC`,
        {
            replacements: [databaseName, tableName]
        }
    );

    return rows || [];
};

const tableExists = async (sequelizeInstance, databaseName, tableName) => {
    const [rows] = await sequelizeInstance.query(
        `SELECT TABLE_NAME
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
         LIMIT 1`,
        {
            replacements: [databaseName, tableName]
        }
    );
    return Array.isArray(rows) && rows.length > 0;
};

const evaluateTableContract = ({
    databaseName,
    tableName,
    tableContract,
    statsRows,
    tableMissing
}) => {
    const missing = [];
    const normalizedSingles = (tableContract.single || []).map(normalizeIdentifier);
    const normalizedComposites = (tableContract.composite || []).map(cols => cols.map(normalizeIdentifier));
    const indexMap = toIndexColumnsMap(statsRows);

    normalizedSingles.forEach((column) => {
        const hasLeftmostIndex = statsRows.some(row =>
            normalizeIdentifier(row.COLUMN_NAME) === column && parseInt(row.SEQ_IN_INDEX, 10) === 1
        );
        if (!hasLeftmostIndex) {
            missing.push(
                missingSingleIndex(
                    databaseName,
                    tableName,
                    column,
                    tableMissing ? 'table_missing' : 'missing_leftmost_index'
                )
            );
        }
    });

    normalizedComposites.forEach((columns) => {
        const hasExactComposite = [...indexMap.values()].some(indexColumns => {
            if (indexColumns.length !== columns.length) return false;
            return columns.every((column, idx) => normalizeIdentifier(indexColumns[idx]) === column);
        });

        if (!hasExactComposite) {
            missing.push(
                missingCompositeIndex(
                    databaseName,
                    tableName,
                    columns,
                    tableMissing ? 'table_missing' : 'missing_exact_composite_index'
                )
            );
        }
    });

    return missing;
};

export const summarizeMissingIndexesForHealth = (missingIndexes = [], maxItems = 20) => {
    return missingIndexes.slice(0, maxItems).map((entry) => ({
        database: entry.database,
        table: entry.table,
        columns: entry.columns.join(','),
        type: entry.type
    }));
};

export const applyAuditDatabaseFilters = ({
    databases = [],
    auditMode = DEFAULT_AUDIT_MODE,
    excludeTestTenantDatabases = false
} = {}) => {
    const normalizedAuditMode = normalizeAuditMode(auditMode);
    const shouldApplyTestTenantExclusion = parseBoolean(excludeTestTenantDatabases, false)
        && ['local', 'test'].includes(normalizedAuditMode);

    if (!shouldApplyTestTenantExclusion) {
        return {
            selectedDatabases: databases,
            excludedDatabases: []
        };
    }

    const selectedDatabases = [];
    const excludedDatabases = [];

    databases.forEach((databaseName) => {
        if (String(databaseName || '').startsWith(TEST_TENANT_DB_PREFIX)) {
            excludedDatabases.push(databaseName);
            return;
        }
        selectedDatabases.push(databaseName);
    });

    return {
        selectedDatabases,
        excludedDatabases
    };
};

export const auditRequiredIndexes = async ({
    sequelizeInstance = sequelize,
    contract = REQUIRED_INDEX_CONTRACT,
    timeoutMs = parsePositiveInt(process.env.SCHEMA_INDEX_AUDIT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    databases = null,
    auditMode = normalizeAuditMode(process.env.SCHEMA_INDEX_AUDIT_MODE),
    excludeTestTenantDatabases = parseBoolean(process.env.SCHEMA_INDEX_AUDIT_EXCLUDE_TEST_TENANTS, false)
} = {}) => {
    const startedAt = Date.now();
    const errors = [];
    const missingIndexes = [];

    let resolvedDatabases;
    let source;

    if (Array.isArray(databases) && databases.length > 0) {
        resolvedDatabases = [...new Set(databases.map(normalizeIdentifier).filter(Boolean))];
        source = 'provided_databases';
    } else {
        const discovered = await resolveAuditDatabases(sequelizeInstance);
        resolvedDatabases = discovered.databases;
        source = discovered.source;
        if (discovered.warning) {
            errors.push({
                scope: 'database_discovery',
                message: discovered.warning
            });
        }
    }

    if (!Array.isArray(resolvedDatabases) || resolvedDatabases.length === 0) {
        errors.push({
            scope: 'database_discovery',
            message: 'No target databases resolved for schema index audit.'
        });
        resolvedDatabases = [];
    }

    const filterResult = applyAuditDatabaseFilters({
        databases: resolvedDatabases,
        auditMode,
        excludeTestTenantDatabases
    });
    resolvedDatabases = filterResult.selectedDatabases;
    const excludedDatabases = filterResult.excludedDatabases;

    const contractEntries = Object.entries(contract);

    for (const databaseName of resolvedDatabases) {
        try {
            await withTimeout(
                (async () => {
                    for (const [tableName, tableContract] of contractEntries) {
                        try {
                            const statsRows = await checkTableIndexes(
                                sequelizeInstance,
                                databaseName,
                                tableName
                            );

                            let isTableMissing = false;
                            if (statsRows.length === 0) {
                                isTableMissing = !(await tableExists(
                                    sequelizeInstance,
                                    databaseName,
                                    tableName
                                ));
                            }

                            missingIndexes.push(...evaluateTableContract({
                                databaseName,
                                tableName,
                                tableContract,
                                statsRows,
                                tableMissing: isTableMissing
                            }));
                        } catch (tableError) {
                            errors.push({
                                scope: 'table_check',
                                database: databaseName,
                                table: tableName,
                                message: tableError.message
                            });

                            (tableContract.single || []).forEach((column) => {
                                missingIndexes.push(
                                    missingSingleIndex(
                                        databaseName,
                                        tableName,
                                        normalizeIdentifier(column),
                                        'table_stats_query_failed'
                                    )
                                );
                            });

                            (tableContract.composite || []).forEach((columns) => {
                                missingIndexes.push(
                                    missingCompositeIndex(
                                        databaseName,
                                        tableName,
                                        columns.map(normalizeIdentifier),
                                        'table_stats_query_failed'
                                    )
                                );
                            });
                        }
                    }
                })(),
                timeoutMs,
                `Schema index audit for ${databaseName}`
            );
        } catch (dbError) {
            errors.push({
                scope: 'database_check',
                database: databaseName,
                message: dbError.message
            });

            contractEntries.forEach(([tableName, tableContract]) => {
                (tableContract.single || []).forEach((column) => {
                    missingIndexes.push(
                        missingSingleIndex(
                            databaseName,
                            tableName,
                            normalizeIdentifier(column),
                            'database_audit_failed'
                        )
                    );
                });
                (tableContract.composite || []).forEach((columns) => {
                    missingIndexes.push(
                        missingCompositeIndex(
                            databaseName,
                            tableName,
                            columns.map(normalizeIdentifier),
                            'database_audit_failed'
                        )
                    );
                });
            });
        }
    }

    const uniqueMissingIndexes = [];
    const seen = new Set();

    missingIndexes.forEach((entry) => {
        const key = `${entry.database}|${entry.table}|${entry.type}|${entry.columns.join(',')}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueMissingIndexes.push(entry);
        }
    });

    const checkedAt = new Date().toISOString();
    const durationMs = Date.now() - startedAt;
    const status = uniqueMissingIndexes.length === 0 && errors.length === 0 ? 'healthy' : 'degraded';

    return {
        status,
        checkedAt,
        durationMs,
        auditMode: normalizeAuditMode(auditMode),
        source,
        databasesChecked: resolvedDatabases,
        excludedDatabases,
        tenantsChecked: resolvedDatabases.length,
        missingCount: uniqueMissingIndexes.length,
        missingIndexes: uniqueMissingIndexes,
        missingForHealth: summarizeMissingIndexesForHealth(uniqueMissingIndexes),
        errors
    };
};
