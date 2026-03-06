export const buildDispatchOrderToolRegistry = ({ dispatchOrderService }) => {
  const handlers = {
    query_dispatch_orders: async ({ args }) => {
      const {
        status,
        recipient_name,
        startDate,
        endDate,
        limit = 20,
        page = 1
      } = args;

      const result = await dispatchOrderService.getDispatchOrders({
        status,
        recipient_name,
        startDate,
        endDate,
        limit,
        page
      });

      const dispatchOrders = result.dispatchOrders || [];
      return {
        count: dispatchOrders.length,
        pagination: result.pagination,
        dispatch_orders: dispatchOrders.map((order) => ({
          do_id: order.do_id,
          do_number: order.do_number,
          status: order.status,
          recipient_name: order.recipient_name,
          recipient_type: order.recipient_type,
          dispatch_date: order.dispatch_date,
          lines_count: order.lines?.length || 0,
          created_at: order.created_at
        }))
      };
    },

    get_dispatch_order_details: async ({ args }) => {
      const { do_id } = args;
      const dispatchOrder = await dispatchOrderService.getDispatchOrderById(do_id);

      return {
        do_id: dispatchOrder.do_id,
        do_number: dispatchOrder.do_number,
        status: dispatchOrder.status,
        recipient_name: dispatchOrder.recipient_name,
        recipient_type: dispatchOrder.recipient_type,
        dispatch_date: dispatchOrder.dispatch_date,
        notes: dispatchOrder.notes,
        lines: (dispatchOrder.lines || []).map((line) => ({
          line_id: line.line_id,
          item_id: line.item_id,
          item_name: line.item?.name,
          qty_ordered: line.qty_ordered,
          qty_dispatched: line.qty_dispatched,
          qty_voided: line.qty_voided,
          qty_remaining: Math.max(0, parseFloat(line.qty_ordered || 0) - parseFloat(line.qty_dispatched || 0)),
          unit_of_measure: line.item?.unit_of_measure
        })),
        movements: (dispatchOrder.movements || []).map((movement) => ({
          movement_id: movement.movement_id,
          movement_type: movement.movement_type,
          quantity: movement.quantity,
          reference_id: movement.reference_id,
          created_at: movement.created_at || movement.timestamp
        }))
      };
    },

    create_dispatch_order: async ({ args, user }) => {
      const dispatchOrder = await dispatchOrderService.createDispatchOrder({
        recipient_name: args.recipient_name,
        recipient_type: args.recipient_type,
        dispatch_date: args.dispatch_date,
        reference_jo: args.reference_jo,
        notes: args.notes,
        lines: args.lines
      }, user.user_id);

      return {
        success: true,
        message: `Dispatch Order ${dispatchOrder.do_number} created successfully`,
        do_id: dispatchOrder.do_id,
        do_number: dispatchOrder.do_number,
        status: dispatchOrder.status
      };
    },

    confirm_dispatch_order: async ({ args, user }) => {
      const { do_id } = args;
      const dispatchOrder = await dispatchOrderService.confirmDispatchOrder(do_id, user.user_id);
      return {
        success: true,
        message: `Dispatch Order ${dispatchOrder.do_number} confirmed`,
        do_id: dispatchOrder.do_id,
        do_number: dispatchOrder.do_number,
        status: dispatchOrder.status
      };
    },

    dispatch_items: async ({ args, user }) => {
      const { do_id, lines } = args;
      const dispatchOrder = await dispatchOrderService.dispatchLines(do_id, lines, user.user_id);
      return {
        success: true,
        message: `Dispatch executed for ${dispatchOrder.do_number}`,
        do_id: dispatchOrder.do_id,
        do_number: dispatchOrder.do_number,
        status: dispatchOrder.status
      };
    },

    cancel_dispatch_order: async ({ args, user }) => {
      const { do_id, reason } = args;
      const dispatchOrder = await dispatchOrderService.cancelDispatchOrder(do_id, user.user_id, reason);
      return {
        success: true,
        message: `Dispatch Order ${dispatchOrder.do_number} cancelled`,
        do_id: dispatchOrder.do_id,
        do_number: dispatchOrder.do_number,
        status: dispatchOrder.status
      };
    }
  };

  return handlers;
};
