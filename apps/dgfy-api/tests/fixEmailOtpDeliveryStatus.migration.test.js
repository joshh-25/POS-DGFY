import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260807000001-fix-email-otp-delivery-status.cjs');

const buildQueryInterface = ({ table, indexes = [] } = {}) => ({
  describeTable: jest.fn().mockImplementation(() => Promise.resolve(table)),
  addColumn: jest.fn().mockResolvedValue(undefined),
  removeColumn: jest.fn().mockResolvedValue(undefined),
  changeColumn: jest.fn().mockResolvedValue(undefined),
  showIndex: jest.fn().mockResolvedValue(indexes),
  addIndex: jest.fn().mockResolvedValue(undefined),
  removeIndex: jest.fn().mockResolvedValue(undefined),
  sequelize: {
    query: jest.fn().mockResolvedValue(undefined)
  }
});

const Sequelize = {
  ENUM: (...values) => ({ type: 'ENUM', values }),
  UUID: 'UUID'
};

describe('fix email_otp delivery_status migration', () => {
  it('no-ops when email_otps does not exist', async () => {
    const queryInterface = buildQueryInterface({ table: null });

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.changeColumn).not.toHaveBeenCalled();
    expect(queryInterface.addColumn).not.toHaveBeenCalled();
  });

  it('widens the enum and adds email_delivery_id when missing', async () => {
    const queryInterface = buildQueryInterface({
      table: {
        delivery_status: { type: "ENUM('sent','failed')" }
      }
    });

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.changeColumn).toHaveBeenCalledWith(
      'email_otps',
      'delivery_status',
      expect.objectContaining({ allowNull: false, defaultValue: 'sent' })
    );
    expect(queryInterface.addColumn).toHaveBeenCalledWith(
      'email_otps',
      'email_delivery_id',
      expect.objectContaining({ type: 'UUID', allowNull: true })
    );
    expect(queryInterface.addIndex).toHaveBeenCalledWith(
      'email_otps',
      ['email_delivery_id'],
      expect.objectContaining({ name: 'idx_email_otps_email_delivery_id' })
    );
  });

  it('is idempotent when the enum is already widened and the column/index already exist', async () => {
    const queryInterface = buildQueryInterface({
      table: {
        delivery_status: { type: "ENUM('sent','failed','recorded','bounced')" },
        email_delivery_id: { type: 'UUID' }
      },
      indexes: [{ name: 'idx_email_otps_email_delivery_id' }]
    });

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.changeColumn).not.toHaveBeenCalled();
    expect(queryInterface.addColumn).not.toHaveBeenCalled();
    expect(queryInterface.addIndex).not.toHaveBeenCalled();
  });

  it('down: no-ops when the table does not exist', async () => {
    const queryInterface = buildQueryInterface({ table: null });

    await migration.down(queryInterface, Sequelize);

    expect(queryInterface.sequelize.query).not.toHaveBeenCalled();
    expect(queryInterface.changeColumn).not.toHaveBeenCalled();
  });

  it('down: backfills recorded/bounced rows to failed before narrowing the enum, and drops the column/index', async () => {
    let describeCallCount = 0;
    const queryInterface = buildQueryInterface({
      table: {
        delivery_status: { type: "ENUM('sent','failed','recorded','bounced')" },
        email_delivery_id: { type: 'UUID' }
      },
      indexes: [{ name: 'idx_email_otps_email_delivery_id' }]
    });
    // describeTable is called twice in down(): once up front, once after the
    // backfill to re-read the (still-wide) enum type before deciding to narrow.
    queryInterface.describeTable.mockImplementation(() => {
      describeCallCount += 1;
      return Promise.resolve({
        delivery_status: { type: "ENUM('sent','failed','recorded','bounced')" },
        email_delivery_id: describeCallCount === 1 ? { type: 'UUID' } : undefined
      });
    });

    await migration.down(queryInterface, Sequelize);

    expect(queryInterface.removeIndex).toHaveBeenCalledWith('email_otps', 'idx_email_otps_email_delivery_id');
    expect(queryInterface.removeColumn).toHaveBeenCalledWith('email_otps', 'email_delivery_id');

    const backfillCall = queryInterface.sequelize.query.mock.calls.find(([sql]) =>
      sql.includes("UPDATE email_otps SET delivery_status = 'failed'")
    );
    expect(backfillCall).toBeTruthy();

    const backfillIndex = queryInterface.sequelize.query.mock.calls.indexOf(backfillCall);
    const changeColumnCallOrder = queryInterface.changeColumn.mock.invocationCallOrder[0];
    const backfillCallOrder = queryInterface.sequelize.query.mock.invocationCallOrder[backfillIndex];
    expect(backfillCallOrder).toBeLessThan(changeColumnCallOrder);

    expect(queryInterface.changeColumn).toHaveBeenCalledWith(
      'email_otps',
      'delivery_status',
      expect.objectContaining({ allowNull: false, defaultValue: 'sent' })
    );
  });

  it('down: is idempotent when already narrowed', async () => {
    const queryInterface = buildQueryInterface({
      table: {
        delivery_status: { type: "ENUM('sent','failed')" }
      },
      indexes: []
    });

    await migration.down(queryInterface, Sequelize);

    expect(queryInterface.removeColumn).not.toHaveBeenCalled();
    expect(queryInterface.removeIndex).not.toHaveBeenCalled();
    // Backfill UPDATE still runs (harmless no-op on an already-narrow enum)
    // but changeColumn must not fire again.
    expect(queryInterface.changeColumn).not.toHaveBeenCalled();
  });
});
