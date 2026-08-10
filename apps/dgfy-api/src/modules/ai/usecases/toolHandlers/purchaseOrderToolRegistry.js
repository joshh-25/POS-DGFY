const parsePositiveInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

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
      const { po_id, location_id, received_items } = args;
      const normalizedPoId = parsePositiveInt(po_id);
      const normalizedLocationId = parsePositiveInt(location_id);
      if (!normalizedPoId) {
        const error = new Error('po_id is required and must be a positive integer');
        error.statusCode = 422;
        throw error;
      }
      if (!normalizedLocationId) {
        const error = new Error('location_id is required and must be a positive integer');
        error.statusCode = 422;
        throw error;
      }
      if (!Array.isArray(received_items) || received_items.length === 0) {
        const error = new Error('received_items must contain at least one line');
        error.statusCode = 422;
        throw error;
      }
      const receiptData = {
        location_id: normalizedLocationId,
        line_items: received_items.map((item) => ({
          line_item_id: parsePositiveInt(item.line_item_id),
          quantity_received: Number(item.received_quantity || 0),
          quality_check_status: 'passed',
          expiry_date: item.expiry_date || null
        }))
      };
      const invalidLine = receiptData.line_items.find((item) => !item.line_item_id || !(Number.isFinite(item.quantity_received) && item.quantity_received > 0));
      if (invalidLine) {
        const error = new Error('received_items entries require positive line_item_id and received_quantity');
        error.statusCode = 422;
        throw error;
      }
      const result = await purchaseOrderService.receivePurchaseOrder(
        normalizedPoId,
        receiptData,
        user.user_id
      );

      return {
        success: true,
        message: 'Purchase Order received successfully',
        details: {
          'Items Received': String(receiptData.line_items.length),
          Location: String(location_id),
          Status: result.status || 'Completed'
        },
        stats: {
          items_received: receiptData.line_items.length
        },
        related_entity: {
          type: 'purchase_order',
          id: normalizedPoId,
          label: `PO #${normalizedPoId}`
        },
        po_id: normalizedPoId,
        items_received: receiptData.line_items.length
      };
    }
  };

  return handlers;
};
