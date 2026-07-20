/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const [indexes] = await queryInterface.sequelize.query(
      `SELECT INDEX_NAME
         FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'dgfy_account_handoffs'
          AND column_name = 'jti'
          AND non_unique = 0
        GROUP BY INDEX_NAME`
    );

    const indexNames = indexes.map((row) => row.INDEX_NAME);
    if (
      indexNames.includes('jti')
      && indexNames.includes('unique_dgfy_account_handoffs_jti')
    ) {
      await queryInterface.removeIndex('dgfy_account_handoffs', 'jti');
    }
  },

  async down(queryInterface, Sequelize) {
    const [indexes] = await queryInterface.sequelize.query(
      `SELECT INDEX_NAME
         FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'dgfy_account_handoffs'
          AND index_name = 'jti'
        LIMIT 1`
    );

    if (indexes.length === 0) {
      await queryInterface.addIndex('dgfy_account_handoffs', ['jti'], {
        unique: true,
        name: 'jti'
      });
    }
  }
};
