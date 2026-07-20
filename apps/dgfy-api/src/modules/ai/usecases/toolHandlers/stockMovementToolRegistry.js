export const buildStockMovementToolRegistry = ({ stockMovementService }) => {
  const handlers = {
    get_stock_movements: async ({ args }) => {
      const {
        item_id,
        movement_type,
        date_from,
        date_to,
        limit = 50
      } = args;

      const result = await stockMovementService.getStockMovements({
        item_id,
        movement_type,
        startDate: date_from,
        endDate: date_to,
        limit
      });

      const movements = Array.isArray(result) ? result : (result.movements || []);

      return {
        count: movements.length,
        movements: movements.map((movement) => ({
          movement_id: movement.movement_id,
          item_name: movement.item?.name,
          movement_type: movement.movement_type,
          quantity: movement.quantity,
          reference: movement.reference_id,
          reference_type: movement.reference_type,
          timestamp: movement.timestamp,
          created_by: movement.userResponsible?.username
        }))
      };
    },

    create_stock_adjustment: async ({ args, user }) => {
      const movementData = {
        item_id: args.item_id,
        quantity: args.quantity,
        movement_type: args.movement_type,
        notes: args.reason,
        batch_id: args.batch_id
      };

      const movement = await stockMovementService.createStockMovement(movementData, user.user_id);
      return {
        success: true,
        message: 'Stock adjustment recorded successfully',
        movement_id: movement.movement_id,
        new_stock_level: movement.newStockLevel
      };
    }
  };

  return handlers;
};
