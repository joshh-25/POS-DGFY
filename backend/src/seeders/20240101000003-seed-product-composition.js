export default {
  async up(queryInterface, Sequelize) {
    // Get item IDs by SKU code
    const [items] = await queryInterface.sequelize.query(
      `SELECT item_id, sku_code FROM items WHERE sku_code IN ('PRD-GTM-001', 'PRD-HRB-001', 'ING-TEA-001', 'ING-GIN-001', 'ING-SUG-001')`
    );
    
    const itemMap = {};
    items.forEach(item => {
      itemMap[item.sku_code] = item.item_id;
    });
    
    const now = new Date();
    
    // Ginger Tea Mix (PRD-GTM-001) ingredients
    const gingerTeaMixComposition = [
      {
        product_id: itemMap['PRD-GTM-001'],
        ingredient_id: itemMap['ING-TEA-001'],
        quantity_required: 0.03,
        unit_of_measure: 'kg',
        created_at: now,
        updated_at: now
      },
      {
        product_id: itemMap['PRD-GTM-001'],
        ingredient_id: itemMap['ING-GIN-001'],
        quantity_required: 0.015,
        unit_of_measure: 'kg',
        created_at: now,
        updated_at: now
      },
      {
        product_id: itemMap['PRD-GTM-001'],
        ingredient_id: itemMap['ING-SUG-001'],
        quantity_required: 0.005,
        unit_of_measure: 'kg',
        created_at: now,
        updated_at: now
      }
    ];
    
    // Herbal Blend (PRD-HRB-001) ingredients
    const herbalBlendComposition = [
      {
        product_id: itemMap['PRD-HRB-001'],
        ingredient_id: itemMap['ING-TEA-001'],
        quantity_required: 0.02,
        unit_of_measure: 'kg',
        created_at: now,
        updated_at: now
      },
      {
        product_id: itemMap['PRD-HRB-001'],
        ingredient_id: itemMap['ING-GIN-001'],
        quantity_required: 0.005,
        unit_of_measure: 'kg',
        created_at: now,
        updated_at: now
      }
    ];
    
    await queryInterface.bulkInsert('product_composition', [
      ...gingerTeaMixComposition,
      ...herbalBlendComposition
    ]);
  },

  async down(queryInterface, Sequelize) {
    // Get product IDs
    const [products] = await queryInterface.sequelize.query(
      `SELECT item_id FROM items WHERE sku_code IN ('PRD-GTM-001', 'PRD-HRB-001')`
    );
    
    const productIds = products.map(p => p.item_id);
    
    if (productIds.length > 0) {
      await queryInterface.bulkDelete('product_composition', {
        product_id: {
          [Sequelize.Op.in]: productIds
        }
      }, {});
    }
  }
};

