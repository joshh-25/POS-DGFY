import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  X,
  Clock,
  ShoppingCart,
  Package,
  Clipboard,
  Truck,
  Edit,
  Trash2,
  Plus,
  Building2,
  Settings,
  UserCog,
  UserX,
  Link,
  Send,
  Ban,
  Archive,
  DollarSign,
  Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Map action types to icons
const ACTION_ICONS = {
  // Purchase Orders
  create_purchase_order: ShoppingCart,
  receive_purchase_order: Truck,
  // Job Orders
  create_job_order: Clipboard,
  complete_job_order: Check,
  // Items
  create_item: Plus,
  update_item: Edit,
  delete_item: Trash2,
  // Stock
  create_stock_adjustment: Package,
  // Supplier Management
  create_supplier: Building2,
  update_supplier: Edit,
  delete_supplier: Trash2,
  add_supplier_item: Link,
  // Settings
  update_system_settings: Settings,
  // User Management
  update_user_role: UserCog,
  toggle_user_status: UserX,
  remove_user_from_company: UserX,
  update_user_permissions: UserCog,
  create_user_invitation: UserCog,
  // Inventory Grouping
  create_inventory_folder: Plus,
  bulk_create_inventory_folders: Plus,
  move_items_to_inventory_folder: Package,
  delete_inventory_folder: Trash2,
  bulk_delete_inventory_folders: Trash2,
  // Dispatch Orders
  create_dispatch_order: Send,
  update_dispatch_order: Edit,
  confirm_dispatch_order: Check,
  dispatch_items: Truck,
  cancel_dispatch_order: Ban,
  archive_dispatch_order: Archive,
  update_dispatch_line_sale_price: DollarSign,
  default: AlertTriangle
};

// Map action types to colors
const ACTION_COLORS = {
  // Purchase Orders
  create_purchase_order: 'text-blue-600 bg-blue-100',
  receive_purchase_order: 'text-green-600 bg-green-100',
  // Job Orders
  create_job_order: 'text-purple-600 bg-purple-100',
  complete_job_order: 'text-emerald-600 bg-emerald-100',
  // Items
  create_item: 'text-teal-600 bg-teal-100',
  update_item: 'text-amber-600 bg-amber-100',
  delete_item: 'text-red-600 bg-red-100',
  // Stock
  create_stock_adjustment: 'text-orange-600 bg-orange-100',
  // Supplier Management
  create_supplier: 'text-indigo-600 bg-indigo-100',
  update_supplier: 'text-indigo-600 bg-indigo-100',
  delete_supplier: 'text-red-600 bg-red-100',
  add_supplier_item: 'text-cyan-600 bg-cyan-100',
  // Settings
  update_system_settings: 'text-violet-600 bg-violet-100',
  // User Management
  update_user_role: 'text-fuchsia-600 bg-fuchsia-100',
  toggle_user_status: 'text-rose-600 bg-rose-100',
  remove_user_from_company: 'text-red-600 bg-red-100',
  update_user_permissions: 'text-fuchsia-600 bg-fuchsia-100',
  create_user_invitation: 'text-teal-600 bg-teal-100',
  // Inventory Grouping
  create_inventory_folder: 'text-teal-600 bg-teal-100',
  bulk_create_inventory_folders: 'text-teal-600 bg-teal-100',
  move_items_to_inventory_folder: 'text-teal-600 bg-teal-100',
  delete_inventory_folder: 'text-red-600 bg-red-100',
  bulk_delete_inventory_folders: 'text-red-600 bg-red-100',
  // Dispatch Orders
  create_dispatch_order: 'text-sky-600 bg-sky-100',
  update_dispatch_order: 'text-amber-600 bg-amber-100',
  confirm_dispatch_order: 'text-emerald-600 bg-emerald-100',
  dispatch_items: 'text-sky-600 bg-sky-100',
  cancel_dispatch_order: 'text-red-600 bg-red-100',
  archive_dispatch_order: 'text-slate-600 bg-slate-100',
  update_dispatch_line_sale_price: 'text-teal-600 bg-teal-100',
  default: 'text-slate-600 bg-slate-100'
};

