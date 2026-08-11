'use strict';

const MIGRATION_TAG = '20260421000002_shift_location_remediation_v1';

const normalizeTableName = (table) => {
    if (!table) return '';
    if (typeof table === 'string') return table;
    if (typeof table === 'object') return table.tableName || table.TABLE_NAME || '';
    return '';
};

const tableExists = async (queryInterface, tableName) => {
    const tables = await queryInterface.showAllTables();
    return tables.map(normalizeTableName).includes(tableName);
};

const parsePositiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

// Keep historical migrations self-contained. Migration execution must not
// depend on application source paths that can move during monorepo extraction.
const RESOLUTION_SOURCE = Object.freeze({
    TRANSACTION_UNIQUE_LOCATION: 'transaction_unique_location',
    TERMINAL_HOME_LOCATION: 'terminal_home_location',
    TENANT_PRIMARY_LOCATION: 'tenant_primary_location',
    ACTIVE_LOCATION_FALLBACK: 'active_location_fallback',
    NO_RESOLUTION: 'no_resolution'
});

const LOW_CONFIDENCE_RESOLUTION_SOURCES = new Set([
    RESOLUTION_SOURCE.ACTIVE_LOCATION_FALLBACK,
    RESOLUTION_SOURCE.NO_RESOLUTION
]);

const resolveShiftLocationCandidate = ({
    txDistinctLocationCount = 0,
    txLocationId = null,
    terminalHomeLocationId = null,
    tenantPrimaryLocationId = null,
    activeLocationFallbackId = null
} = {}) => {
    const txDistinctCount = Number.parseInt(txDistinctLocationCount, 10) || 0;
    const resolvedTxLocationId = parsePositiveInt(txLocationId);
    if (txDistinctCount === 1 && resolvedTxLocationId) {
        return {
            resolvedLocationId: resolvedTxLocationId,
            resolutionSource: RESOLUTION_SOURCE.TRANSACTION_UNIQUE_LOCATION,
            resolutionReason: 'TX_UNIQUE_LOCATION'
        };
    }

    const resolvedTerminalHomeLocationId = parsePositiveInt(terminalHomeLocationId);
    if (resolvedTerminalHomeLocationId) {
        return {
            resolvedLocationId: resolvedTerminalHomeLocationId,
            resolutionSource: RESOLUTION_SOURCE.TERMINAL_HOME_LOCATION,
            resolutionReason: 'TERMINAL_HOME_LOCATION'
        };
    }

    const resolvedTenantPrimaryLocationId = parsePositiveInt(tenantPrimaryLocationId);
    if (resolvedTenantPrimaryLocationId) {
        return {
            resolvedLocationId: resolvedTenantPrimaryLocationId,
            resolutionSource: RESOLUTION_SOURCE.TENANT_PRIMARY_LOCATION,
            resolutionReason: 'TENANT_PRIMARY_LOCATION'
        };
    }

    const resolvedActiveLocationFallbackId = parsePositiveInt(activeLocationFallbackId);
    if (resolvedActiveLocationFallbackId) {
        return {
            resolvedLocationId: resolvedActiveLocationFallbackId,
            resolutionSource: RESOLUTION_SOURCE.ACTIVE_LOCATION_FALLBACK,
            resolutionReason: 'ACTIVE_LOCATION_FALLBACK'
        };
    }

    return {
        resolvedLocationId: null,
        resolutionSource: RESOLUTION_SOURCE.NO_RESOLUTION,
        resolutionReason: 'NO_RESOLUTION'
    };
};

const parseJsonLoosely = (rawValue) => {
    if (rawValue == null) return null;
    if (typeof rawValue === 'object') return rawValue;
    if (typeof rawValue !== 'string') return null;

    try {
        const parsed = JSON.parse(rawValue);
        if (typeof parsed === 'string') {
            try {
                return JSON.parse(parsed);
            } catch {
                return parsed;
            }
        }
        return parsed;
    } catch {
        return null;
    }
};

