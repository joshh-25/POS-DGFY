export default {
  async up(queryInterface) {
    // Get item IDs by SKU code (products and ingredients)
    const [items] = await queryInterface.sequelize.query(
      `SELECT item_id, sku_code FROM items WHERE sku_code IN ('PRD-GTM-001', 'PRD-HRB-001', 'ING-TEA-001', 'ING-GIN-001', 'ING-SUG-001')`
    );
    
    const itemMap = {};
    items.forEach(item => {
      itemMap[item.sku_code] = item.item_id;
    });
    
    const now = new Date();
    
    // Create job orders
    const jobOrders = [
      {
        jo_number: 'JO-001',
        product_id: itemMap['PRD-GTM-001'],
        quantity_to_produce: 100,
        status: 'completed',
        created_date: '2025-01-16',
        completion_date: '2025-01-17T14:15:00',
        responsible_user: null,
        notes: null,
        created_at: now,
        updated_at: now
      },
      {
        jo_number: 'JO-002',
        product_id: itemMap['PRD-HRB-001'],
        quantity_to_produce: 50,
        status: 'in_progress',
        created_date: '2025-01-18',
        completion_date: null,
        responsible_user: null,
        notes: null,
        created_at: now,
        updated_at: now
      },
      {
        jo_number: 'JO-003',
        product_id: itemMap['PRD-GTM-001'],
        quantity_to_produce: 75,
        status: 'draft',
        created_date: '2025-01-19',
        completion_date: null,
        responsible_user: null,
        notes: null,
        created_at: now,
        updated_at: now
      }
    ];
    
    await queryInterface.bulkInsert('job_orders', jobOrders);
    
    // Get the inserted JO IDs
    const [insertedJOs] = await queryInterface.sequelize.query(
      `SELECT jo_id, jo_number FROM job_orders WHERE jo_number IN ('JO-001', 'JO-002', 'JO-003') ORDER BY jo_number`
    );
    
    const joMap = {};
    insertedJOs.forEach(jo => {
      joMap[jo.jo_number] = jo.jo_id;
    });
    
    // Create JO ingredients
    const joIngredients = [
      // JO-001 ingredients (Ginger Tea Mix - 100 units)
      {
        jo_id: joMap['JO-001'],
        item_id: itemMap['ING-TEA-001'],
        quantity_required: 3,
        quantity_consumed: 3,
        stock_before: 11,
        stock_after: 8,
        created_at: now
      },
      {
        jo_id: joMap['JO-001'],
        item_id: itemMap['ING-GIN-001'],
        quantity_required: 1.5,
        quantity_consumed: 1.5,
        stock_before: 2.5,
        stock_after: 1,
        created_at: now
      },
      {
        jo_id: joMap['JO-001'],
        item_id: itemMap['ING-SUG-001'],
        quantity_required: 0.5,
        quantity_consumed: 0.5,
        stock_before: 10.5,
        stock_after: 10,
        created_at: now
      },
      // JO-002 ingredients (Herbal Blend - 50 units)
      {
        jo_id: joMap['JO-002'],
        item_id: itemMap['ING-TEA-001'],
        quantity_required: 1,
        quantity_consumed: 1,
        stock_before: 8,
        stock_after: 7,
        created_at: now
      },
      {
        jo_id: joMap['JO-002'],
        item_id: itemMap['ING-GIN-001'],
        quantity_required: 0.25,
        quantity_consumed: 0.25,
        stock_before: 1,
        stock_after: 0.75,
        created_at: now
      },
      // JO-003 ingredients (Ginger Tea Mix - 75 units, draft)
      {
        jo_id: joMap['JO-003'],
        item_id: itemMap['ING-TEA-001'],
        quantity_required: 2.25,
        quantity_consumed: null,
        stock_before: 8,
        stock_after: 5.75,
        created_at: now
      },
      {
        jo_id: joMap['JO-003'],
        item_id: itemMap['ING-GIN-001'],
        quantity_required: 1.125,
        quantity_consumed: null,
        stock_before: 1,
        stock_after: -0.125,
        created_at: now
      },
      {
        jo_id: joMap['JO-003'],
        item_id: itemMap['ING-SUG-001'],
        quantity_required: 0.375,
        quantity_consumed: null,
        stock_before: 10,
        stock_after: 9.625,
        created_at: now
      }
    ];
    
    await queryInterface.bulkInsert('jo_ingredients', joIngredients);
  },

  async down(queryInterface, Sequelize) {
    // Delete JO ingredients first
    await queryInterface.bulkDelete('jo_ingredients', {
      jo_id: {
        [Sequelize.Op.in]: await queryInterface.sequelize.query(
          `SELECT jo_id FROM job_orders WHERE jo_number IN ('JO-001', 'JO-002', 'JO-003')`
        ).then(([results]) => results.map(r => r.jo_id))
      }
    }, {});
    
    // Delete job orders
    await queryInterface.bulkDelete('job_orders', {
      jo_number: {
        [Sequelize.Op.in]: ['JO-001', 'JO-002', 'JO-003']
      }
    }, {});
  }
};

