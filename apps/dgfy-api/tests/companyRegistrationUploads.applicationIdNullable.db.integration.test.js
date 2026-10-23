import crypto from 'node:crypto';
import { jest } from '@jest/globals';
import { QueryTypes, Sequelize } from 'sequelize';
import sequelize from '../src/config/database.js';
import { runMigrationsForDb } from './helpers/migratedTestDatabase.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const applicationIdNullableMigration = require('../../dgfy-migration-runner/migrations/20261023000002-make-company-registration-upload-application-id-nullable.cjs');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  port: Number(process.env.DB_PORT || 3306)
};

const migrationDbName = `test_registration_upload_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
let migrationDb;
let migrationDbCreated = false;

const assertTestDatabase = async () => {
  const [databaseRow] = await sequelize.query('SELECT DATABASE() AS database_name', {
    type: QueryTypes.SELECT
  });
  const databaseName = String(databaseRow?.database_name || '');
  if (!/test/i.test(databaseName)) {
    throw new Error(`Refusing registration upload integration writes outside a test database (connected to ${databaseName || 'unknown'})`);
  }
};

const readRows = (sql, replacements) => migrationDb.query(sql, {
  type: QueryTypes.SELECT,
  replacements
});

const readRowsFrom = (database, sql) => database.query(sql, { type: QueryTypes.SELECT });

describe('company_registration_uploads.application_id MySQL integration', () => {
  beforeAll(async () => {
    await assertTestDatabase();
    await sequelize.query(`CREATE DATABASE IF NOT EXISTS \`${migrationDbName}\``);
    migrationDbCreated = true;
    runMigrationsForDb(migrationDbName);

    migrationDb = new Sequelize(
      migrationDbName,
      dbConfig.user,
      dbConfig.password,
      {
        host: dbConfig.host,
        port: dbConfig.port,
        dialect: 'mysql',
        logging: false
      }
    );
    await migrationDb.authenticate();
  }, 240000);

  afterAll(async () => {
    if (migrationDb) await migrationDb.close();
    if (migrationDbCreated) {
      await assertTestDatabase();
      await sequelize.query(`DROP DATABASE IF EXISTS \`${migrationDbName}\``);
    }
  }, 60000);

  it('makes application_id nullable after a fresh full migration chain', async () => {
    const [column] = await readRows(
      `SELECT IS_NULLABLE AS isNullable
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'company_registration_uploads'
         AND COLUMN_NAME = 'application_id'`
    );

    expect(column?.isNullable).toBe('YES');
  });

  it('preserves the referenced UUID definition and application foreign key', async () => {
    const [column] = await readRows(
      `SELECT upload_column.COLUMN_TYPE AS columnType,
              upload_column.CHARACTER_SET_NAME AS characterSetName,
              upload_column.COLLATION_NAME AS collationName,
              application_column.COLUMN_TYPE AS referencedColumnType,
              application_column.CHARACTER_SET_NAME AS referencedCharacterSetName,
              application_column.COLLATION_NAME AS referencedCollationName
       FROM information_schema.COLUMNS AS upload_column
       JOIN information_schema.COLUMNS AS application_column
         ON application_column.TABLE_SCHEMA = upload_column.TABLE_SCHEMA
        AND application_column.TABLE_NAME = 'company_registration_applications'
        AND application_column.COLUMN_NAME = 'id'
       WHERE upload_column.TABLE_SCHEMA = DATABASE()
         AND upload_column.TABLE_NAME = 'company_registration_uploads'
         AND upload_column.COLUMN_NAME = 'application_id'`
    );
    const foreignKeys = await readRows(
      `SELECT CONSTRAINT_NAME AS constraintName
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'company_registration_uploads'
         AND COLUMN_NAME = 'application_id'
         AND REFERENCED_TABLE_NAME = 'company_registration_applications'
         AND REFERENCED_COLUMN_NAME = 'id'`
    );

    expect(column).toEqual(expect.objectContaining({
      columnType: column?.referencedColumnType,
      characterSetName: column?.referencedCharacterSetName,
      collationName: column?.referencedCollationName
    }));
    expect(foreignKeys.length).toBeGreaterThan(0);
  });

  it('inserts draft-shaped uploads for every category without an application id', async () => {
    const accountId = crypto.randomUUID();
    const draftId = crypto.randomUUID();
    const uniqueSuffix = crypto.randomUUID();

    await migrationDb.query(
      `INSERT INTO dgfy_accounts (
         id, first_name, last_name, username, email, phone, password_hash
       ) VALUES (
         :id, 'Registration', 'Upload Test', :username, :email, :phone, 'test-only-hash'
       )`,
      {
        replacements: {
          id: accountId,
          username: `upload-test-${uniqueSuffix}`,
          email: `upload-test-${uniqueSuffix}@example.test`,
          phone: `+1555${uniqueSuffix.replace(/-/g, '').slice(0, 10)}`
        }
      }
    );
    await migrationDb.query(
      `INSERT INTO company_registration_drafts (
         id, dgfy_account_id, registration_email_snapshot, draft_payload
       ) VALUES (:id, :accountId, :email, :draftPayload)`,
      {
        replacements: {
          id: draftId,
          accountId,
          email: `upload-test-${uniqueSuffix}@example.test`,
          draftPayload: JSON.stringify({})
        }
      }
    );

    const categories = [
      ['profile_image', 'not_applicable'],
      ['cover_image', 'not_applicable'],
      ['gallery_image', 'not_applicable'],
      ['menu_upload', 'pending']
    ];
    for (const [category, extractionStatus] of categories) {
      await migrationDb.query(
        `INSERT INTO company_registration_uploads (
           id, registration_draft_id, dgfy_account_id, category,
           original_name, sanitized_name, file_size, extraction_status
         ) VALUES (
           :id, :draftId, :accountId, :category,
           :originalName, :sanitizedName, 1024, :extractionStatus
         )`,
        {
          replacements: {
            id: crypto.randomUUID(),
            draftId,
            accountId,
            category,
            originalName: `${category}.jpg`,
            sanitizedName: `${category}.jpg`,
            extractionStatus
          }
        }
      );
    }

    const uploads = await readRows(
      `SELECT category, extraction_status AS extractionStatus
       FROM company_registration_uploads
       WHERE registration_draft_id = :draftId`,
      { draftId }
    );

    expect(uploads).toHaveLength(4);
    expect(uploads).toEqual(expect.arrayContaining([
      { category: 'cover_image', extractionStatus: 'not_applicable' },
      { category: 'gallery_image', extractionStatus: 'not_applicable' },
      { category: 'menu_upload', extractionStatus: 'pending' },
      { category: 'profile_image', extractionStatus: 'not_applicable' }
    ]));
  });
});