const buildTerminalHomeLocationMap = (rawRegistry) => {
    const parsedRegistry = parseJsonLoosely(rawRegistry);
    if (!Array.isArray(parsedRegistry)) return new Map();

    const terminalHomeMap = new Map();
    parsedRegistry.forEach((entry) => {
        const terminalId = String(entry?.terminal_id || '')
            .trim()
            .toUpperCase();
        const locationId = parsePositiveInt(entry?.location_id);
        const isActive = entry?.is_active !== false;
        if (!terminalId || !isActive || !locationId) return;
        if (!terminalHomeMap.has(terminalId)) {
            terminalHomeMap.set(terminalId, locationId);
        }
    });
    return terminalHomeMap;
};

module.exports = {
    async up(queryInterface, Sequelize) {
        const hasTerminalShifts = await tableExists(queryInterface, 'pos_terminal_shifts');
        if (!hasTerminalShifts) return;
        const hasSystemSettings = await tableExists(queryInterface, 'system_settings');
        const hasTenantLocations = await tableExists(queryInterface, 'tenant_locations');

        if (!(await tableExists(queryInterface, 'pos_shift_location_backfill_audit'))) {
            await queryInterface.createTable('pos_shift_location_backfill_audit', {
                pos_shift_location_backfill_audit_id: {
                    type: Sequelize.INTEGER,
                    autoIncrement: true,
                    primaryKey: true
                },
                shift_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    references: {
                        model: 'pos_terminal_shifts',
                        key: 'pos_terminal_shift_id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'CASCADE'
                },
                previous_location_id: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: {
                        model: 'tenant_locations',
                        key: 'location_id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'SET NULL'
                },
                resolved_location_id: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: {
                        model: 'tenant_locations',
                        key: 'location_id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'SET NULL'
                },
                resolution_source: {
                    type: Sequelize.STRING(64),
                    allowNull: false
                },
                resolution_reason: {
                    type: Sequelize.STRING(128),
                    allowNull: false
                },
                migration_tag: {
                    type: Sequelize.STRING(96),
                    allowNull: false
                },
                created_at: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                }
            });

            await queryInterface.addIndex('pos_shift_location_backfill_audit', ['shift_id'], {
                name: 'idx_pos_shift_location_backfill_audit_shift_id'
            });
            await queryInterface.addIndex('pos_shift_location_backfill_audit', ['migration_tag'], {
                name: 'idx_pos_shift_location_backfill_audit_migration_tag'
            });
            await queryInterface.addIndex('pos_shift_location_backfill_audit', ['resolution_source'], {
                name: 'idx_pos_shift_location_backfill_audit_source'
            });
        }

        const lowConfidenceSources = LOW_CONFIDENCE_RESOLUTION_SOURCES;

        const [registrySettingRows] = hasSystemSettings
            ? await queryInterface.sequelize.query(`
                SELECT setting_value
                FROM system_settings
                WHERE setting_key = 'pos_terminal_registry'
                ORDER BY setting_id DESC
                LIMIT 1
            `)
            : [[]];
        const rawRegistry = Array.isArray(registrySettingRows) && registrySettingRows[0]
            ? registrySettingRows[0].setting_value
            : null;
        const terminalHomeMap = buildTerminalHomeLocationMap(rawRegistry);

        const [locationFallbackRows] = hasTenantLocations
            ? await queryInterface.sequelize.query(`
                SELECT
                    MIN(CASE WHEN is_active = 1 AND is_primary_storefront = 1 THEN location_id END) AS tenant_primary_location_id,
                    MIN(CASE WHEN is_active = 1 THEN location_id END) AS active_location_fallback_id
                FROM tenant_locations
            `)
            : [[{}]];
        const tenantPrimaryLocationId = parsePositiveInt(locationFallbackRows?.[0]?.tenant_primary_location_id);
        const activeLocationFallbackId = parsePositiveInt(locationFallbackRows?.[0]?.active_location_fallback_id);

        const [shiftRows] = await queryInterface.sequelize.query(`
            SELECT
                s.pos_terminal_shift_id AS shift_id,
                s.terminal_id,
                s.location_id AS current_location_id,
                tx.inferred_location_id,
                tx.distinct_location_count
            FROM pos_terminal_shifts s
            LEFT JOIN (
                SELECT
                    shift_id,
                    MIN(location_id) AS inferred_location_id,
                    COUNT(DISTINCT location_id) AS distinct_location_count
                FROM pos_transactions
                WHERE shift_id IS NOT NULL
                  AND location_id IS NOT NULL
                GROUP BY shift_id
            ) tx ON tx.shift_id = s.pos_terminal_shift_id
        `);

        const now = new Date();
        const auditRows = [];
        const updates = [];

        for (const shiftRow of shiftRows) {
            const shiftId = parsePositiveInt(shiftRow?.shift_id);
            if (!shiftId) continue;

            const currentLocationId = parsePositiveInt(shiftRow?.current_location_id);
            const txDistinctLocationCount = Number.parseInt(shiftRow?.distinct_location_count, 10) || 0;
            const txLocationId = parsePositiveInt(shiftRow?.inferred_location_id);
            const terminalId = String(shiftRow?.terminal_id || '').trim().toUpperCase();
            const terminalHomeLocationId = terminalId ? parsePositiveInt(terminalHomeMap.get(terminalId)) : null;

            const resolution = resolveShiftLocationCandidate({
                txDistinctLocationCount,
                txLocationId,
                terminalHomeLocationId,
                tenantPrimaryLocationId,
                activeLocationFallbackId
            });
            const resolvedLocationId = parsePositiveInt(resolution?.resolvedLocationId);
            const resolutionSource = String(resolution?.resolutionSource || 'no_resolution');
            const resolutionReason = String(resolution?.resolutionReason || 'UNSPECIFIED');

            const isAuthoritativeTx = txDistinctLocationCount === 1 && txLocationId;
            const matchesLegacyFallback = currentLocationId
                && (
                    (tenantPrimaryLocationId && currentLocationId === tenantPrimaryLocationId)
                    || (activeLocationFallbackId && currentLocationId === activeLocationFallbackId)
                );
            const shouldTreatAsLowConfidence = !isAuthoritativeTx && (
                !currentLocationId
                || matchesLegacyFallback
                || lowConfidenceSources.has(resolutionSource)
            );

            const shouldUpdate = Boolean(
                resolvedLocationId
                && currentLocationId !== resolvedLocationId
                && (
                    !currentLocationId
                    || (isAuthoritativeTx && !currentLocationId)
                    || shouldTreatAsLowConfidence
                )
            );

            if (shouldUpdate) {
                updates.push({
                    shiftId,
                    resolvedLocationId
                });
            }

            auditRows.push({
                shift_id: shiftId,
                previous_location_id: currentLocationId,
                resolved_location_id: resolvedLocationId,
                resolution_source: resolutionSource,
                resolution_reason: resolutionReason,
                migration_tag: MIGRATION_TAG,
                created_at: now
            });
        }

        if (updates.length > 0) {
            for (const update of updates) {
                await queryInterface.sequelize.query(`
                    UPDATE pos_terminal_shifts
                    SET location_id = :resolvedLocationId, updated_at = CURRENT_TIMESTAMP
                    WHERE pos_terminal_shift_id = :shiftId
                `, {
                    replacements: {
                        shiftId: update.shiftId,
                        resolvedLocationId: update.resolvedLocationId
                    }
                });
            }
        }

        if (auditRows.length > 0) {
            const chunkSize = 1000;
            for (let index = 0; index < auditRows.length; index += chunkSize) {
                const chunk = auditRows.slice(index, index + chunkSize);
                await queryInterface.bulkInsert('pos_shift_location_backfill_audit', chunk);
            }
        }
    },

    async down(queryInterface) {
        if (await tableExists(queryInterface, 'pos_shift_location_backfill_audit')) {
            await queryInterface.dropTable('pos_shift_location_backfill_audit');
        }
    }
};
