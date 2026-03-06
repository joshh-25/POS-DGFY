export const buildPurchaseOrderToolRegistry = ({ purchaseOrderService }) => {
  const handlers = {
    get_purchase_orders: async ({ args }) => {
      const {
        status,
        supplier_id,
        date_from,
        date_to,
        limit = 50
      } = args;

      const result = await purchaseOrderService.getPurchaseOrders({
        status,
        supplier_id,
        startDate: date_from,
        endDate: date_to,
        limit
      });
      const purchaseOrders = Array.isArray(result)
        ? result
        : (result?.purchase_orders || []);

      return {
        count: purchaseOrders.length,
        purchase_orders: purchaseOrders.map((purchaseOrder) => ({
          po_id: purchaseOrder.po_id,
          po_number: purchaseOrder.po_number,
          supplier_name: purchaseOrder.supplier_name || purchaseOrder.Supplier?.name,
          status: purchaseOrder.status,
          order_date: purchaseOrder.order_date,
          expected_delivery_date: purchaseOrder.expected_delivery_date,
          total_amount: purchaseOrder.total_amount,
          items_count: purchaseOrder.item_count || purchaseOrder.POLineItems?.length || 0
        }))
      };
    },

    create_purchase_order: async ({ args, user }) => {
      const poData = {
        supplier_id: args.supplier_id,
        expected_delivery_date: args.expected_delivery_date,
        notes: args.notes,
        line_items: args.items.map((item) => ({
          item_id: item.item_id,
          quantity_ordered: item.quantity,
          unit_price: item.unit_price
        }))
      };

      const purchaseOrder = await purchaseOrderService.createPurchaseOrder(poData, user.user_id);
      return {
        success: true,
        message: `Purchase Order ${purchaseOrder.po_number} created successfully`,
        details: {
          'PO Number': purchaseOrder.po_number,
          Supplier: typeof args.supplier_name === 'string' ? args.supplier_name : `ID: ${args.supplier_id}`,
          'Total Amount': `$${purchaseOrder.total_amount?.toFixed(2) || '0.00'}`,
          'Expected Delivery': purchaseOrder.expected_delivery_date ? new Date(purchaseOrder.expected_delivery_date).toLocaleDateString() : 'N/A',
          'Items Count': String(args.items.length)
        },
        related_entity: {
          type: 'purchase_order',
          id: purchaseOrder.po_id,
          label: purchaseOrder.po_number
        },
        po_id: purchaseOrder.po_id,
        po_number: purchaseOrder.po_number,
        total_amount: purchaseOrder.total_amount
      };
    },

    receive_purchase_order: async ({ args, user }) => {
      const { po_id, received_items } = args;
      const result = await purchaseOrderService.receivePurchaseOrder(
        po_id,
        received_items,
        user.user_id
      );

      return {
        success: true,
        message: 'Purchase Order received successfully',
        details: {
          'Items Received': String(result.itemsReceived || 0),
          'Batches Created': String(result.batchesCreated || 0),
          Status: 'Completed'
        },
        stats: {
          items_received: result.itemsReceived || 0,
          batches_created: result.batchesCreated || 0
        },
        related_entity: {
          type: 'purchase_order',
          id: po_id,
          label: `PO #${po_id}`
        },
        po_id,
        batches_created: result.batchesCreated,
        items_received: result.itemsReceived
      };
    }
  };

  return handlers;
};
