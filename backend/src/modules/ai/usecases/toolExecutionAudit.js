const TOOL_AUDIT_MAPPING = Object.freeze({
  // ITEMS
  create_item: { action: 'CREATE', entityType: 'Item' },
  update_item: { action: 'UPDATE', entityType: 'Item' },
  delete_item: { action: 'DELETE', entityType: 'Item' },

  // SUPPLIERS
  create_supplier: { action: 'CREATE', entityType: 'Supplier' },
  update_supplier: { action: 'UPDATE', entityType: 'Supplier' },
  delete_supplier: { action: 'DELETE', entityType: 'Supplier' },
  add_supplier_item: { action: 'UPDATE', entityType: 'SupplierItem' },

  // PURCHASE ORDERS
  create_purchase_order: { action: 'CREATE', entityType: 'PurchaseOrder' },
  receive_purchase_order: { action: 'UPDATE', entityType: 'PurchaseOrder' },
  create_dispatch_order: { action: 'CREATE', entityType: 'DispatchOrder' },
  confirm_dispatch_order: { action: 'UPDATE', entityType: 'DispatchOrder' },
  dispatch_items: { action: 'UPDATE', entityType: 'DispatchOrder' },
  cancel_dispatch_order: { action: 'UPDATE', entityType: 'DispatchOrder' },

  // JOB ORDERS
  create_job_order: { action: 'CREATE', entityType: 'JobOrder' },
  complete_job_order: { action: 'UPDATE', entityType: 'JobOrder' },

  // STOCK MOVEMENTS
  create_stock_adjustment: { action: 'CREATE', entityType: 'StockMovement' },

  // USERS
  update_user_role: { action: 'UPDATE', entityType: 'User' },
  toggle_user_status: { action: 'UPDATE', entityType: 'User' },
  update_user_permissions: { action: 'UPDATE', entityType: 'User' },
  create_user_invitation: { action: 'CREATE', entityType: 'UserInvitation' },
  import_users_csv: { action: 'CREATE', entityType: 'BulkUserInvitation' },

  // SETTINGS
  update_system_settings: { action: 'UPDATE', entityType: 'SystemSettings' },

  // IMPORT
  import_csv_data: { action: 'CREATE', entityType: 'BulkImport' },

  // FILE MANAGEMENT
  create_folder: { action: 'CREATE', entityType: 'Folder' },
  move_file: { action: 'UPDATE', entityType: 'File' },

  // INVENTORY GROUPING
  create_inventory_folder: { action: 'CREATE', entityType: 'ItemFolder' },
  bulk_create_inventory_folders: { action: 'CREATE', entityType: 'BulkItemFolder' },
  delete_inventory_folder: { action: 'DELETE', entityType: 'ItemFolder' },
  bulk_delete_inventory_folders: { action: 'DELETE', entityType: 'BulkItemFolder' },
  move_items_to_inventory_folder: { action: 'UPDATE', entityType: 'Item' }
});

const resolveEntityIdFromResult = (result, entityType) => {
  if (!result) {
    return null;
  }

  if (entityType === 'Item' && result.item?.id) {
    return result.item.id;
  }
  if (entityType === 'Supplier' && result.supplier?.id) {
    return result.supplier.id;
  }
  if (entityType === 'PurchaseOrder' && result.po_id) {
    return result.po_id;
  }
  if (entityType === 'DispatchOrder' && result.do_id) {
    return result.do_id;
  }
  if (entityType === 'JobOrder' && result.jo_id) {
    return result.jo_id;
  }
  if (entityType === 'StockMovement' && result.movement_id) {
    return result.movement_id;
  }

  return null;
};

const resolveEntityIdFromArgs = (args = {}) => {
  if (args.item_id) return args.item_id;
  if (args.supplier_id) return args.supplier_id;
  if (args.po_id) return args.po_id;
  if (args.do_id) return args.do_id;
  if (args.jo_id) return args.jo_id;
  if (args.target_user_id) return args.target_user_id;
  return null;
};

const appendAuditMetadata = (result, auditConfig, entityId) => {
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    result._audit = {
      logged: true,
      action: auditConfig.action,
      entity: auditConfig.entityType,
      id: entityId
    };
  }
};

export const getAuditConfig = (toolName) => TOOL_AUDIT_MAPPING[toolName] || null;

export const applyToolAudit = async ({
  toolName,
  args,
  user,
  result,
  durationMs,
  auditService
}) => {
  const auditConfig = getAuditConfig(toolName);
  if (!auditConfig) {
    return;
  }

  const entityId = auditConfig.action === 'CREATE'
    ? resolveEntityIdFromResult(result, auditConfig.entityType)
    : resolveEntityIdFromArgs(args);

  await auditService.logAction(
    user.user_id,
    auditConfig.entityType,
    entityId,
    auditConfig.action,
    args,
    {
      tool: toolName,
      duration_ms: durationMs
    }
  );

  appendAuditMetadata(result, auditConfig, entityId);
};
