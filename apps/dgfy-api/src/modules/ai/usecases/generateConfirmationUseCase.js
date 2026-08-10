import { v4 as uuidv4 } from 'uuid';

export const buildGenerateConfirmationUseCase = ({
  generateId = uuidv4,
  nowProvider = () => new Date()
} = {}) => {
  return async (toolName, args, user, conversationId) => {
    const actionId = generateId();

    let description;
    let details;

    switch (toolName) {
      case 'create_item':
        description = `Create new item "${args.name}" (${args.sku_code})`;
        details = {
          sku_code: args.sku_code,
          name: args.name,
          category: args.category,
          max_capacity: args.max_capacity,
          unit: args.unit_of_measure,
          auto_calculated: {
            min_threshold: Math.round(args.max_capacity * 0.4),
            purchase_allowance: Math.round(args.max_capacity * 0.2)
          }
        };
        break;

      case 'update_item':
        description = `Update item ID ${args.item_id}`;
        details = { ...args };
        break;

      case 'delete_item':
        description = `Delete item ID ${args.item_id}`;
        details = {
          item_id: args.item_id,
          reason: args.reason,
          note: 'This is a soft delete. The item can be restored later.'
        };
        break;

      case 'create_purchase_order': {
        const totalCalc = args.items.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unit_price || 0)), 0);
        description = `Create Purchase Order for ${args.supplier_name || `supplier ID ${args.supplier_id}`}`;
        details = {
          supplier_id: args.supplier_id,
          supplier_name: args.supplier_name,
          items: args.items,
          item_count: args.items.length,
          total_amount: totalCalc,
          expected_delivery: args.expected_delivery_date
        };
        break;
      }

      case 'receive_purchase_order':
        description = `Receive Purchase Order #${args.po_id}`;
        details = {
          po_id: args.po_id,
          items_to_receive: args.received_items?.length || 'all',
          note: 'This will create FIFO batches and update stock levels.'
        };
        break;

      case 'create_job_order':
        description = `Create Job Order to produce ${args.quantity_to_produce} units of product ID ${args.product_id}`;
        details = {
          product_id: args.product_id,
          quantity: args.quantity_to_produce,
          note: 'This will reserve ingredients for production.'
        };
        break;

      case 'complete_job_order':
        description = `Complete Job Order #${args.jo_id}`;
        details = {
          jo_id: args.jo_id,
          quantity_produced: args.quantity_produced,
          expiry_date: args.expiry_date,
          note: 'This will consume ingredients via FIFO and create finished goods batch.'
        };
        break;

      case 'create_stock_adjustment':
        description = `Stock adjustment for item ID ${args.item_id}: ${args.quantity > 0 ? '+' : ''}${args.quantity}`;
        details = {
          item_id: args.item_id,
          quantity: args.quantity,
          type: args.movement_type,
          reason: args.reason
        };
        break;

      case 'import_csv_data':
        description = `Import ${args.entity_type} from CSV data`;
        details = {
          entity_type: args.entity_type,
          csv_content: args.csv_content,
          options: args.options,
          _confirmed: true
        };
        break;

      case 'create_supplier':
        description = `Register new supplier "${args.name}"`;
        details = { ...args };
        break;

      case 'update_supplier':
        description = `Update details for supplier ID ${args.supplier_id}`;
        details = { ...args };
        break;

      case 'delete_supplier':
        description = `Delete supplier ID ${args.supplier_id}`;
        details = {
          supplier_id: args.supplier_id,
          reason: args.reason,
          note: 'This will soft-delete the supplier.'
        };
        break;

      case 'add_supplier_item':
        description = `Link item ID ${args.item_id} to supplier ID ${args.supplier_id}`;
        details = {
          item_id: args.item_id,
          supplier_id: args.supplier_id,
          price: args.price_per_unit,
          moq: args.moq
        };
        break;

      case 'update_system_settings':
        description = 'Update system configuration settings';
        details = {
          updates: args.updates,
          count: Object.keys(args.updates || {}).length
        };
        break;

      case 'update_user_role':
        description = `Change user ID ${args.target_user_id} role to ${args.new_role}`;
        details = { ...args };
        break;

      case 'toggle_user_status':
        description = `${args.is_active ? 'Reactivate' : 'Deactivate'} user ID ${args.target_user_id}`;
        details = { ...args };
        break;

      case 'update_user_permissions':
        description = `Update permissions for user ID ${args.target_user_id}`;
        details = {
          target_user_id: args.target_user_id,
          permission_count: args.permissions?.length || 0,
          permissions: args.permissions,
          note: 'This will replace the user\'s current permissions with the new set.'
        };
        break;

      case 'create_user_invitation':
        description = `Send invitation to ${args.email} as ${args.role}`;
        details = {
          email: args.email,
          role: args.role,
          note: 'An email invitation will be sent with a link to set up their account. The invitation expires in 7 days.'
        };
        break;

      case 'import_users_csv':
        description = 'Import users from CSV and send invitations';
        details = {
          csv_content: args.csv_content,
          total_rows: args._preview?.total || 'multiple',
          _confirmed: true,
          note: 'Invitation emails will be sent to each valid email address in the CSV.'
        };
        break;

      case 'create_folder':
        description = `Create new folder: "${args.path}"`;
        details = {
          path: args.path,
          location: `uploads/${args.path}`
        };
        break;

      case 'move_file':
        description = `Move "${args.source}" to "${args.destination}"`;
        details = {
          from: args.source,
          to: args.destination,
          note: 'This operation is within the uploads directory.'
        };
        break;

      case 'create_inventory_folder':
        description = `Create inventory folder "${args.name}"`;
        details = {
          name: args.name,
          description: args.description || '(none)',
          note: 'This creates a logical folder to organize inventory items.'
        };
        break;

      case 'move_items_to_inventory_folder':
        description = `Move ${args.item_ids?.length || 0} item(s) to folder "${args.folder_name}"`;
        details = {
          folder_name: args.folder_name,
          item_count: args.item_ids?.length || 0,
          item_ids: args.item_ids
        };
        break;

      case 'bulk_create_inventory_folders':
        description = `Create ${args.folders.length} inventory folders`;
        details = {
          folder_count: args.folders.length,
          folders: args.folders.map((folder) => ({
            name: folder.name,
            description: folder.description || '(none)'
          })),
          note: 'All folders will be created in a single operation.'
        };
        break;

      case 'delete_inventory_folder':
        description = `Delete inventory folder "${args.folder_name}"`;
        details = {
          folder_name: args.folder_name,
          note: 'Items inside this folder will be automatically unassigned (moved to uncategorized).'
        };
        break;

      case 'bulk_delete_inventory_folders':
        description = `Delete ${args.folder_names.length} inventory folders`;
        details = {
          folder_count: args.folder_names.length,
          folder_names: args.folder_names,
          note: 'All items inside these folders will be automatically unassigned. This action cannot be undone.'
        };
        break;

      default:
        description = `Execute ${toolName.replace(/_/g, ' ')}`;
        details = args;
    }

    return {
      action_id: actionId,
      toolName,
      args,
      description,
      details,
      user_id: user.user_id,
      conversation_id: conversationId,
      created_at: nowProvider().toISOString(),
      expires_at: new Date(nowProvider().getTime() + 5 * 60 * 1000).toISOString()
    };
  };
};
