'use strict';

const crypto = require('node:crypto');

const POS_DISCOUNT_RULES_TABLE = 'pos_discount_rules';
const SYSTEM_SETTINGS_TABLE = 'system_settings';
const LEGACY_DISCOUNT_SETTING_KEY = 'pos_discount_profiles';
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const DISCOUNT_TYPES = Object.freeze(['senior', 'pwd', 'employee', 'promo', 'manual', 'custom']);
const CANONICAL_DISCOUNT_TYPES = new Set(['senior', 'pwd', 'employee', 'promo', 'manual']);
const UNIQUE_KEY_INDEX = 'uq_pos_discount_rules_discount_key';
const AVAILABILITY_INDEX = 'idx_pos_discount_rules_enabled_approved';

const ADDITIVE_COLUMNS = Object.freeze([
    {
        name: 'discount_key',
        definition: "VARCHAR(80) NULL COMMENT 'Stable machine key for a configurable POS discount'"
    },
    {
        name: 'description',
        definition: "VARCHAR(500) NULL COMMENT 'Optional administrator-facing explanation of the discount'"
    },
    {
        name: 'is_approved',
        definition: "TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Administrator approval gate; separate from transaction authorization'"
    },
    {
        name: 'configuration_source',
        definition: "VARCHAR(40) NOT NULL DEFAULT 'governed' COMMENT 'Origin of the discount configuration'"
    },
    {
        name: 'configuration_version',
        definition: "INT NOT NULL DEFAULT 1 COMMENT 'Configuration revision used for future cache and audit invalidation'"
    }
]);

const quoteIdentifier = (identifier) => {
    const normalized = String(identifier || '').trim();
    if (!SAFE_IDENTIFIER_PATTERN.test(normalized)) {
        throw new Error(`Unsafe database identifier: ${identifier}`);
    }
    return `\`${normalized}\``;
};

const qualifiedTable = (databaseName, tableName) => (
    `${quoteIdentifier(databaseName)}.${quoteIdentifier(tableName)}`
);

const getCurrentDatabaseName = async (queryInterface) => {
    const [rows] = await queryInterface.sequelize.query('SELECT DATABASE() AS dbName');
    return rows?.[0]?.dbName || rows?.[0]?.db_name || null;
};

const tableExists = async (queryInterface, databaseName, tableName) => {
    const [rows] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
        { replacements: [databaseName, tableName] }
    );
    return Number(rows?.[0]?.count || 0) > 0;
};

const getColumnInfo = async (queryInterface, databaseName, tableName, columnName) => {
    const [rows] = await queryInterface.sequelize.query(
        `SELECT COLUMN_TYPE AS columnType, IS_NULLABLE AS isNullable
           FROM information_schema.columns
          WHERE table_schema = ? AND table_name = ? AND column_name = ?
          LIMIT 1`,
        { replacements: [databaseName, tableName, columnName] }
    );
    return rows?.[0] || null;
};