const upgradeDbName = `test_registration_upload_upgrade_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
let upgradeDb;
let upgradeDbCreated = false;

describe('company_registration_uploads.application_id PROD-shaped MySQL upgrade', () => {
  beforeAll(async () => {
    await assertTestDatabase();
    await sequelize.query(`CREATE DATABASE IF NOT EXISTS \`${upgradeDbName}\``);
    upgradeDbCreated = true;
    runMigrationsForDb(upgradeDbName, {
      to: '20261022000002-create-external-redirect-sites.cjs'
    });

    upgradeDb = new Sequelize(
      upgradeDbName,
      dbConfig.user,
      dbConfig.password,
      {
        host: dbConfig.host,
        port: dbConfig.port,
        dialect: 'mysql',
        logging: false
      }
    );
    await upgradeDb.authenticate();
  }, 240000);

  afterAll(async () => {
    if (upgradeDb) await upgradeDb.close();
    if (upgradeDbCreated) {
      await assertTestDatabase();
      await sequelize.query(`DROP DATABASE IF EXISTS \`${upgradeDbName}\``);
    }
  }, 60000);

  it('repairs the current NOT NULL shape once and is idempotent', async () => {
    const [before] = await readRowsFrom(
      upgradeDb,
      `SELECT IS_NULLABLE AS isNullable
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'company_registration_uploads'
         AND COLUMN_NAME = 'application_id'`
    );
    expect(before?.isNullable).toBe('NO');

    const alterStatements = [];
    const originalQuery = upgradeDb.query.bind(upgradeDb);
    const querySpy = jest.spyOn(upgradeDb, 'query').mockImplementation((sql, ...args) => {
      if (typeof sql === 'string' && /^ALTER TABLE `company_registration_uploads` MODIFY `application_id`/i.test(sql)) {
        alterStatements.push(sql);
      }
      return originalQuery(sql, ...args);
    });

    try {
      const queryInterface = upgradeDb.getQueryInterface();
      await applicationIdNullableMigration.up(queryInterface);

      const [after] = await readRowsFrom(
        upgradeDb,
        `SELECT IS_NULLABLE AS isNullable
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'company_registration_uploads'
           AND COLUMN_NAME = 'application_id'`
      );
      expect(after?.isNullable).toBe('YES');
      expect(alterStatements).toHaveLength(1);

      await applicationIdNullableMigration.up(queryInterface);
      expect(alterStatements).toHaveLength(1);
    } finally {
      querySpy.mockRestore();
    }
  });
});
