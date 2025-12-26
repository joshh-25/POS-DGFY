export default {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    
    await queryInterface.bulkInsert('suppliers', [
      {
        name: 'Supplier A - Premium Foods',
        contact_person: 'John Smith',
        email: 'john@premiumfoods.com',
        phone: '+1 555-0101',
        address: '123 Industrial Blvd, Suite 100, Metro City, MC 12345',
        quality_rating: 4.8,
        avg_delivery_days: 3,
        is_active: true,
        last_delivery_date: '2025-01-18',
        created_at: now,
        updated_at: now
      },
      {
        name: 'Supplier B - Organic Spices',
        contact_person: 'Maria Garcia',
        email: 'maria@organicspices.com',
        phone: '+1 555-0202',
        address: '456 Spice Lane, Flavor Town, FT 67890',
        quality_rating: 4.2,
        avg_delivery_days: 5,
        is_active: true,
        last_delivery_date: '2025-01-15',
        created_at: now,
        updated_at: now
      },
      {
        name: 'Supplier C - PackagePro',
        contact_person: 'David Chen',
        email: 'david@packagepro.com',
        phone: '+1 555-0303',
        address: '789 Packaging Way, Box City, BC 11223',
        quality_rating: 4.5,
        avg_delivery_days: 7,
        is_active: true,
        last_delivery_date: '2025-01-14',
        created_at: now,
        updated_at: now
      }
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('suppliers', {
      name: {
        [Sequelize.Op.in]: [
          'Supplier A - Premium Foods',
          'Supplier B - Organic Spices',
          'Supplier C - PackagePro'
        ]
      }
    }, {});
  }
};

