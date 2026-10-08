import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const applicationUploadMigration = require('../../dgfy-migration-runner/migrations/20261001000001-create-company-registration-uploads.cjs');
const draftUploadExtensionMigration = require('../../dgfy-migration-runner/migrations/20261008000001-extend-company-registration-uploads-for-drafts.cjs');

const Sequelize = {
  UUID: 'UUID',
  STRING: (length) => ({ type: 'STRING', length }),
  ENUM: (...values) => ({ type: 'ENUM', values }),
  INTEGER: 'INTEGER',
  JSON: 'JSON',
  BIGINT: 'BIGINT',
  DATE: 'DATE',
  literal: (value) => ({ literal: value })
};

const applicationColumns = () => ({
  id: {},
  application_id: {},
  attempt_id: {},
  asset_kind: {},
  storage_key: {},
  original_filename: {},
  mime_type: {},
  byte_size: {},
  sha256: {},
  extraction_status: {},
  review_status: {},
  expires_at: {},
  revoked_at: {},
  revoked_by_admin_id: {},
  purged_at: {},
  metadata: {},
  created_at: {},
  updated_at: {}
});

const buildQueryInterface = ({ existingColumns = null, existingIndexes = [] } = {}) => {
  const schemas = new Map(existingColumns ? [['company_registration_uploads', { ...existingColumns }]] : []);
  const indexes = [...existingIndexes];
  const tableExists = (table) => schemas.has(table);

  return {
    describeTable: jest.fn(async (table) => {
      if (!tableExists(table)) throw new Error('table does not exist');
      return schemas.get(table);
    }),
    createTable: jest.fn(async (table, definition) => {
      schemas.set(table, { ...definition });
    }),
    addColumn: jest.fn(async (table, name, definition) => {
      schemas.get(table)[name] = definition;
    }),
    changeColumn: jest.fn(async (table, name, definition) => {
      schemas.get(table)[name] = definition;
    }),
    removeColumn: jest.fn(async (table, name) => {
      delete schemas.get(table)[name];
    }),
    showIndex: jest.fn(async () => indexes),
    addIndex: jest.fn(async (table, fields, options) => {
      indexes.push({ ...options, fields });
    }),
    removeIndex: jest.fn(async (table, name) => {
      const index = indexes.findIndex((entry) => entry.name === name);
      if (index >= 0) indexes.splice(index, 1);
    }),
    dropTable: jest.fn().mockResolvedValue(undefined)
  };
};

describe('company registration upload migrations', () => {
  it('does not apply application indexes to a pre-release draft-only table', async () => {
    const queryInterface = buildQueryInterface({
      existingColumns: {
        id: {},
        registration_draft_id: {},
        dgfy_account_id: {},
        category: {},
        created_at: {}
      }
    });

    await applicationUploadMigration.up(queryInterface, Sequelize);

    expect(queryInterface.addIndex).not.toHaveBeenCalled();
  });

  it('extends the established upload table with draft columns and indexes', async () => {
    const queryInterface = buildQueryInterface({ existingColumns: applicationColumns() });

    await draftUploadExtensionMigration.up(queryInterface, Sequelize);

    expect(queryInterface.addColumn).toHaveBeenCalledWith(
      'company_registration_uploads',
      'registration_draft_id',
      expect.objectContaining({ allowNull: true })
    );
    expect(queryInterface.addColumn).toHaveBeenCalledWith(
      'company_registration_uploads',
      'category',
      expect.objectContaining({ allowNull: true })
    );
    expect(queryInterface.changeColumn).toHaveBeenCalledWith(
      'company_registration_uploads',
      'application_id',
      expect.objectContaining({ allowNull: true })
    );
    expect(queryInterface.addIndex).toHaveBeenCalledWith(
      'company_registration_uploads',
      ['registration_draft_id', 'category', 'upload_status'],
      { name: 'idx_registration_upload_draft_category_status' }
    );
    expect(queryInterface.addIndex).toHaveBeenCalledWith(
      'company_registration_uploads',
      ['dgfy_account_id', 'created_at'],
      { name: 'idx_registration_upload_owner_created' }
    );
  });

  it('is a no-op when the shared upload table is absent', async () => {
    const queryInterface = buildQueryInterface();

    await draftUploadExtensionMigration.up(queryInterface, Sequelize);

    expect(queryInterface.addColumn).not.toHaveBeenCalled();
    expect(queryInterface.addIndex).not.toHaveBeenCalled();
  });

  it('removes only draft-specific indexes and columns on rollback', async () => {
    const draftColumns = {
      ...applicationColumns(),
      registration_draft_id: {},
      dgfy_account_id: {},
      category: {},
      original_name: {},
      sanitized_name: {},
      file_size: {},
      upload_status: {},
      validation_status: {},
      error_message: {},
      position: {},
      uploaded_at: {},
      removed_at: {},
      removed_by_account_id: {}
    };
    const queryInterface = buildQueryInterface({
      existingColumns: draftColumns,
      existingIndexes: [
        { name: 'idx_registration_upload_draft_category_status' },
        { name: 'idx_registration_upload_owner_created' },
        { name: 'idx_company_registration_upload_application_attempt' }
      ]
    });

    await draftUploadExtensionMigration.down(queryInterface);

    expect(queryInterface.removeIndex).toHaveBeenCalledWith(
      'company_registration_uploads',
      'idx_registration_upload_draft_category_status'
    );
    expect(queryInterface.removeIndex).toHaveBeenCalledWith(
      'company_registration_uploads',
      'idx_registration_upload_owner_created'
    );
    expect(queryInterface.removeColumn).toHaveBeenCalledWith('company_registration_uploads', 'registration_draft_id');
    expect(queryInterface.removeColumn).toHaveBeenCalledWith('company_registration_uploads', 'removed_by_account_id');
    expect(queryInterface.removeColumn).not.toHaveBeenCalledWith('company_registration_uploads', 'application_id');
  });
});
