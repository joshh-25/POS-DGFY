import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260905000001-add-pending-email-otp-delivery-status.cjs');

const buildQueryInterface = ({ table } = {}) => ({
  describeTable: jest.fn().mockImplementation(() => Promise.resolve(table)),
  changeColumn: jest.fn().mockResolvedValue(undefined),
  sequelize: {
    query: jest.fn().mockResolvedValue(undefined)
  }
});

const Sequelize = {
  ENUM: (...values) => ({ type: 'ENUM', values })
};

describe('add pending email_otp delivery_status migration', () => {
  it('no-ops when email_otps does not exist', async () => {
    const queryInterface = buildQueryInterface({ table: null });

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.changeColumn).not.toHaveBeenCalled();
  });

  it('widens the enum to include pending and defaults to it', async () => {
    const queryInterface = buildQueryInterface({
      table: {
        delivery_status: { type: "ENUM('sent','failed','recorded','bounced')" }
      }
    });

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.changeColumn).toHaveBeenCalledWith(
      'email_otps',
      'delivery_status',
      expect.objectContaining({ allowNull: false, defaultValue: 'pending' })
    );
    const [, , columnDef] = queryInterface.changeColumn.mock.calls[0];
    expect(columnDef.type.values).toEqual(['pending', 'sent', 'failed', 'recorded', 'bounced']);
  });

  it('is idempotent when the enum already includes pending', async () => {
    const queryInterface = buildQueryInterface({
      table: {
        delivery_status: { type: "ENUM('pending','sent','failed','recorded','bounced')" }
      }
    });

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.changeColumn).not.toHaveBeenCalled();
  });

  it('down: no-ops when the table does not exist', async () => {
    const queryInterface = buildQueryInterface({ table: null });

    await migration.down(queryInterface, Sequelize);

    expect(queryInterface.sequelize.query).not.toHaveBeenCalled();
    expect(queryInterface.changeColumn).not.toHaveBeenCalled();
  });

  it('down: backfills pending rows to failed before narrowing the enum', async () => {
    const queryInterface = buildQueryInterface({
      table: {
        delivery_status: { type: "ENUM('pending','sent','failed','recorded','bounced')" }
      }
    });

    await migration.down(queryInterface, Sequelize);

    const backfillCall = queryInterface.sequelize.query.mock.calls.find(([sql]) =>
      sql.includes("UPDATE email_otps SET delivery_status = 'failed'")
    );
    expect(backfillCall).toBeTruthy();
    expect(backfillCall[0]).toContain("WHERE delivery_status = 'pending'");

    const backfillIndex = queryInterface.sequelize.query.mock.calls.indexOf(backfillCall);
    const changeColumnCallOrder = queryInterface.changeColumn.mock.invocationCallOrder[0];
    const backfillCallOrder = queryInterface.sequelize.query.mock.invocationCallOrder[backfillIndex];
    expect(backfillCallOrder).toBeLessThan(changeColumnCallOrder);

    expect(queryInterface.changeColumn).toHaveBeenCalledWith(
      'email_otps',
      'delivery_status',
      expect.objectContaining({ allowNull: false, defaultValue: 'sent' })
    );
    const [, , columnDef] = queryInterface.changeColumn.mock.calls[0];
    expect(columnDef.type.values).toEqual(['sent', 'failed', 'recorded', 'bounced']);
  });

  it('down: is idempotent when already narrowed', async () => {
    const queryInterface = buildQueryInterface({
      table: {
        delivery_status: { type: "ENUM('sent','failed','recorded','bounced')" }
      }
    });

    await migration.down(queryInterface, Sequelize);

    // Backfill UPDATE still runs (harmless no-op on an already-narrow enum)
    // but changeColumn must not fire again.
    expect(queryInterface.changeColumn).not.toHaveBeenCalled();
  });
});
