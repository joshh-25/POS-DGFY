export default {
  async up(queryInterface) {
    // Get item IDs by SKU code
    const [items] = await queryInterface.sequelize.query(
      `SELECT item_id, sku_code FROM items WHERE sku_code IN ('ING-SUG-001', 'ING-SAL-001', 'ING-GIN-001', 'ING-TEA-001', 'PRD-GTM-001', 'PKG-BTL-001', 'PKG-STK-001', 'PKG-BOX-001')`
    );
    
    const itemMap = {};
    items.forEach(item => {
      itemMap[item.sku_code] = item.item_id;
    });
    
    // Get PO IDs by PO number
    const [pos] = await queryInterface.sequelize.query(
      `SELECT po_id, po_number FROM purchase_orders WHERE po_number IN ('PO-001', 'PO-002', 'PO-004')`
    );
    
    const poMap = {};
    pos.forEach(po => {
      poMap[po.po_number] = po.po_id;
    });
    
    // Get JO IDs by JO number
    const [jos] = await queryInterface.sequelize.query(
      `SELECT jo_id, jo_number FROM job_orders WHERE jo_number IN ('JO-001')`
    );
    
    const joMap = {};
    jos.forEach(jo => {
      joMap[jo.jo_number] = jo.jo_id;
    });
    
    const stockMovements = [
      {
        item_id: itemMap['ING-SUG-001'],
        movement_type: 'purchase_receipt',
        quantity: 20,
        from_location: null,
        to_location: 'Main Warehouse',
        reference_id: 'PO-001',
        reference_type: 'PO',
        user_responsible: null,
        notes: 'Received from Supplier A',
        loss_reason: null,
        timestamp: '2025-01-18T10:30:00',
        created_at: '2025-01-18T10:30:00'
      },
      {
        item_id: itemMap['ING-GIN-001'],
        movement_type: 'production_consumption',
        quantity: 1.5,
        from_location: 'Main Warehouse',
        to_location: 'Production Floor',
        reference_id: 'JO-001',
        reference_type: 'JO',
        user_responsible: null,
        notes: 'Consumed for Ginger Tea Mix production',
        loss_reason: null,
        timestamp: '2025-01-17T14:15:00',
        created_at: '2025-01-17T14:15:00'
      },
      {
        item_id: itemMap['ING-SUG-001'],
        movement_type: 'calculated_loss',
        quantity: 2,
        from_location: 'Main Warehouse',
        to_location: null,
        reference_id: null,
        reference_type: 'MANUAL',
        user_responsible: null,
        notes: 'Found damaged packaging during inspection',
        loss_reason: 'spoilage',
        timestamp: '2025-01-16T09:45:00',
        created_at: '2025-01-16T09:45:00'
      },
      {
        item_id: itemMap['ING-GIN-001'],
        movement_type: 'purchase_receipt',
        quantity: 3,
        from_location: null,
        to_location: 'Main Warehouse',
        reference_id: 'PO-002',
        reference_type: 'PO',
        user_responsible: null,
        notes: 'Received from Supplier B',
        loss_reason: null,
        timestamp: '2025-01-15T15:20:00',
        created_at: '2025-01-15T15:20:00'
      },
      {
        item_id: itemMap['ING-TEA-001'],
        movement_type: 'production_consumption',
        quantity: 3,
        from_location: 'Main Warehouse',
        to_location: 'Production Floor',
        reference_id: 'JO-001',
        reference_type: 'JO',
        user_responsible: null,
        notes: 'Consumed for Ginger Tea Mix production',
        loss_reason: null,
        timestamp: '2025-01-17T14:15:00',
        created_at: '2025-01-17T14:15:00'
      },
      {
        item_id: itemMap['PRD-GTM-001'],
        movement_type: 'purchase_receipt',
        quantity: 100,
        from_location: 'Production Floor',
        to_location: 'Main Warehouse',
        reference_id: 'JO-001',
        reference_type: 'JO',
        user_responsible: null,
        notes: 'Finished production batch',
        loss_reason: null,
        timestamp: '2025-01-17T16:00:00',
        created_at: '2025-01-17T16:00:00'
      },
      {
        item_id: itemMap['PKG-BTL-001'],
        movement_type: 'purchase_receipt',
        quantity: 50,
        from_location: null,
        to_location: 'Main Warehouse',
        reference_id: 'PO-004',
        reference_type: 'PO',
        user_responsible: null,
        notes: 'Partial delivery from PackagePro',
        loss_reason: null,
        timestamp: '2025-01-14T11:00:00',
        created_at: '2025-01-14T11:00:00'
      },
      {
        item_id: itemMap['PKG-STK-001'],
        movement_type: 'purchase_receipt',
        quantity: 500,
        from_location: null,
        to_location: 'Main Warehouse',
        reference_id: 'PO-004',
        reference_type: 'PO',
        user_responsible: null,
        notes: 'Full delivery from PackagePro',
        loss_reason: null,
        timestamp: '2025-01-14T11:00:00',
        created_at: '2025-01-14T11:00:00'
      },
      {
        item_id: itemMap['PKG-BOX-001'],
        movement_type: 'transfer',
        quantity: 10,
        from_location: 'Main Warehouse',
        to_location: 'Shipping Area',
        reference_id: null,
        reference_type: 'MANUAL',
        user_responsible: null,
        notes: 'Transfer for order packing',
        loss_reason: null,
        timestamp: '2025-01-13T09:30:00',
        created_at: '2025-01-13T09:30:00'
      },
      {
        item_id: itemMap['ING-SAL-001'],
        movement_type: 'return',
        quantity: 2,
        from_location: 'Production Floor',
        to_location: 'Main Warehouse',
        reference_id: null,
        reference_type: 'RETURN',
        user_responsible: null,
        notes: 'Unused from production batch',
        loss_reason: null,
        timestamp: '2025-01-12T16:45:00',
        created_at: '2025-01-12T16:45:00'
      }
    ];
    
    await queryInterface.bulkInsert('stock_movements', stockMovements);
  },

  async down(queryInterface, Sequelize) {
    // Delete stock movements by reference IDs (non-null)
    await queryInterface.bulkDelete('stock_movements', {
      reference_id: {
        [Sequelize.Op.in]: ['PO-001', 'PO-002', 'PO-004', 'JO-001']
      }
    }, {});
    
    // Delete stock movements with null reference_id
    await queryInterface.bulkDelete('stock_movements', {
      reference_id: {
        [Sequelize.Op.is]: null
      }
    }, {});
    
    // Also delete by specific item SKU codes if needed
    const [items] = await queryInterface.sequelize.query(
      `SELECT item_id FROM items WHERE sku_code IN ('ING-SUG-001', 'ING-SAL-001', 'ING-GIN-001', 'ING-TEA-001', 'PRD-GTM-001', 'PKG-BTL-001', 'PKG-STK-001', 'PKG-BOX-001')`
    );
    
    const itemIds = items.map(i => i.item_id);
    
    if (itemIds.length > 0) {
      await queryInterface.bulkDelete('stock_movements', {
        item_id: {
          [Sequelize.Op.in]: itemIds
        }
      }, {});
    }
  }
};

