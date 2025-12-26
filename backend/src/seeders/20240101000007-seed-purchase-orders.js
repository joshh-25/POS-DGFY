export default {
  async up(queryInterface, Sequelize) {
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
      `SELECT item_id, sku_code FROM items WHERE sku_code IN ('ING-SUG-001', 'ING-SAL-001', 'ING-GIN-001', 'PKG-BTL-001', 'PKG-STK-001')`
    );
    
    const itemMap = {};
    items.forEach(item => {
      itemMap[item.sku_code] = item.item_id;
    });
    
    const now = new Date();
    
    // Create purchase orders
    const purchaseOrders = [
      {
        po_number: 'PO-001',
        supplier_id: supplierMap['Supplier A - Premium Foods'],
        order_date: '2025-01-15',
        expected_delivery_date: '2025-01-18',
        received_date: '2025-01-18',
        status: 'received',
        subtotal: 65,
        discount: 3.25,
        total_amount: 61.75,
        delivery_rating: 5,
        notes: 'Excellent quality, delivered on time',
        created_at: now,
        updated_at: now
      },
      {
        po_number: 'PO-002',
        supplier_id: supplierMap['Supplier B - Organic Spices'],
        order_date: '2025-01-12',
        expected_delivery_date: '2025-01-17',
        received_date: '2025-01-15',
        status: 'received',
        subtotal: 45,
        discount: 0,
        total_amount: 45,
        delivery_rating: 4,
        notes: 'Good quality ginger powder',
        created_at: now,
        updated_at: now
      },
      {
        po_number: 'PO-003',
        supplier_id: supplierMap['Supplier A - Premium Foods'],
        order_date: '2025-01-19',
        expected_delivery_date: '2025-01-22',
        received_date: null,
        status: 'pending',
        subtotal: 37.5,
        discount: 0,
        total_amount: 37.5,
        delivery_rating: null,
        notes: '',
        created_at: now,
        updated_at: now
      },
      {
        po_number: 'PO-004',
        supplier_id: supplierMap['Supplier C - PackagePro'],
        order_date: '2025-01-10',
        expected_delivery_date: '2025-01-17',
        received_date: null,
        status: 'partial',
        subtotal: 100,
        discount: 5,
        total_amount: 95,
        delivery_rating: null,
        notes: 'Partial delivery - remaining bottles expected next week',
        created_at: now,
        updated_at: now
      }
    ];
    
    // Insert purchase orders
    await queryInterface.bulkInsert('purchase_orders', purchaseOrders);
    
    // Get the inserted PO IDs
    const [insertedPOs] = await queryInterface.sequelize.query(
      `SELECT po_id, po_number FROM purchase_orders WHERE po_number IN ('PO-001', 'PO-002', 'PO-003', 'PO-004') ORDER BY po_number`
    );
    
    const poMap = {};
    insertedPOs.forEach(po => {
      poMap[po.po_number] = po.po_id;
    });
    
    // Create PO line items
    const lineItems = [
      // PO-001 line items
      {
        po_id: poMap['PO-001'],
        item_id: itemMap['ING-SUG-001'],
        quantity_ordered: 20,
        quantity_received: 20,
        unit_price: 2.5,
        total_price: 50,
        quality_check_status: 'passed',
        notes: null,
        created_at: now,
        updated_at: now
      },
      {
        po_id: poMap['PO-001'],
        item_id: itemMap['ING-SAL-001'],
        quantity_ordered: 10,
        quantity_received: 10,
        unit_price: 1.5,
        total_price: 15,
        quality_check_status: 'passed',
        notes: null,
        created_at: now,
        updated_at: now
      },
      // PO-002 line items
      {
        po_id: poMap['PO-002'],
        item_id: itemMap['ING-GIN-001'],
        quantity_ordered: 3,
        quantity_received: 3,
        unit_price: 15,
        total_price: 45,
        quality_check_status: 'passed',
        notes: null,
        created_at: now,
        updated_at: now
      },
      // PO-003 line items
      {
        po_id: poMap['PO-003'],
        item_id: itemMap['ING-SUG-001'],
        quantity_ordered: 15,
        quantity_received: 0,
        unit_price: 2.5,
        total_price: 37.5,
        quality_check_status: 'pending',
        notes: null,
        created_at: now,
        updated_at: now
      },
      // PO-004 line items
      {
        po_id: poMap['PO-004'],
        item_id: itemMap['PKG-BTL-001'],
        quantity_ordered: 100,
        quantity_received: 50,
        unit_price: 0.75,
        total_price: 75,
        quality_check_status: 'passed',
        notes: null,
        created_at: now,
        updated_at: now
      },
      {
        po_id: poMap['PO-004'],
        item_id: itemMap['PKG-STK-001'],
        quantity_ordered: 500,
        quantity_received: 500,
        unit_price: 0.05,
        total_price: 25,
        quality_check_status: 'passed',
        notes: null,
        created_at: now,
        updated_at: now
      }
    ];
    
    await queryInterface.bulkInsert('po_line_items', lineItems);
  },

  async down(queryInterface, Sequelize) {
    // Get PO IDs first
    const [poResults] = await queryInterface.sequelize.query(
      `SELECT po_id FROM purchase_orders WHERE po_number IN ('PO-001', 'PO-002', 'PO-003', 'PO-004')`
    );
    const poIds = poResults.map(r => r.po_id);
    
    // Delete line items if POs exist
    if (poIds.length > 0) {
      await queryInterface.bulkDelete('po_line_items', {
        po_id: {
          [Sequelize.Op.in]: poIds
        }
      }, {});
    }
    
    // Delete purchase orders
    await queryInterface.bulkDelete('purchase_orders', {
      po_number: {
        [Sequelize.Op.in]: ['PO-001', 'PO-002', 'PO-003', 'PO-004']
      }
    }, {});
  }
};

