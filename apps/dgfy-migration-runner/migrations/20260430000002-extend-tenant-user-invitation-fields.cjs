/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('users');

    if (tableInfo.invitation_status) {
      await queryInterface.changeColumn('users', 'invitation_status', {
        type: Sequelize.ENUM('pending', 'accepted', 'expired', 'cancelled'),
        allowNull: true
      });
    }

    const columns = {
      invitation_delivery_status: {
        type: Sequelize.ENUM('not_configured', 'sent', 'failed', 'manual_link'),
        allowNull: true
      },
      invitation_delivery_error: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      invitation_last_sent_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      invitation_accepted_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      invitation_cancelled_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      invitation_cancelled_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'user_id' }
      }
    };

    for (const [column, definition] of Object.entries(columns)) {
      if (!tableInfo[column]) {
        await queryInterface.addColumn('users', column, definition);
      }
    }
  },

  async down(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('users');
    const columns = [
      'invitation_delivery_status',
      'invitation_delivery_error',
      'invitation_last_sent_at',
      'invitation_accepted_at',
      'invitation_cancelled_at',
      'invitation_cancelled_by'
    ];
    for (const column of columns) {
      if (tableInfo[column]) await queryInterface.removeColumn('users', column);
    }
    if (tableInfo.invitation_status) {
      await queryInterface.changeColumn('users', 'invitation_status', {
        type: Sequelize.ENUM('pending', 'accepted', 'expired'),
        allowNull: true
      });
    }
  }
};
