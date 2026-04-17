const parsePositiveInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const buildJobOrderToolRegistry = ({ jobOrderService, itemService, logger }) => {
  const handlers = {
    get_job_orders: async ({ args }) => {
      const { status, limit = 50 } = args;
      const result = await jobOrderService.getJobOrders({
        status,
        limit
      });

      return {
        count: result.length,
        job_orders: result.map((jobOrder) => ({
          jo_id: jobOrder.jo_id,
          jo_number: jobOrder.jo_number,
          product_name: jobOrder.Product?.name,
          quantity_to_produce: jobOrder.quantity_to_produce,
          quantity_produced: jobOrder.quantity_produced,
          status: jobOrder.status,
          responsible_user: jobOrder.ResponsibleUser?.username
        }))
      };
    },

    create_job_order: async ({ args, user }) => {
      let ingredients = args.ingredients;

      if (!ingredients && args.product_id) {
        try {
          const product = await itemService.getItemById(args.product_id);

          if (product && product.ingredients && product.ingredients.length > 0) {
            const quantityToProduce = parseFloat(args.quantity_to_produce || args.quantity || 1);

            ingredients = product.ingredients.map((ingredient) => ({
              item_id: ingredient.item_id,
              quantity_required: parseFloat(ingredient.quantity) * quantityToProduce,
              unit_of_measure: ingredient.unit_of_measure
            }));

            logger.info(`[createJobOrder] Auto-populated ${ingredients.length} ingredients for Product ${args.product_id}`);
          } else {
            logger.warn(`[createJobOrder] Product ${args.product_id} has no ingredients defined.`);
          }
        } catch (error) {
          logger.warn(`[createJobOrder] Failed to auto-populate ingredients: ${error.message}`);
        }
      }

      const joData = {
        product_id: args.product_id,
        quantity_to_produce: args.quantity_to_produce || args.quantity,
        notes: args.notes,
        status: 'in_progress',
        ingredients
      };

      const jobOrder = await jobOrderService.createJobOrder(joData, user.user_id);

      let productName = `ID: ${args.product_id}`;
      try {
        const product = await itemService.getItemById(args.product_id);
        if (product) {
          productName = product.name;
        }
      } catch {
        // Best effort only; response already has a fallback label.
      }

      const quantityStr = String(args.quantity_to_produce || args.quantity || jobOrder.quantity_to_produce || 0);

      return {
        success: true,
        message: `Job Order ${jobOrder.jo_number} created successfully`,
        details: {
          'JO Number': jobOrder.jo_number,
          Product: productName,
          Quantity: quantityStr,
          Status: 'In Progress'
        },
        impact: {
          to_produce: `${quantityStr} units`,
          ingredients: 'Reserved'
        },
        related_entity: {
          type: 'job_order',
          id: jobOrder.jo_id,
          label: jobOrder.jo_number
        },
        jo_id: jobOrder.jo_id,
        jo_number: jobOrder.jo_number,
        ingredients_reserved: jobOrder.ingredientsReserved
      };
    },

    complete_job_order: async ({ args, user }) => {
      const {
        jo_id,
        quantity_produced,
        expiry_date,
        source_location_id,
        destination_location_id
      } = args;
      const normalizedJoId = parsePositiveInt(jo_id);
      const normalizedSourceLocationId = parsePositiveInt(source_location_id);
      const normalizedDestinationLocationId = parsePositiveInt(destination_location_id);
      const normalizedQuantityProduced = Number(quantity_produced);
      if (!normalizedJoId) {
        const error = new Error('jo_id is required and must be a positive integer');
        error.statusCode = 422;
        throw error;
      }
      if (!(Number.isFinite(normalizedQuantityProduced) && normalizedQuantityProduced > 0)) {
        const error = new Error('quantity_produced is required and must be a positive number');
        error.statusCode = 422;
        throw error;
      }
      if (!normalizedSourceLocationId || !normalizedDestinationLocationId) {
        const error = new Error('source_location_id and destination_location_id are required and must be positive integers');
        error.statusCode = 422;
        throw error;
      }
      if (normalizedSourceLocationId === normalizedDestinationLocationId) {
        const error = new Error('source_location_id and destination_location_id must be different');
        error.statusCode = 422;
        throw error;
      }

      const result = await jobOrderService.completeJobOrder(
        normalizedJoId,
        user.user_id,
        expiry_date,
        null,
        normalizedQuantityProduced,
        null,
        normalizedSourceLocationId,
        normalizedDestinationLocationId
      );

      return {
        success: true,
        message: 'Job Order completed successfully',
        details: {
          'Produced Quantity': String(normalizedQuantityProduced),
          'Source Location': String(normalizedSourceLocationId),
          'Destination Location': String(normalizedDestinationLocationId),
          'Expiry Date': expiry_date ? new Date(expiry_date).toLocaleDateString() : 'Auto-calculated',
          'Ingredients Consumed': String(result.ingredientsConsumed || 0)
        },
        related_entity: {
          type: 'job_order',
          id: normalizedJoId,
          label: `JO #${normalizedJoId}`
        },
        jo_id: normalizedJoId,
        quantity_produced: normalizedQuantityProduced,
        batch_created: result.batchId,
        ingredients_consumed: result.ingredientsConsumed
      };
    },

    get_job_order_details: async ({ args }) => {
      const { jo_id } = args;
      const jobOrder = await jobOrderService.getJobOrderById(jo_id);

      return {
        success: true,
        job_order: {
          jo_id: jobOrder.jo_id,
          jo_number: jobOrder.jo_number,
          product_name: jobOrder.product?.name,
          quantity_to_produce: jobOrder.quantity_to_produce,
          quantity_produced: jobOrder.quantity_produced,
          status: jobOrder.status,
          responsible_user: jobOrder.responsibleUser?.username,
          created_at: jobOrder.created_at,
          ingredients: jobOrder.ingredients?.map(ing => ({
            item_id: ing.item_id,
            item_name: ing.item?.name,
            quantity_required: ing.quantity_required,
            quantity_consumed: ing.quantity_consumed,
            unit_of_measure: ing.unit_of_measure
          })) || [],
          consumed_batches: jobOrder.ingredients?.filter(ing => ing.dataValues.batchTransactions?.length > 0).map(ing => ({
            item_name: ing.item?.name,
            batches: ing.dataValues.batchTransactions.map(bt => ({
              batch_number: bt.batch?.po_number || bt.batch?.batch_id || `BTCH-${bt.batch_id}`,
              quantity: bt.quantity
            }))
          })) || []
        }
      };
    }
  };

  return handlers;
};
