'use strict';

const TABLES = Object.freeze({
  USERS: 'users',
  TENANT_LOCATIONS: 'tenant_locations',
  USER_LOCATION_GRANTS: 'user_location_grants'
});

const hasTable = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  const normalized = (tables || []).map((entry) => {
    if (typeof entry === 'string') return entry;
    if (entry?.tableName) return entry.tableName;
    return '';
  });
  return normalized.includes(tableName);
};

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const hasUsers = await hasTable(queryInterface, TABLES.USERS);
      const hasLocations = await hasTable(queryInterface, TABLES.TENANT_LOCATIONS);
      const hasGrants = await hasTable(queryInterface, TABLES.USER_LOCATION_GRANTS);

      if (!hasUsers || !hasLocations || !hasGrants) {
        await transaction.commit();
        return;
      }

      // Bootstrap grants so existing active users keep access when multi-location grant enforcement is enabled.
      await queryInterface.sequelize.query(
        `INSERT INTO ${TABLES.USER_LOCATION_GRANTS} (user_id, location_id, created_by, created_at)
         SELECT u.user_id, l.location_id, NULL, NOW()
         FROM ${TABLES.USERS} u
         INNER JOIN ${TABLES.TENANT_LOCATIONS} l
           ON l.is_active = 1
         LEFT JOIN ${TABLES.USER_LOCATION_GRANTS} g
           ON g.user_id = u.user_id
          AND g.location_id = l.location_id
         WHERE g.user_location_grant_id IS NULL
           AND COALESCE(u.is_active, 1) = 1
           AND u.deleted_at IS NULL`,
        { transaction }
      );

      await transaction.commit();
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      throw error;
    }
  },

  async down() {
    // Intentionally non-destructive: this migration seeds operational access rows.
    // Rollback strategy is feature-flag based; seeded rows are retained for auditability.
  }
};