export default function ConfirmActionDialog({
  open,
  onClose,
  action,
  onConfirm,
  onCancel,
  isLoading = false
}) {
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds

  // Start countdown when dialog opens
  React.useEffect(() => {
    if (!open || !action) return;

    // Calculate time left from expires_in or default to 300
    const expiresIn = action.expires_in || 300;
    setTimeLeft(expiresIn);

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [open, action, onClose]);

  if (!action) return null;

  const IconComponent = ACTION_ICONS[action.toolName] || ACTION_ICONS.default;
  const colorClass = ACTION_COLORS[action.toolName] || ACTION_COLORS.default;

  // Format time remaining
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Render action details
  const renderDetails = () => {
    if (!action.details) return null;
    const details = action.details;

    // Helper: a small warning banner
    const Warning = ({ text }) => (
      <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>{text}</span>
      </div>
    );

    // Helper: info note
    const Note = ({ text }) => (
      <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-md px-3 py-2">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>{text}</span>
      </div>
    );

    // Helper: a simple labeled field row
    const Field = ({ label, value }) => value != null && value !== '' ? (
      <div className="text-sm text-slate-600">
        <span className="font-medium">{label}:</span> {String(value)}
      </div>
    ) : null;

    // Helper: a scrollable item list box
    const ItemBox = ({ label, children, danger = false }) => (
      <div className={`rounded-lg p-3 max-h-48 overflow-y-auto ${danger ? 'bg-red-50' : 'bg-slate-50'}`}>
        {label && <div className={`text-xs font-semibold uppercase mb-2 ${danger ? 'text-red-500' : 'text-slate-500'}`}>{label}</div>}
        <div className="space-y-1.5">{children}</div>
      </div>
    );

    // ── Purchase Order ──────────────────────────────────────────
    if (action.toolName === 'create_purchase_order' && details.items) {
      return (
        <div className="mt-4 space-y-3">
          <Field label="Supplier" value={details.supplier_name || (details.supplier_id ? `ID: ${details.supplier_id}` : null)} />
          <ItemBox label={`Items (${details.items.length})`}>
            {details.items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="text-slate-700">{item.item_name || `Item #${item.item_id}`} × {item.quantity}</span>
                {item.unit_price != null && (
                  <span className="text-slate-600 font-medium">₱{(item.unit_price * item.quantity).toFixed(2)}</span>
                )}
              </div>
            ))}
          </ItemBox>
          {details.total_amount != null && (
            <div className="flex justify-between text-sm font-semibold border-t border-slate-200 pt-2">
              <span>Total</span>
              <span className="text-slate-900">₱{Number(details.total_amount).toFixed(2)}</span>
            </div>
          )}
        </div>
      );
    }

    // ── Job Order ────────────────────────────────────────────────
    if (action.toolName === 'create_job_order') {
      return (
        <div className="mt-4 space-y-2">
          <Field label="Product" value={details.product_name || (details.product_id ? `ID: ${details.product_id}` : null)} />
          <Field label="Quantity to Produce" value={details.quantity_to_produce} />
          {details.notes && <Field label="Notes" value={details.notes} />}
        </div>
      );
    }

    if (action.toolName === 'complete_job_order') {
      return (
        <div className="mt-4 space-y-2">
          <Field label="Job Order ID" value={details.jo_id ? `#${details.jo_id}` : null} />
          <Field label="Quantity Produced" value={details.quantity_produced} />
          <Warning text="Ingredients will be consumed and finished goods added to stock. This cannot be undone." />
        </div>
      );
    }

    // ── Item ─────────────────────────────────────────────────────
    if (action.toolName === 'create_item' || action.toolName === 'update_item') {
      return (
        <div className="mt-4 space-y-2">
          <Field label="SKU" value={details.sku_code} />
          <Field label="Name" value={details.name} />
          <Field label="Category" value={details.category} />
          <Field label="Unit" value={details.unit_of_measure} />
          {details.max_capacity != null && <Field label="Max Capacity" value={details.max_capacity} />}
        </div>
      );
    }

    if (action.toolName === 'delete_item') {
      return (
        <div className="mt-4 space-y-2">
          <Field label="Item ID" value={details.item_id ? `#${details.item_id}` : null} />
          <Warning text="The item will be soft-deleted and removed from active inventory. Stock data is preserved." />
        </div>
      );
    }

    // ── Stock Adjustment ─────────────────────────────────────────
    if (action.toolName === 'create_stock_adjustment') {
      const qty = details.quantity != null ? (details.quantity > 0 ? `+${details.quantity}` : String(details.quantity)) : null;
      return (
        <div className="mt-4 space-y-2">
          <Field label="Quantity Change" value={qty} />
          <Field label="Type" value={details.movement_type} />
          <Field label="Reason" value={details.reason} />
          <Field label="Item ID" value={details.item_id ? `#${details.item_id}` : null} />
        </div>
      );
    }

    // ── Supplier ─────────────────────────────────────────────────
    if (action.toolName === 'create_supplier') {
      return (
        <div className="mt-4 space-y-2">
          <Field label="Name" value={details.name} />
          <Field label="Contact" value={details.contact_person} />
          <Field label="Email" value={details.email} />
          <Field label="Lead Time" value={details.lead_time != null ? `${details.lead_time} days` : null} />
        </div>
      );
    }

    if (action.toolName === 'update_supplier') {
      return (
        <div className="mt-4 space-y-2">
          <Field label="Supplier ID" value={details.supplier_id ? `#${details.supplier_id}` : null} />
          <Field label="New Name" value={details.name} />
          <Field label="Contact" value={details.contact_person} />
        </div>
      );
    }

    if (action.toolName === 'delete_supplier') {
      return (
        <div className="mt-4 space-y-2">
          <Field label="Supplier ID" value={details.supplier_id ? `#${details.supplier_id}` : null} />
          <Warning text="The supplier will be removed and unlinked from all items." />
        </div>
      );
    }

    if (action.toolName === 'add_supplier_item') {
      return (
        <div className="mt-4 space-y-2">
          <Field label="Item ID" value={details.item_id ? `#${details.item_id}` : null} />
          <Field label="Price" value={details.price_per_unit != null ? `₱${details.price_per_unit}/unit` : null} />
          <Field label="MOQ" value={details.moq} />
        </div>
      );
    }

    // ── Receive PO ───────────────────────────────────────────────
    if (action.toolName === 'receive_purchase_order') {
      return (
        <div className="mt-4 space-y-2">
          <Field label="Purchase Order ID" value={details.po_id ? `#${details.po_id}` : null} />
          <Warning text="Stock will be updated and FIFO batches created. This cannot be undone." />
        </div>
      );
    }

    // ── User Management ──────────────────────────────────────────
    if (action.toolName === 'create_user_invitation') {
      return (
        <div className="mt-4 space-y-2">
          <Field label="Email" value={details.email} />
          <Field label="Role" value={details.role} />
          <Note text={details.note || 'An email invitation will be sent with a link to set up their account. The invitation expires in 7 days.'} />
        </div>
      );
    }

    if (action.toolName === 'update_user_role') {
      return (
        <div className="mt-4 space-y-2">
          <Field label="User ID" value={details.user_id ? `#${details.user_id}` : null} />
          <Field label="New Role" value={details.role} />
          <Note text="Changing the role will reset permissions to the role's default set." />
        </div>
      );
    }

    if (action.toolName === 'toggle_user_status') {
      return (
        <div className="mt-4 space-y-2">
          <Field label="User ID" value={details.user_id ? `#${details.user_id}` : null} />
          <Field label="New Status" value={details.is_active ? 'Active' : 'Deactivated'} />
        </div>
      );
    }

    if (action.toolName === 'remove_user_from_company') {
      return (
        <div className="mt-4 space-y-2">
          <Field label="User ID" value={details.user_id ? `#${details.user_id}` : null} />
          <Warning text="The user will be soft-deleted and can no longer log in. They can be re-invited later." />
        </div>
      );
    }

    // ── Inventory Folders ────────────────────────────────────────
    if (action.toolName === 'bulk_create_inventory_folders' && details.folders) {
      return (
        <div className="mt-4 space-y-3">
          <Field label="Folders to create" value={details.folder_count} />
          <ItemBox label="Folders">
            {details.folders.map((folder, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="text-slate-700 font-medium">{folder.name}</span>
                {folder.description && folder.description !== '(none)' && (
                  <span className="text-slate-500 text-xs">{folder.description}</span>
                )}
              </div>
            ))}
          </ItemBox>
          {details.note && <Note text={details.note} />}
        </div>
      );
    }

    if (action.toolName === 'create_inventory_folder') {
      return (
        <div className="mt-4 space-y-2">
          <Field label="Folder Name" value={details.name} />
          {details.description && details.description !== '(none)' && <Field label="Description" value={details.description} />}
        </div>
      );
    }

    if (action.toolName === 'delete_inventory_folder') {
      return (
        <div className="mt-4 space-y-2">
          <Field label="Folder Name" value={details.folder_name} />
          {details.note && <Warning text={details.note} />}
        </div>
      );
    }

    if (action.toolName === 'bulk_delete_inventory_folders' && details.folder_names) {
      return (
        <div className="mt-4 space-y-3">
          <Field label="Folders to delete" value={details.folder_count} />
          <ItemBox label="Folders" danger>
            {details.folder_names.map((name, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <Trash2 className="w-3 h-3 text-red-400 shrink-0" />
                <span className="text-slate-700 font-medium">{name}</span>
              </div>
            ))}
          </ItemBox>
          {details.note && <Warning text={details.note} />}
        </div>
      );
    }

    if (action.toolName === 'move_items_to_inventory_folder') {
      return (
        <div className="mt-4 space-y-2">
          <Field label="Target Folder" value={details.folder_name} />
          <Field label="Items Moving" value={Array.isArray(details.item_ids) ? details.item_ids.length : null} />
        </div>
      );
    }

    // ── Dispatch Orders ──────────────────────────────────────────
    if (action.toolName === 'create_dispatch_order') {
      return (
        <div className="mt-4 space-y-3">
          <div className="space-y-2">
            <Field label="Recipient" value={details.recipient_name} />
            <Field label="Type" value={details.recipient_type} />
            <Field label="Dispatch Date" value={details.dispatch_date} />
            {details.reference_jo && <Field label="Ref JO" value={details.reference_jo} />}
            {details.reference_po && <Field label="Ref PO" value={details.reference_po} />}
          </div>
          {Array.isArray(details.lines) && details.lines.length > 0 && (
            <ItemBox label={`Lines (${details.lines.length})`}>
              {details.lines.map((line, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-slate-700">Item #{line.item_id}</span>
                  <span className="text-slate-600 font-medium">
                    {line.qty_ordered} units
                    {line.sale_price_per_unit != null ? ` @ ₱${line.sale_price_per_unit}` : ''}
                  </span>
                </div>
              ))}
            </ItemBox>
          )}
          <Note text="Stock is NOT deducted yet. Confirm → then dispatch to deduct stock." />
        </div>
      );
    }

    if (action.toolName === 'update_dispatch_order') {
      return (
        <div className="mt-4 space-y-2">
          <Field label="DO ID" value={details.do_id ? `#${details.do_id}` : null} />
          {details.recipient_name && <Field label="Recipient" value={details.recipient_name} />}
          {details.dispatch_date && <Field label="New Date" value={details.dispatch_date} />}
          {Array.isArray(details.lines) && (
            <Warning text={`Lines will be replaced with ${details.lines.length} new line(s).`} />
          )}
        </div>
      );
    }

    if (action.toolName === 'confirm_dispatch_order') {
      return (
        <div className="mt-4 space-y-2">
          <Field label="DO ID" value={details.do_id ? `#${details.do_id}` : null} />
          <Note text="Status: draft → confirmed. Lines cannot be edited after this step." />
        </div>
      );
    }

    if (action.toolName === 'dispatch_items') {
      return (
        <div className="mt-4 space-y-3">
          <Field label="DO ID" value={details.do_id ? `#${details.do_id}` : null} />
          {Array.isArray(details.lines) && details.lines.length > 0 && (
            <ItemBox label={`Dispatching ${details.lines.length} line(s)`}>
              {details.lines.map((line, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-slate-700">Line #{line.line_id}</span>
                  <span className="text-slate-600 font-medium">{line.qty_to_dispatch} units</span>
                </div>
              ))}
            </ItemBox>
          )}
          <Warning text="Stock will be deducted immediately. This creates a goods_issue movement." />
        </div>
      );
    }

    if (action.toolName === 'cancel_dispatch_order') {
      return (
        <div className="mt-4 space-y-2">
          <Field label="DO ID" value={details.do_id ? `#${details.do_id}` : null} />
          {details.reason && <Field label="Reason" value={details.reason} />}
          <Warning text="If items were already dispatched, those stock movements must be voided separately via Stock Movements." />
        </div>
      );
    }

    if (action.toolName === 'archive_dispatch_order') {
      return (
        <div className="mt-4 space-y-2">
          <Field label="DO ID" value={details.do_id ? `#${details.do_id}` : null} />
          <Note text="The order will be hidden from active views but is not deleted. View it by filtering archived orders." />
        </div>
      );
    }

    if (action.toolName === 'update_dispatch_line_sale_price') {
      const priceLabel = details.sale_price_per_unit != null
        ? `₱${details.sale_price_per_unit}/unit`
        : 'null (marks as internal transfer, excluded from earnings)';
      return (
        <div className="mt-4 space-y-2">
          <Field label="DO ID" value={details.do_id ? `#${details.do_id}` : null} />
          <Field label="Line ID" value={details.line_id ? `#${details.line_id}` : null} />
          <Field label="New Sale Price" value={priceLabel} />
          <Note text="This also updates the item's default sale price for future dispatch orders." />
        </div>
      );
    }

    // ── Smart generic fallback (replaces raw JSON for all other actions) ──
    const entries = Object.entries(details).filter(([, v]) => v != null && v !== '');
    if (entries.length === 0) return null;

    return (
      <div className="mt-4 space-y-2">
        {entries.map(([key, value]) => {
          if (Array.isArray(value)) {
            return (
              <div key={key} className="text-sm text-slate-600">
                <span className="font-medium capitalize">{key.replace(/_/g, ' ')}:</span>{' '}
                <span className="text-slate-500">{value.length} item{value.length !== 1 ? 's' : ''}</span>
              </div>
            );
          }
          if (typeof value === 'object') return null;
          return (
            <div key={key} className="text-sm text-slate-600">
              <span className="font-medium capitalize">{key.replace(/_/g, ' ')}:</span>{' '}
              {String(value)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${colorClass}`}>
              <IconComponent className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg">Confirm Action</DialogTitle>
              <DialogDescription className="text-sm">
                Please review and confirm this action
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-4">
          <p className="text-slate-800 font-medium">{action.description}</p>

          {action.impact_summary && (
            <p className="text-sm text-slate-600 mt-2">{action.impact_summary}</p>
          )}

          {renderDetails()}

          {/* Timer warning */}
          <div className={`flex items-center gap-2 mt-4 p-2 rounded-lg ${timeLeft < 60 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
            }`}>
            <Clock className="w-4 h-4" />
            <span className="text-sm font-medium">
              Expires in {formatTime(timeLeft)}
            </span>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => {
              onCancel(action.action_id);
              onClose();
            }}
            disabled={isLoading}
            className="flex-1"
          >
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm(action.action_id);
            }}
            disabled={isLoading}
            className="flex-1 bg-teal-600 hover:bg-teal-700"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Confirm
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
