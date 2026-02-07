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
  Link
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
  create_purchase_order: ShoppingCart,
  receive_purchase_order: Truck,
  create_job_order: Clipboard,
  complete_job_order: Check,
  create_item: Plus,
  update_item: Edit,
  delete_item: Trash2,
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
  // Inventory Grouping
  create_inventory_folder: Plus,
  bulk_create_inventory_folders: Plus,
  move_items_to_inventory_folder: Package,
  delete_inventory_folder: Trash2,
  bulk_delete_inventory_folders: Trash2,
  default: AlertTriangle
};

// Map action types to colors
const ACTION_COLORS = {
  create_purchase_order: 'text-blue-600 bg-blue-100',
  receive_purchase_order: 'text-green-600 bg-green-100',
  create_job_order: 'text-purple-600 bg-purple-100',
  complete_job_order: 'text-emerald-600 bg-emerald-100',
  create_item: 'text-teal-600 bg-teal-100',
  update_item: 'text-amber-600 bg-amber-100',
  delete_item: 'text-red-600 bg-red-100',
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
  // Inventory Grouping
  create_inventory_folder: 'text-teal-600 bg-teal-100',
  bulk_create_inventory_folders: 'text-teal-600 bg-teal-100',
  move_items_to_inventory_folder: 'text-teal-600 bg-teal-100',
  delete_inventory_folder: 'text-red-600 bg-red-100',
  bulk_delete_inventory_folders: 'text-red-600 bg-red-100',
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

  const IconComponent = ACTION_ICONS[action.action_type] || ACTION_ICONS.default;
  const colorClass = ACTION_COLORS[action.action_type] || ACTION_COLORS.default;

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

    // Purchase Order details
    if (action.action_type === 'create_purchase_order' && details.items) {
      return (
        <div className="mt-4 space-y-3">
          <div className="text-sm text-slate-600">
            <span className="font-medium">Supplier:</span> {details.supplier_name || `ID: ${details.supplier_id}`}
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="text-xs font-medium text-slate-500 uppercase mb-2">Items</div>
            <div className="space-y-2">
              {details.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-slate-700">
                    {item.item_name || `Item #${item.item_id}`} x {item.quantity}
                  </span>
                  <span className="text-slate-600 font-medium">
                    ${(item.unit_price * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            {details.total_amount && (
              <div className="border-t border-slate-200 mt-2 pt-2 flex justify-between font-medium">
                <span>Total</span>
                <span className="text-slate-900">${details.total_amount.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Job Order details
    if (action.action_type === 'create_job_order') {
      return (
        <div className="mt-4 space-y-2 text-sm">
          <div className="text-slate-600">
            <span className="font-medium">Product:</span> {details.product_name || `ID: ${details.product_id}`}
          </div>
          <div className="text-slate-600">
            <span className="font-medium">Quantity:</span> {details.quantity_to_produce}
          </div>
        </div>
      );
    }

    // Item create/update details
    if (action.action_type === 'create_item' || action.action_type === 'update_item') {
      return (
        <div className="mt-4 space-y-2 text-sm">
          {details.sku_code && (
            <div className="text-slate-600">
              <span className="font-medium">SKU:</span> {details.sku_code}
            </div>
          )}
          {details.name && (
            <div className="text-slate-600">
              <span className="font-medium">Name:</span> {details.name}
            </div>
          )}
          {details.category && (
            <div className="text-slate-600">
              <span className="font-medium">Category:</span> {details.category}
            </div>
          )}
        </div>
      );
    }

    // Bulk Inventory Folder creation
    if (action.action_type === 'bulk_create_inventory_folders' && details.folders) {
      return (
        <div className="mt-4 space-y-3">
          <div className="text-sm text-slate-600">
            <span className="font-medium">Folders to create:</span> {details.folder_count}
          </div>
          <div className="bg-slate-50 rounded-lg p-3 max-h-48 overflow-y-auto">
            <div className="text-xs font-medium text-slate-500 uppercase mb-2">Folders</div>
            <div className="space-y-2">
              {details.folders.map((folder, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-slate-700 font-medium">{folder.name}</span>
                  {folder.description && folder.description !== '(none)' && (
                    <span className="text-slate-500 text-xs">{folder.description}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
          {details.note && (
            <div className="text-xs text-slate-500 italic">{details.note}</div>
          )}
        </div>
      );
    }

    // Single Inventory Folder creation
    if (action.action_type === 'create_inventory_folder') {
      return (
        <div className="mt-4 space-y-2 text-sm">
          <div className="text-slate-600">
            <span className="font-medium">Folder Name:</span> {details.name}
          </div>
          {details.description && details.description !== '(none)' && (
            <div className="text-slate-600">
              <span className="font-medium">Description:</span> {details.description}
            </div>
          )}
        </div>
      );
    }

    // Single Inventory Folder deletion
    if (action.action_type === 'delete_inventory_folder') {
      return (
        <div className="mt-4 space-y-2 text-sm">
          <div className="text-slate-600">
            <span className="font-medium">Folder Name:</span> {details.folder_name}
          </div>
          {details.note && (
            <div className="text-xs text-amber-600 italic mt-1">{details.note}</div>
          )}
        </div>
      );
    }

    // Bulk Inventory Folder deletion
    if (action.action_type === 'bulk_delete_inventory_folders' && details.folder_names) {
      return (
        <div className="mt-4 space-y-3">
          <div className="text-sm text-slate-600">
            <span className="font-medium">Folders to delete:</span> {details.folder_count}
          </div>
          <div className="bg-red-50 rounded-lg p-3 max-h-48 overflow-y-auto">
            <div className="text-xs font-medium text-red-500 uppercase mb-2">Folders</div>
            <div className="space-y-2">
              {details.folder_names.map((name, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  <Trash2 className="w-3 h-3 text-red-400" />
                  <span className="text-slate-700 font-medium">{name}</span>
                </div>
              ))}
            </div>
          </div>
          {details.note && (
            <div className="text-xs text-amber-600 italic">{details.note}</div>
          )}
        </div>
      );
    }

    // Generic details display
    return (
      <div className="mt-4 bg-slate-50 rounded-lg p-3">
        <pre className="text-xs text-slate-600 whitespace-pre-wrap">
          {JSON.stringify(details, null, 2)}
        </pre>
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