const indexExists = async (queryInterface, databaseName, tableName, indexName) => {
    const [rows] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) AS count
           FROM information_schema.statistics
          WHERE table_schema = ? AND table_name = ? AND index_name = ?`,
        { replacements: [databaseName, tableName, indexName] }
    );
    return Number(rows?.[0]?.count || 0) > 0;
};

const getTargetDatabaseNames = async (queryInterface) => {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return [];

    const databaseNames = [currentDatabaseName];
    if (await tableExists(queryInterface, currentDatabaseName, 'tenants')) {
        const [rows] = await queryInterface.sequelize.query(
            `SELECT DISTINCT db_name
               FROM ${qualifiedTable(currentDatabaseName, 'tenants')}
              WHERE status = 'active' AND db_name IS NOT NULL AND db_name <> ''`
        );

        for (const row of rows || []) {
            const databaseName = String(row?.db_name || '').trim();
            if (databaseName && SAFE_IDENTIFIER_PATTERN.test(databaseName)) {
                databaseNames.push(databaseName);
            }
        }
    }

    return [...new Set(databaseNames)];
};

const normalizeKey = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const slugifyName = (value) => normalizeKey(value).slice(0, 48);

const fitKeyWithSuffix = (base, suffix) => {
    const normalizedBase = normalizeKey(base) || 'discount';
    const normalizedSuffix = normalizeKey(suffix) || 'rule';
    const maxBaseLength = Math.max(1, 80 - normalizedSuffix.length - 1);
    return `${normalizedBase.slice(0, maxBaseLength)}-${normalizedSuffix}`;
};

const generatedKeyForRule = (rule) => {
    const type = normalizeKey(rule?.type);
    if (CANONICAL_DISCOUNT_TYPES.has(type)) return type;

    const prefix = type && type !== 'custom' ? `custom-${type}` : 'custom';
    const name = slugifyName(rule?.name) || 'discount';
    return fitKeyWithSuffix(`${prefix}-${name}`, rule?.id);
};

const updateDiscountKey = async (queryInterface, databaseName, ruleId, discountKey) => {
    await queryInterface.sequelize.query(
        `UPDATE ${qualifiedTable(databaseName, POS_DISCOUNT_RULES_TABLE)}
            SET ${quoteIdentifier('discount_key')} = ?
          WHERE ${quoteIdentifier('id')} = ?`,
        { replacements: [discountKey, ruleId] }
    );
};

const backfillDiscountKeys = async (queryInterface, databaseName) => {
    const table = qualifiedTable(databaseName, POS_DISCOUNT_RULES_TABLE);
    const [rows] = await queryInterface.sequelize.query(
        `SELECT id, name, type, discount_key
           FROM ${table}
          ORDER BY id ASC`
    );

    const usedKeys = new Set();
    const pendingRows = [];

    for (const row of rows || []) {
        const normalizedKey = normalizeKey(row?.discount_key);
        if (normalizedKey && !usedKeys.has(normalizedKey)) {
            usedKeys.add(normalizedKey);
            if (String(row.discount_key || '') !== normalizedKey) {
                await updateDiscountKey(queryInterface, databaseName, row.id, normalizedKey);
            }
            continue;
        }
        pendingRows.push(row);
    }

    for (const row of pendingRows) {
        const baseKey = generatedKeyForRule(row);
        let candidate = baseKey;
        let attempt = 0;
        while (usedKeys.has(candidate)) {
            attempt += 1;
            candidate = fitKeyWithSuffix(baseKey, `${row.id}-${attempt}`);
        }
        usedKeys.add(candidate);
        await updateDiscountKey(queryInterface, databaseName, row.id, candidate);
    }
};

const ensureDiscountRuleColumns = async (queryInterface, databaseName) => {
    for (const column of ADDITIVE_COLUMNS) {
        if (await getColumnInfo(queryInterface, databaseName, POS_DISCOUNT_RULES_TABLE, column.name)) continue;

        await queryInterface.sequelize.query(
            `ALTER TABLE ${qualifiedTable(databaseName, POS_DISCOUNT_RULES_TABLE)}
               ADD COLUMN ${quoteIdentifier(column.name)} ${column.definition}`
        );
    }
};

const ensureDiscountTypeEnum = async (queryInterface, databaseName) => {
    const column = await getColumnInfo(queryInterface, databaseName, POS_DISCOUNT_RULES_TABLE, 'type');
    if (!column) {
        throw new Error(`${databaseName}.${POS_DISCOUNT_RULES_TABLE} is missing the type column`);
    }

    const columnType = String(column.columnType || '').toLowerCase();
    const hasAllTypes = DISCOUNT_TYPES.every((type) => columnType.includes(`'${type}'`));
    if (hasAllTypes) return;

    await queryInterface.sequelize.query(
        `ALTER TABLE ${qualifiedTable(databaseName, POS_DISCOUNT_RULES_TABLE)}
          MODIFY COLUMN ${quoteIdentifier('type')} ENUM(${DISCOUNT_TYPES.map((type) => `'${type}'`).join(',')}) NOT NULL`
    );
};

const ensureDiscountDefaults = async (queryInterface, databaseName) => {
    const table = qualifiedTable(databaseName, POS_DISCOUNT_RULES_TABLE);
    await queryInterface.sequelize.query(
        `UPDATE ${table}
            SET ${quoteIdentifier('configuration_source')} = 'governed'
          WHERE ${quoteIdentifier('configuration_source')} IS NULL
             OR TRIM(${quoteIdentifier('configuration_source')}) = ''`
    );
    await queryInterface.sequelize.query(
        `UPDATE ${table}
            SET ${quoteIdentifier('configuration_version')} = 1
          WHERE ${quoteIdentifier('configuration_version')} IS NULL
             OR ${quoteIdentifier('configuration_version')} < 1`
    );
    await queryInterface.sequelize.query(
        `UPDATE ${table}
            SET ${quoteIdentifier('is_approved')} = 1
          WHERE ${quoteIdentifier('configuration_source')} = 'governed'
            AND ${quoteIdentifier('configuration_version')} = 1
            AND (${quoteIdentifier('is_approved')} IS NULL OR ${quoteIdentifier('is_approved')} = 0)`
    );
};

const ensureDiscountKeyNotNull = async (queryInterface, databaseName) => {
    const column = await getColumnInfo(queryInterface, databaseName, POS_DISCOUNT_RULES_TABLE, 'discount_key');
    if (!column || String(column.isNullable || '').toUpperCase() === 'NO') return;

    await queryInterface.sequelize.query(
        `ALTER TABLE ${qualifiedTable(databaseName, POS_DISCOUNT_RULES_TABLE)}
          MODIFY COLUMN ${quoteIdentifier('discount_key')} VARCHAR(80) NOT NULL
          COMMENT 'Stable machine key for a configurable POS discount'`
    );
};

const ensureDiscountIndexes = async (queryInterface, databaseName) => {
    const table = qualifiedTable(databaseName, POS_DISCOUNT_RULES_TABLE);
    const [duplicates] = await queryInterface.sequelize.query(
        `SELECT ${quoteIdentifier('discount_key')}, COUNT(*) AS duplicateCount
           FROM ${table}
          GROUP BY ${quoteIdentifier('discount_key')}
         HAVING COUNT(*) > 1`
    );
    if (duplicates?.length) {
        throw new Error(
            `Cannot create ${UNIQUE_KEY_INDEX} in ${databaseName}: duplicate discount keys remain`
        );
    }

    if (!(await indexExists(queryInterface, databaseName, POS_DISCOUNT_RULES_TABLE, UNIQUE_KEY_INDEX))) {
        await queryInterface.sequelize.query(
            `ALTER TABLE ${table}
             ADD UNIQUE INDEX ${quoteIdentifier(UNIQUE_KEY_INDEX)} (${quoteIdentifier('discount_key')})`
        );
    }

    if (!(await indexExists(queryInterface, databaseName, POS_DISCOUNT_RULES_TABLE, AVAILABILITY_INDEX))) {
        await queryInterface.sequelize.query(
            `ALTER TABLE ${table}
             ADD INDEX ${quoteIdentifier(AVAILABILITY_INDEX)} (${quoteIdentifier('is_active')}, ${quoteIdentifier('is_approved')})`
        );
    }
};

const parseLegacyProfiles = (rawValue) => {
    let profiles = rawValue;
    if (typeof profiles === 'string') {
        try {
            profiles = JSON.parse(profiles);
        } catch {
            return { profiles: [], skipped: 1 };
        }
    }
    if (!Array.isArray(profiles)) return { profiles: [], skipped: 0 };

    let skipped = 0;
    const normalizedProfiles = [];
    for (const profile of profiles) {
        const name = String(profile?.name || '').trim();
        const percentage = Number(profile?.percentage);
        if (!name || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
            skipped += 1;
            continue;
        }

        normalizedProfiles.push({
            name: name.slice(0, 100),
            rate: Math.round(percentage * 10000) / 10000,
            description: String(profile?.description || '').trim().slice(0, 500) || null,
            isActive: profile?.active !== false,
            isApproved: profile?.approved !== false
        });
    }

    return { profiles: normalizedProfiles, skipped };
};

const legacyDiscountKey = (profile, ordinal) => {
    const fingerprint = crypto
        .createHash('sha256')
        .update(`${profile.name.toLowerCase()}|${profile.rate.toFixed(4)}|${ordinal}`)
        .digest('hex')
        .slice(0, 16);
    const prefix = `legacy-${slugifyName(profile.name) || 'discount'}`;
    return fitKeyWithSuffix(prefix, fingerprint);
};

const migrateLegacyDiscountProfiles = async (queryInterface, databaseName) => {
    if (!(await tableExists(queryInterface, databaseName, SYSTEM_SETTINGS_TABLE))) return;

    const [settings] = await queryInterface.sequelize.query(
        `SELECT setting_value
           FROM ${qualifiedTable(databaseName, SYSTEM_SETTINGS_TABLE)}
          WHERE setting_key = ?
          LIMIT 1`,
        { replacements: [LEGACY_DISCOUNT_SETTING_KEY] }
    );
    if (!settings?.[0]) return;

    const { profiles, skipped } = parseLegacyProfiles(settings[0].setting_value);
    if (skipped > 0) {
        console.warn(
            `[configurable-discounts] Skipped ${skipped} invalid legacy discount profile(s) in ${databaseName}; the original setting was preserved.`
        );
    }
    if (profiles.length === 0) return;

    const table = qualifiedTable(databaseName, POS_DISCOUNT_RULES_TABLE);
    const [existingRows] = await queryInterface.sequelize.query(
        `SELECT discount_key, configuration_source
           FROM ${table}`
    );
    const existingKeys = new Map(
        (existingRows || [])
            .map((row) => [normalizeKey(row.discount_key), String(row.configuration_source || '')])
            .filter(([key]) => Boolean(key))
    );
    const ordinalByFingerprint = new Map();

    for (const profile of profiles) {
        const fingerprintBase = `${profile.name.toLowerCase()}|${profile.rate.toFixed(4)}`;
        const ordinal = ordinalByFingerprint.get(fingerprintBase) || 0;
        ordinalByFingerprint.set(fingerprintBase, ordinal + 1);
        const baseDiscountKey = legacyDiscountKey(profile, ordinal);
        if (existingKeys.get(baseDiscountKey) === 'legacy_profile') continue;

        let discountKey = baseDiscountKey;
        let attempt = 0;
        while (existingKeys.has(discountKey)) {
            attempt += 1;
            discountKey = fitKeyWithSuffix(baseDiscountKey, `${ordinal}-${attempt}`);
        }

        await queryInterface.sequelize.query(
            `INSERT INTO ${table}
                (discount_key, name, type, method, rate, description, is_vat_exempt,
                 requires_customer_id, requires_employee_id, requires_manager_approval,
                 max_discount_amount, is_active, is_approved, configuration_source,
                 configuration_version, created_at, updated_at)
             VALUES (?, ?, 'custom', 'percentage', ?, ?, 0, 0, 0, 0, NULL, ?, ?, 'legacy_profile', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            {
                replacements: [
                    discountKey,
                    profile.name,
                    profile.rate,
                    profile.description,
                    profile.isActive ? 1 : 0,
                    profile.isApproved ? 1 : 0
                ]
            }
        );
        existingKeys.set(discountKey, 'legacy_profile');
    }
};

