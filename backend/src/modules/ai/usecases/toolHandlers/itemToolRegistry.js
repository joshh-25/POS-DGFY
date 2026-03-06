const getStockStatus = (item) => {
  const current = parseFloat(item.current_stock) || 0;
  const min = parseFloat(item.min_threshold) || 0;
  const max = parseFloat(item.max_capacity) || 0;

  if (current <= min) return 'low';
  if (current > max) return 'overstock';
  return 'healthy';
};

const formatItem = (item) => {
  return {
    id: item.item_id,
    sku_code: item.sku_code,
    name: item.name,
    category: item.category,
    product_type: item.product_type,
    description: item.description,
    current_stock: item.current_stock,
    max_capacity: item.max_capacity,
    min_threshold: item.min_threshold,
    purchase_allowance: item.purchase_allowance,
    unit: item.unit_of_measure,
    batch_size: item.batch_size,
    yield_percentage: item.yield_percentage,
    processing_loss: item.processing_loss,
    cost_per_unit: item.cost_per_unit,
    fifo_enabled: item.fifo_enabled,
    status: item.status,
    stock_status: getStockStatus(item)
  };
};

export const buildItemToolRegistry = ({ itemService }) => {
  const handlers = {
    get_items: async ({ args }) => {
      const {
        search,
        category,
        status = 'active',
        stock_status: _stockStatus,
        limit = 50,
        page = 1
      } = args;

      const result = await itemService.getItems({
        search,
        category,
        status,
        limit,
        page
      });

      return {
        count: result.items.length,
        total: result.total,
        page: result.page,
        items: result.items.map(formatItem)
      };
    },

    get_item_details: async ({ args }) => {
      const { item_id, sku_code } = args;
      let item;

      if (item_id) {
        item = await itemService.getItemById(item_id);
      } else if (sku_code) {
        const result = await itemService.getItems({ search: sku_code, limit: 1 });
        item = result.items?.[0];
      } else {
        throw new Error('Please provide either item_id or sku_code');
      }

      if (!item) {
        throw new Error('Item not found');
      }

      const [batches, movements] = await Promise.all([
        itemService.getItemBatches(item.item_id),
        itemService.getItemStockHistory(item.item_id, { limit: 10 })
      ]);

      return {
        ...formatItem(item),
        suppliers: item.suppliers?.map((supplier) => ({
          supplier_id: supplier.supplier_id,
          name: supplier.name,
          moq: supplier.moq,
          price_per_unit: supplier.price_per_unit
        })) || [],
        batches: batches.map((batch) => ({
          batch_id: batch.batch_id,
          quantity: batch.quantity,
          cost_per_unit: batch.cost_per_unit,
          received_date: batch.received_date,
          expiry_date: batch.expiry_date,
          quantity_consumed: batch.quantity_consumed
        })),
        recent_movements: movements.map((movement) => ({
          type: movement.movement_type,
          quantity: movement.quantity,
          date: movement.timestamp,
          reference: movement.reference_id
        }))
      };
    },

    create_item: async ({ args, user }) => {
      const itemData = {
        sku_code: args.sku_code,
        name: args.name,
        category: args.category,
        product_type: args.product_type,
        description: args.description,
        max_capacity: args.max_capacity,
        unit_of_measure: args.unit_of_measure,
        cost_per_unit: args.cost_per_unit || 0,
        fifo_enabled: args.fifo_enabled !== false,
        status: 'active'
      };

      const item = await itemService.createItem(itemData, user.user_id);
      return {
        success: true,
        message: `Item "${item.name}" created successfully`,
        details: {
          SKU: item.sku_code,
          Name: item.name,
          Category: item.category,
          Unit: item.unit_of_measure,
          'Initial Stock': '0'
        },
        related_entity: {
          type: 'item',
          id: item.item_id,
          label: item.sku_code
        },
        item: formatItem(item)
      };
    },

    update_item: async ({ args, user }) => {
      const { item_id, ...updates } = args;
      const item = await itemService.updateItem(item_id, updates, user.user_id);

      const details = Object.entries(updates).reduce((acc, [key, value]) => {
        if (['updated_at', 'updated_by'].includes(key)) return acc;

        const readableKey = key
          .split('_')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        acc[readableKey] = String(value);
        return acc;
      }, {});

      return {
        success: true,
        message: `Item "${item.name}" updated successfully`,
        details,
        related_entity: {
          type: 'item',
          id: item.item_id,
          label: item.sku_code
        },
        item: formatItem(item)
      };
    },

    delete_item: async ({ args, user }) => {
      const { item_id, reason } = args;
      await itemService.deleteItem(item_id, user.user_id, reason);
      return {
        success: true,
        message: 'Item has been soft-deleted',
        details: {
          'Item ID': String(item_id),
          Reason: reason || 'No reason provided',
          Status: 'Inactive'
        },
        note: 'The item can be restored by an administrator if needed'
      };
    }
  };

  return handlers;
};
