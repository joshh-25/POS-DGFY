'use strict';

const TABLE_NAME = 'company_registration_uploads';
const COLUMN_NAME = 'application_id';

const isSafeColumnType = (value) => (
  typeof value === 'string'
  && /^[a-z]+(?:\(\d+(?:,\d+)?\))?(?:\s+[a-z]+)*$/i.test(value)
);

const isSafeMetadataIdentifier = (value) => (
  typeof value === 'string' && /^[A-Za-z0-9_]+$/.test(value)
);

module.exports = {
  async up(queryInterface) {
    const columns = await queryInterface.describeTable(TABLE_NAME).catch(() => null);
    if (!columns?.[COLUMN_NAME] || columns[COLUMN_NAME].allowNull === true) return;

    const [metadataRows] = await queryInterface.sequelize.query(
      `SELECT COLUMN_TYPE AS columnType,
              CHARACTER_SET_NAME AS characterSetName,
              COLLATION_NAME AS collationName
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = :tableName
         AND COLUMN_NAME = :columnName`,
      {
        replacements: {
          tableName: TABLE_NAME,
          columnName: COLUMN_NAME
        }
      }
    );
    const columnMetadata = metadataRows?.[0];
    if (!columnMetadata || !isSafeColumnType(columnMetadata.columnType)) {
      throw new Error(`Unable to read a safe COLUMN_TYPE for ${TABLE_NAME}.${COLUMN_NAME}`);
    }

    const { characterSetName, collationName } = columnMetadata;
    let characterSetClause = '';
    if (characterSetName || collationName) {
      if (!isSafeMetadataIdentifier(characterSetName) || !isSafeMetadataIdentifier(collationName)) {
        throw new Error(`Unable to read safe character set and collation for ${TABLE_NAME}.${COLUMN_NAME}`);
      }
      characterSetClause = ` CHARACTER SET ${characterSetName} COLLATE ${collationName}`;
    }

    await queryInterface.sequelize.query(
      `ALTER TABLE \`${TABLE_NAME}\` MODIFY \`${COLUMN_NAME}\` ${columnMetadata.columnType}${characterSetClause} NULL`
    );
  },

  async down() {
    // Deliberately irreversible: draft uploads may contain NULL application_id values.
  }
};
