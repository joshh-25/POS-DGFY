// Additive payment target for the DGFY-owned online DGLaundry booking rail.
// Existing store-checkout and service-booking rows retain their semantics.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('commerce_payment_sessions', 'target_type', {
      type: Sequelize.ENUM('store_checkout', 'service_booking', 'dglaundry_booking'),
      allowNull: false,
      defaultValue: 'store_checkout'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query("UPDATE commerce_payment_sessions SET target_type = 'service_booking' WHERE target_type = 'dglaundry_booking'");
    await queryInterface.changeColumn('commerce_payment_sessions', 'target_type', {
      type: Sequelize.ENUM('store_checkout', 'service_booking'),
      allowNull: false,
      defaultValue: 'store_checkout'
    });
  }
};
