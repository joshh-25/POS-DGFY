export default {
  async up(queryInterface) {
    // Get supplier IDs by name
    const [suppliers] = await queryInterface.sequelize.query(
      `SELECT supplier_id, name FROM suppliers WHERE name IN ('Supplier A - Premium Foods', 'Supplier B - Organic Spices', 'Supplier C - PackagePro')`
    );
    
    const supplierMap = {};
    suppliers.forEach(supplier => {
      supplierMap[supplier.name] = supplier.supplier_id;
    });
    
    const now = new Date();
    
    // Supplier A - Premium Foods bulk discounts
    const supplierADiscounts = [
      {
        supplier_id: supplierMap['Supplier A - Premium Foods'],
        min_quantity: 10,
        discount_percent: 5,
        created_at: now,
        updated_at: now
      },
      {
        supplier_id: supplierMap['Supplier A - Premium Foods'],
        min_quantity: 25,
        discount_percent: 10,
        created_at: now,
        updated_at: now
      }
    ];
    
    // Supplier B - Organic Spices bulk discounts
    const supplierBDiscounts = [
      {
        supplier_id: supplierMap['Supplier B - Organic Spices'],
        min_quantity: 5,
        discount_percent: 3,
        created_at: now,
        updated_at: now
      },
      {
        supplier_id: supplierMap['Supplier B - Organic Spices'],
        min_quantity: 15,
        discount_percent: 8,
        created_at: now,
        updated_at: now
      }
    ];
    
    // Supplier C - PackagePro bulk discounts
    const supplierCDiscounts = [
      {
        supplier_id: supplierMap['Supplier C - PackagePro'],
        min_quantity: 100,
        discount_percent: 5,
        created_at: now,
        updated_at: now
      },
      {
        supplier_id: supplierMap['Supplier C - PackagePro'],
        min_quantity: 500,
        discount_percent: 12,
        created_at: now,
        updated_at: now
      }
    ];
    
    await queryInterface.bulkInsert('bulk_discounts', [
      ...supplierADiscounts,
      ...supplierBDiscounts,
      ...supplierCDiscounts
    ]);
  },

  async down(queryInterface, Sequelize) {
    // Get supplier IDs
    const [suppliers] = await queryInterface.sequelize.query(
      `SELECT supplier_id FROM suppliers WHERE name IN ('Supplier A - Premium Foods', 'Supplier B - Organic Spices', 'Supplier C - PackagePro')`
    );
    
    const supplierIds = suppliers.map(s => s.supplier_id);
    
    if (supplierIds.length > 0) {
      await queryInterface.bulkDelete('bulk_discounts', {
        supplier_id: {
          [Sequelize.Op.in]: supplierIds
        }
      }, {});
    }
  }
};

