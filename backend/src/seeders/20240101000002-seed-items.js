export default {
  async up(queryInterface) {
    // Check if items already exist (idempotent seeder)
    let existingItems = [];
    try {
      const result = await queryInterface.sequelize.query(
        `SELECT sku_code FROM items WHERE sku_code IN ('ING-SUG-001', 'ING-SAL-001', 'ING-GIN-001', 'ING-TEA-001', 'PRD-GTM-001', 'PRD-HRB-001', 'PRD-WIP-001', 'PKG-BTL-001', 'PKG-STK-001', 'PKG-BOX-001', 'SUP-CLN-001', 'SUP-SAN-001')`
      );
      existingItems = result[0] || [];
    } catch {
      // Table might not exist yet, continue with insert
    }

    // Only seed if items don't exist
    if (existingItems.length > 0) {
      console.log('ℹ️  Items already exist, skipping seed');
      return;
    }

    const now = new Date();

    await queryInterface.bulkInsert('items', [
      {
        sku_code: 'ING-SUG-001',
        name: 'Sugar',
        category: 'raw_material',
        product_type: null,
        description: 'Premium white granulated sugar',
        current_stock: 10,
        max_capacity: 25,
        min_threshold: 10,
        purchase_allowance: 5,
        unit_of_measure: 'kg',
        cost_per_unit: 2.5,
        status: 'active',
        created_at: now,
        updated_at: now
      },
      {
        sku_code: 'ING-SAL-001',
        name: 'Salt',
        category: 'raw_material',
        product_type: null,
        description: 'Fine iodized salt',
        current_stock: 5,
        max_capacity: 15,
        min_threshold: 6,
        purchase_allowance: 3,
        unit_of_measure: 'kg',
        cost_per_unit: 1.5,
        status: 'active',
        created_at: now,
        updated_at: now
      },
      {
        sku_code: 'ING-GIN-001',
        name: 'Ginger Powder',
        category: 'raw_material',
        product_type: null,
        description: 'Organic ground ginger powder',
        current_stock: 1,
        max_capacity: 5,
        min_threshold: 2,
        purchase_allowance: 1,
        unit_of_measure: 'kg',
        cost_per_unit: 15.0,
        status: 'active',
        created_at: now,
        updated_at: now
      },
      {
        sku_code: 'ING-TEA-001',
        name: 'Tea Leaves',
        category: 'raw_material',
        product_type: null,
        description: 'Premium black tea leaves',
        current_stock: 8,
        max_capacity: 10,
        min_threshold: 4,
        purchase_allowance: 2,
        unit_of_measure: 'kg',
        cost_per_unit: 20.0,
        status: 'active',
        created_at: now,
        updated_at: now
      },
      {
        sku_code: 'PRD-GTM-001',
        name: 'Ginger Tea Mix',
        category: 'product',
        product_type: 'finished_goods',
        description: 'Premium ginger tea blend - 500g packages',
        current_stock: 45,
        max_capacity: 100,
        min_threshold: 40,
        purchase_allowance: 20,
        unit_of_measure: 'units',
        cost_per_unit: 8.5,
        status: 'active',
        created_at: now,
        updated_at: now
      },
      {
        sku_code: 'PRD-HRB-001',
        name: 'Herbal Blend',
        category: 'product',
        product_type: 'finished_goods',
        description: 'Mixed herbal tea blend - 250g packages',
        current_stock: 30,
        max_capacity: 80,
        min_threshold: 32,
        purchase_allowance: 16,
        unit_of_measure: 'units',
        cost_per_unit: 6.0,
        status: 'active',
        created_at: now,
        updated_at: now
      },
      {
        sku_code: 'PKG-BTL-001',
        name: '6-inch Glass Bottles',
        category: 'packaging',
        product_type: null,
        description: 'Clear glass bottles for tea products',
        current_stock: 150,
        max_capacity: 500,
        min_threshold: 200,
        purchase_allowance: 100,
        unit_of_measure: 'units',
        cost_per_unit: 0.75,
        status: 'active',
        created_at: now,
        updated_at: now
      },
      {
        sku_code: 'PKG-STK-001',
        name: 'Sticker Labels',
        category: 'packaging',
        product_type: null,
        description: 'Product labels for bottles',
        current_stock: 500,
        max_capacity: 2000,
        min_threshold: 800,
        purchase_allowance: 400,
        unit_of_measure: 'units',
        cost_per_unit: 0.05,
        status: 'active',
        created_at: now,
        updated_at: now
      },
      {
        sku_code: 'PKG-BOX-001',
        name: 'Cardboard Boxes',
        category: 'packaging',
        product_type: null,
        description: 'Shipping boxes for product bundles',
        current_stock: 75,
        max_capacity: 200,
        min_threshold: 80,
        purchase_allowance: 40,
        unit_of_measure: 'units',
        cost_per_unit: 1.25,
        status: 'active',
        created_at: now,
        updated_at: now
      },
      {
        sku_code: 'SUP-CLN-001',
        name: 'Cleaning Supplies',
        category: 'supplies',
        product_type: null,
        description: 'General cleaning supplies for production area',
        current_stock: 20,
        max_capacity: 50,
        min_threshold: 20,
        purchase_allowance: 10,
        unit_of_measure: 'units',
        cost_per_unit: 3.50,
        status: 'active',
        created_at: now,
        updated_at: now
      },
      {
        sku_code: 'SUP-SAN-001',
        name: 'Sanitizer Bottles',
        category: 'supplies',
        product_type: null,
        description: 'Hand sanitizer for hygiene compliance',
        current_stock: 15,
        max_capacity: 40,
        min_threshold: 16,
        purchase_allowance: 8,
        unit_of_measure: 'bottles',
        cost_per_unit: 2.25,
        status: 'active',
        created_at: now,
        updated_at: now
      },
      {
        sku_code: 'PRD-WIP-001',
        name: 'Tea Base Mix (WIP)',
        category: 'product',
        product_type: 'work_in_progress',
        description: 'Semi-processed tea base for further blending',
        current_stock: 25,
        max_capacity: 60,
        min_threshold: 24,
        purchase_allowance: 12,
        unit_of_measure: 'kg',
        cost_per_unit: 5.75,
        status: 'active',
        created_at: now,
        updated_at: now
      }
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('items', {
      sku_code: {
        [Sequelize.Op.in]: [
          'ING-SUG-001',
          'ING-SAL-001',
          'ING-GIN-001',
          'ING-TEA-001',
          'PRD-GTM-001',
          'PRD-HRB-001',
          'PRD-WIP-001',
          'PKG-BTL-001',
          'PKG-STK-001',
          'PKG-BOX-001',
          'SUP-CLN-001',
          'SUP-SAN-001'
        ]
      }
    }, {});
  }
};

