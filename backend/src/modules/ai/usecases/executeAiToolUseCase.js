export const buildExecuteAiToolUseCase = ({
  logger,
  applyToolAudit,
  executeRegistryTool,
  auditService
}) => {
  return async ({ toolName, args, user }) => {
    const startTime = Date.now();
    const context = { tool: toolName, userId: user.user_id };

    logger.info(`AI_TOOL_START: ${toolName}`, { ...context, args });

    try {
      let result;
      switch (toolName) {
        // ============== DASHBOARD & STATS ==============
        case 'get_dashboard_stats':
        case 'get_low_stock_items':
        case 'get_inventory_value_breakdown':
        case 'get_items':
        case 'get_item_details':
        case 'create_item':
        case 'update_item':
        case 'delete_item':
        case 'get_suppliers':
        case 'get_supplier_details':
        case 'create_supplier':
        case 'update_supplier':
        case 'delete_supplier':
        case 'add_supplier_item':
        case 'get_purchase_orders':
        case 'create_purchase_order':
        case 'receive_purchase_order':
        case 'query_dispatch_orders':
        case 'get_dispatch_order_details':
        case 'create_dispatch_order':
        case 'confirm_dispatch_order':
        case 'dispatch_items':
        case 'cancel_dispatch_order':
        case 'get_system_settings':
        case 'update_system_settings':
        case 'get_users':
        case 'update_user_role':
        case 'toggle_user_status':
        case 'remove_user_from_company':
        case 'update_user_permissions':
        case 'create_user_invitation':
        case 'export_users_csv':
        case 'import_users_csv':
        case 'get_available_permissions':
        case 'generate_executive_summary':
        case 'get_job_orders':
        case 'get_job_order_details':
        case 'create_job_order':
        case 'complete_job_order':
        case 'get_stock_movements':
        case 'create_stock_adjustment':
        case 'get_expiry_alerts':
        case 'get_forecast':
        case 'search_documentation':
        case 'analyze_production_feasibility':
        case 'analyze_reorder_needs':
        case 'detect_anomalies':
        case 'get_advanced_analytics':
        case 'import_csv_data':
        case 'export_to_csv':
        case 'list_files':
        case 'create_folder':
        case 'move_file':
        case 'get_inventory_folders':
        case 'create_inventory_folder':
        case 'bulk_create_inventory_folders':
        case 'move_items_to_inventory_folder':
        case 'get_items_in_inventory_folder':
        case 'delete_inventory_folder':
        case 'bulk_delete_inventory_folders':
        case 'get_dispatch_stats':
        case 'get_dispatch_earnings':
        case 'update_dispatch_order':
        case 'archive_dispatch_order':
        case 'update_dispatch_line_sale_price':
        case 'export_dispatch_orders':
          result = await executeRegistryTool(toolName, args, user);
          break;

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }

      const duration = Date.now() - startTime;
      logger.info(`AI_TOOL_SUCCESS: ${toolName}`, { ...context, durationMs: duration });

      await applyToolAudit({
        toolName,
        args,
        user,
        result,
        durationMs: duration,
        auditService
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`AI_TOOL_ERROR: ${toolName}`, { ...context, durationMs: duration, error: error.message });
      throw error;
    }
  };
};