const migrateDatabase = async (queryInterface, databaseName) => {
    if (!(await tableExists(queryInterface, databaseName, POS_DISCOUNT_RULES_TABLE))) return;

    await ensureDiscountRuleColumns(queryInterface, databaseName);
    await ensureDiscountTypeEnum(queryInterface, databaseName);
    await ensureDiscountDefaults(queryInterface, databaseName);
    await backfillDiscountKeys(queryInterface, databaseName);
    await ensureDiscountKeyNotNull(queryInterface, databaseName);
    await ensureDiscountIndexes(queryInterface, databaseName);
    await migrateLegacyDiscountProfiles(queryInterface, databaseName);
};

const assertNoCustomRulesBeforeDown = async (queryInterface, databaseNames) => {
    for (const databaseName of databaseNames) {
        if (!(await tableExists(queryInterface, databaseName, POS_DISCOUNT_RULES_TABLE))) continue;
        const [rows] = await queryInterface.sequelize.query(
            `SELECT COUNT(*) AS count
               FROM ${qualifiedTable(databaseName, POS_DISCOUNT_RULES_TABLE)}
              WHERE type = 'custom' OR configuration_source = 'legacy_profile'`
        );
        if (Number(rows?.[0]?.count || 0) > 0) {
            throw new Error(
                `Cannot roll back configurable POS discounts in ${databaseName}: custom or migrated discount rules exist`
            );
        }
    }
};

