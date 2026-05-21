'use strict';

const TABLE_NAME = 'service_reminder_outbox';

const normalizeTableName = (table) => {
  if (!table) return '';
  if (typeof table === 'string') return table;
  return table.tableName || table.TABLE_NAME || '';
};

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return (tables || []).map(normalizeTableName).includes(tableName);
};

const addIndexSafe = async (queryInterface, tableName, fields, options = {}) => {
  try {
    await queryInterface.addIndex(tableName, fields, options);
  } catch (error) {
    const message = String(error?.original?.sqlMessage || error?.message || '');
    if (!/Duplicate key name|already exists/i.test(message)) {
      throw error;
    }
  }
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (await tableExists(queryInterface, TABLE_NAME)) return;

    await queryInterface.createTable(TABLE_NAME, {
      reminder_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      booking_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'service_bookings', key: 'booking_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      channel: {
        type: Sequelize.ENUM('email', 'sms'),
        allowNull: false,
        defaultValue: 'email'
      },
      reminder_type: {
        type: Sequelize.ENUM('confirmation', 'appointment_reminder', 'waitlist_alert', 'follow_up'),
        allowNull: false,
        defaultValue: 'appointment_reminder'
      },
      recipient: { type: Sequelize.STRING(255), allowNull: false },
      scheduled_for: { type: Sequelize.DATE, allowNull: false },
      sent_at: { type: Sequelize.DATE, allowNull: true },
      status: {
        type: Sequelize.ENUM('pending', 'sent', 'failed', 'skipped'),
        allowNull: false,
        defaultValue: 'pending'
      },
      provider_message_id: { type: Sequelize.STRING(255), allowNull: true },
      failure_reason: { type: Sequelize.STRING(500), allowNull: true },
      payload: { type: Sequelize.JSON, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    await addIndexSafe(queryInterface, TABLE_NAME, ['booking_id'], { name: 'idx_service_reminders_booking' });
    await addIndexSafe(queryInterface, TABLE_NAME, ['channel'], { name: 'idx_service_reminders_channel' });
    await addIndexSafe(queryInterface, TABLE_NAME, ['reminder_type'], { name: 'idx_service_reminders_type' });
    await addIndexSafe(queryInterface, TABLE_NAME, ['scheduled_for'], { name: 'idx_service_reminders_scheduled_for' });
    await addIndexSafe(queryInterface, TABLE_NAME, ['status'], { name: 'idx_service_reminders_status' });
    await addIndexSafe(queryInterface, TABLE_NAME, ['booking_id', 'channel', 'reminder_type'], {
      unique: true,
      name: 'uq_service_reminder_booking_channel_type'
    });
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, TABLE_NAME)) {
      await queryInterface.dropTable(TABLE_NAME);
    }
  }
};
