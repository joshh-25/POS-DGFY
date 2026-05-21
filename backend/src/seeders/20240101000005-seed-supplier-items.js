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
    
    // Get item IDs by SKU code
    const [items] = await queryInterface.sequelize.query(
      `SELECT item_id, sku_code FROM items WHERE sku_code IN ('ING-SUG-001', 'ING-SAL-001', 'ING-TEA-001', 'ING-GIN-001', 'PKG-BTL-001', 'PKG-STK-001', 'PKG-BOX-001')`
    );
    
    const itemMap = {};
    items.forEach(item => {
      itemMap[item.sku_code] = item.item_id;
    });
    
    const now = new Date();
    
    // Supplier A - Premium Foods items
    const supplierAItems = [
      {
        supplier_id: supplierMap['Supplier A - Premium Foods'],
        item_id: itemMap['ING-SUG-001'],
        moq: 10,
        price_per_unit: 2.5,
        is_preferred: true,
        last_price_update: now,
        created_at: now
      },
      {
        supplier_id: supplierMap['Supplier A - Premium Foods'],
        item_id: itemMap['ING-SAL-001'],
        moq: 5,
        price_per_unit: 1.5,
        is_preferred: true,
        last_price_update: now,
        created_at: now
      },
      {
        supplier_id: supplierMap['Supplier A - Premium Foods'],
        item_id: itemMap['ING-TEA-001'],
        moq: 3,
        price_per_unit: 20.0,
        is_preferred: true,
        last_price_update: now,
        created_at: now
      }
    ];
    
    // Supplier B - Organic Spices items
    const supplierBItems = [
      {
        supplier_id: supplierMap['Supplier B - Organic Spices'],
        item_id: itemMap['ING-GIN-001'],
        moq: 2,
        price_per_unit: 15.0,
        is_preferred: true,
        last_price_update: now,
        created_at: now
      },
      {
        supplier_id: supplierMap['Supplier B - Organic Spices'],
        item_id: itemMap['ING-TEA-001'],
        moq: 2,
        price_per_unit: 22.0,
        is_preferred: false,
        last_price_update: now,
        created_at: now
      }
    ];
    
    // Supplier C - PackagePro items
    const supplierCItems = [
      {
        supplier_id: supplierMap['Supplier C - PackagePro'],
        item_id: itemMap['PKG-BTL-001'],
        moq: 50,
        price_per_unit: 0.75,
        is_preferred: true,
        last_price_update: now,
        created_at: now
      },
      {
        supplier_id: supplierMap['Supplier C - PackagePro'],
        item_id: itemMap['PKG-STK-001'],
        moq: 100,
        price_per_unit: 0.05,
        is_preferred: true,
        last_price_update: now,
        created_at: now
      },
      {
        supplier_id: supplierMap['Supplier C - PackagePro'],
        item_id: itemMap['PKG-BOX-001'],
        moq: 25,
        price_per_unit: 1.25,
        is_preferred: true,
        last_price_update: now,
        created_at: now
      }
    ];
    
    await queryInterface.bulkInsert('supplier_items', [
      ...supplierAItems,
      ...supplierBItems,
      ...supplierCItems
    ]);
  },

  async down(queryInterface, Sequelize) {
    // Get supplier IDs
    const [suppliers] = await queryInterface.sequelize.query(
      `SELECT supplier_id FROM suppliers WHERE name IN ('Supplier A - Premium Foods', 'Supplier B - Organic Spices', 'Supplier C - PackagePro')`
    );
    
    const supplierIds = suppliers.map(s => s.supplier_id);
    
    if (supplierIds.length > 0) {
      await queryInterface.bulkDelete('supplier_items', {
        supplier_id: {
          [Sequelize.Op.in]: supplierIds
        }
      }, {});
    }
  }
};