const removeIndexIfPresent = async (queryInterface, databaseName, indexName) => {
    if (!(await indexExists(queryInterface, databaseName, POS_DISCOUNT_RULES_TABLE, indexName))) return;
    await queryInterface.sequelize.query(
        `ALTER TABLE ${qualifiedTable(databaseName, POS_DISCOUNT_RULES_TABLE)} DROP INDEX ${quoteIdentifier(indexName)}`
    );
};

module.exports = {
    async up(queryInterface) {
        const databaseNames = await getTargetDatabaseNames(queryInterface);
        for (const databaseName of databaseNames) {
            await migrateDatabase(queryInterface, databaseName);
        }
    },

    async down(queryInterface) {
        const databaseNames = await getTargetDatabaseNames(queryInterface);
        await assertNoCustomRulesBeforeDown(queryInterface, databaseNames);

        for (const databaseName of databaseNames) {
            if (!(await tableExists(queryInterface, databaseName, POS_DISCOUNT_RULES_TABLE))) continue;

            await removeIndexIfPresent(queryInterface, databaseName, AVAILABILITY_INDEX);
            await removeIndexIfPresent(queryInterface, databaseName, UNIQUE_KEY_INDEX);

            const typeColumn = await getColumnInfo(queryInterface, databaseName, POS_DISCOUNT_RULES_TABLE, 'type');
            if (typeColumn && String(typeColumn.columnType || '').toLowerCase().includes("'custom'")) {
                await queryInterface.sequelize.query(
                    `ALTER TABLE ${qualifiedTable(databaseName, POS_DISCOUNT_RULES_TABLE)}
                      MODIFY COLUMN ${quoteIdentifier('type')} ENUM('senior','pwd','employee','promo','manual') NOT NULL`
                );
            }

            for (const column of [...ADDITIVE_COLUMNS].reverse()) {
                if (!(await getColumnInfo(queryInterface, databaseName, POS_DISCOUNT_RULES_TABLE, column.name))) continue;
                await queryInterface.sequelize.query(
                    `ALTER TABLE ${qualifiedTable(databaseName, POS_DISCOUNT_RULES_TABLE)}
                     DROP COLUMN ${quoteIdentifier(column.name)}`
                );
            }
        }
    }
};
