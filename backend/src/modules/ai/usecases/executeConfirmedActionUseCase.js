const createUiResultFormatter = (logger) => {
  return (toolName, args, result) => {
    const uiResult = {
      success: true,
      summary: result.message || 'Action completed',
      details: {},
      impact: {},
      related_entity: result.related_entity || null
    };

    try {
      switch (toolName) {
        case 'create_item':
          uiResult.summary = `Item "${result.item.name}" created`;
          uiResult.impact = {
            'Stock Tracking': result.item.fifo_enabled ? 'Enabled (FIFO)' : 'Disabled',
            'Initial Stock': `0 ${result.item.unit_of_measure}`,
            'Max Capacity': `${args.max_capacity} ${result.item.unit_of_measure}`
          };
          uiResult.details = {
            SKU: result.item.sku_code,
            Category: result.item.category
          };
          break;

        case 'update_item':
          uiResult.summary = `Item "${result.item.name}" updated`;
          uiResult.details = result.details || {};
          break;

        case 'create_purchase_order': {
          uiResult.summary = `Purchase Order #${result.po_number} created`;
          const totalAmount = typeof result.total_amount === 'number' && !Number.isNaN(result.total_amount)
            ? `$${result.total_amount.toFixed(2)}`
            : '$0.00';
          uiResult.impact = {
            'Total Cost': totalAmount,
            'Items Ordered': String(args.items.length),
            Status: 'Pending'
          };
          uiResult.details = {
            Supplier: result.details?.Supplier || 'Unknown',
            Delivery: result.details?.['Expected Delivery'] || 'N/A'
          };
          break;
        }

        case 'receive_purchase_order':
          uiResult.summary = 'Purchase order received';
          uiResult.impact = {
            'Items Received': String(result.items_received || 0),
            'Batches Created': String(result.batches_created || 0),
            'Stock Status': 'Updated'
          };
          break;

        case 'create_job_order':
          uiResult.summary = 'Job order created';
          uiResult.impact = {
            'To Produce': `${args.quantity_to_produce} units`,
            Ingredients: 'Reserved',
            Status: 'In Progress'
          };
          uiResult.details = {
            Product: `ID: ${args.product_id}`
          };
          break;

        case 'complete_job_order':
          uiResult.summary = 'Production completed';
          uiResult.impact = {
            Produced: `${args.quantity_produced} units`,
            Ingredients: 'Consumed',
            'Finished Goods': 'Added to Stock'
          };
          uiResult.details = {
            'Job Order': `#${args.jo_id}`
          };
          break;

        case 'create_stock_adjustment': {
          const qty = args.quantity > 0 ? `+${args.quantity}` : `${args.quantity}`;
          uiResult.summary = 'Stock adjustment recorded';
          uiResult.impact = {
            Change: `${qty} units`,
            Type: args.movement_type,
            Reason: args.reason
          };
          break;
        }

        case 'create_supplier':
          uiResult.summary = 'Supplier registered';
          uiResult.impact = {
            Status: 'Active',
            'Lead Time': `${args.lead_time || 0} days`
          };
          uiResult.details = {
            Name: args.name,
            Contact: args.contact_person
          };
          break;

        case 'add_supplier_item':
          uiResult.summary = 'Item linked to supplier';
          uiResult.impact = {
            Price: `$${args.price_per_unit}/unit`,
            MOQ: args.moq
          };
          break;

        case 'import_csv_data':
          uiResult.summary = result.message || 'Data import completed';
          uiResult.impact = {
            Imported: String(result.stats?.imported ?? 0),
            Skipped: String(result.stats?.skipped ?? 0),
            Errors: String(result.stats?.errors ?? 0)
          };
          uiResult.details = result.details || {};
          uiResult.related_entity = result.related_entity || null;
          break;

        case 'create_inventory_folder':
          uiResult.summary = `Folder "${args.name}" created`;
          uiResult.impact = {
            'Folder Name': args.name,
            Status: 'Active'
          };
          if (args.description) {
            uiResult.details = { Description: args.description };
          }
          break;

        case 'bulk_create_inventory_folders':
          uiResult.summary = result.message || `${result.created_count} folders created`;
          uiResult.impact = {
            Created: String(result.created_count),
            Failed: String(result.failed_count),
            'Total Requested': String(result.total_requested)
          };
          if (result.created && result.created.length > 0) {
            uiResult.details = {
              Folders: result.created.map((folder) => folder.name).join(', ')
            };
          }
          if (result.failed_count > 0) {
            uiResult.success = false;
            uiResult.details = {
              ...uiResult.details,
              Failed: result.failed.map((folder) => `${folder.name}: ${folder.error}`).join('; ')
            };
          }
          break;

        case 'delete_inventory_folder':
          uiResult.summary = `Folder "${result.folder_name || args.folder_name}" deleted`;
          uiResult.impact = {
            'Folder Name': result.folder_name || args.folder_name,
            'Items Unassigned': String(result.unassigned_count || 0),
            Status: 'Deleted'
          };
          break;

        case 'bulk_delete_inventory_folders':
          uiResult.summary = result.message || `${result.deleted_count} folders deleted`;
          uiResult.impact = {
            Deleted: String(result.deleted_count),
            Failed: String(result.failed_count),
            'Total Requested': String(result.total_requested)
          };
          if (result.deleted && result.deleted.length > 0) {
            uiResult.details = {
              Folders: result.deleted.map((folder) => folder.name).join(', '),
              'Total Items Unassigned': String(
                result.deleted.reduce((sum, folder) => sum + (folder.unassigned_count || 0), 0)
              )
            };
          }
          if (result.failed_count > 0) {
            uiResult.success = false;
            uiResult.details = {
              ...uiResult.details,
              Failed: result.failed.map((folder) => `${folder.name}: ${folder.error}`).join('; ')
            };
          }
          break;

        default:
          uiResult.details = result.details || args;
      }
    } catch (error) {
      logger.warn(`Failed to format UI result for ${toolName}:`, error);
      uiResult.details = result;
    }

    return uiResult;
  };
};

export const buildExecuteConfirmedActionUseCase = ({
  getToolByName,
  hasPermission,
  getPermissionError,
  hasGranularPermission,
  getGranularPermissionError,
  executeTool,
  logger,
  formatResultForUI = createUiResultFormatter(logger),
  buildSuccessMessage = ({ uiResult, pendingAction }) =>
    `Action completed successfully: ${uiResult.summary || pendingAction.description}`,
  buildErrorMessage = ({ error }) => `Failed to execute action: ${error.message}`
}) => {
  return async (actionId, pendingAction, user) => {
    try {
      if (pendingAction.user_id !== user.user_id) {
        throw new Error('This action does not belong to you');
      }

      if (new Date(pendingAction.expires_at) < new Date()) {
        throw new Error('This action has expired. Please try again.');
      }

      const tool = getToolByName(pendingAction.toolName);

      if (tool) {
        if (tool.requiredRole && !hasPermission(user.role, tool.requiredRole)) {
          throw new Error(
            getPermissionError(
              pendingAction.toolName.replace(/_/g, ' '),
              tool.requiredRole
            )
          );
        }

        if (tool.requiredPermission && !hasGranularPermission(user, tool.requiredPermission)) {
          throw new Error(
            getGranularPermissionError(
              pendingAction.toolName.replace(/_/g, ' '),
              tool.requiredPermission
            )
          );
        }
      }

      const result = await executeTool(
        pendingAction.toolName,
        pendingAction.args,
        user
      );

      const uiResult = formatResultForUI(pendingAction.toolName, pendingAction.args, result);

      return {
        type: 'success',
        action_id: actionId,
        toolName: pendingAction.toolName,
        result: uiResult,
        message: buildSuccessMessage({
          actionId,
          pendingAction,
          user,
          uiResult
        })
      };
    } catch (error) {
      logger.error('Action execution error:', error);
      return {
        type: 'error',
        action_id: actionId,
        message: buildErrorMessage({
          actionId,
          pendingAction,
          user,
          error
        })
      };
    }
  };
};
