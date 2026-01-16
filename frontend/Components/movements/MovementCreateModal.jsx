import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "../ui/command";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "../ui/popover";
import {
  ChevronsUpDown,
  Check,
  AlertTriangle,
  Activity
} from 'lucide-react';
import { Badge } from "../ui/badge";
import { cn } from "../../src/lib/utils.js";
import { useLocations } from '../../src/hooks/useLocations.js';
import * as itemService from '../../src/services/itemService.js';
import { format } from 'date-fns';
import { getMovementTypes, lossReasons, isPositiveMovement } from '../utils/movementConfig.js';
import { formatNumber } from '../../src/lib/numberUtils.js';

export default function MovementCreateModal({ open, onClose, onSubmit, items, preselectedItem }) {
  const { locations, loading: loadingLocations } = useLocations();

  const [formData, setFormData] = useState({
    item_id: '',
    item_name: '',
    movement_type: 'purchase_receipt',
    quantity: 1,
    from_location: '',
    to_location: '',
    reference_id: '',
    notes: '',
    loss_reason: '',
    batch_id: '',
    expiry_date: ''
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [batches, setBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  // Fetch batches when item changes if FIFO is enabled
  useEffect(() => {
    const fetchBatches = async () => {
      if (!formData.item_id) {
        setBatches([]);
        return;
      }

      const selectedItem = items.find(i => (i.item_id || i.id) === formData.item_id);
      if (selectedItem?.fifo_enabled) {
        setLoadingBatches(true);
        try {
          const itemDetails = await itemService.getItemById(formData.item_id);
          setBatches(itemDetails.fifo_batches || []);
        } catch (error) {
          console.error("Failed to fetch batches:", error);
          setBatches([]);
        } finally {
          setLoadingBatches(false);
        }
      } else {
        setBatches([]);
      }
    };

    fetchBatches();
  }, [formData.item_id, items]);

  useEffect(() => {
    if (preselectedItem) {
      setFormData(prev => ({
        ...prev,
        item_id: preselectedItem.id,
        item_name: preselectedItem.name
      }));
    }
  }, [preselectedItem]);

  const handleChange = (field, value) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      if (field === 'item_id') {
        const item = items.find(i => (i.item_id || i.id) === value);
        if (item) {
          updated.item_name = item.name;
        }
      }
      return updated;
    });
  };

  const handleSubmit = () => {
    onSubmit(formData);
  };

  const showLossReason = formData.movement_type === 'calculated_loss';
  const showTransferLocations = formData.movement_type === 'transfer';
  const showSingleLocation = ['purchase_receipt', 'return'].includes(formData.movement_type);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Record Stock Movement</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Movement Type */}
          <div className="space-y-2">
            <Label>Movement Type</Label>
            <Select value={formData.movement_type} onValueChange={(v) => handleChange('movement_type', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getMovementTypes().map(type => {
                  const Icon = type.icon;
                  return (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <Icon className={cn("w-4 h-4", type.color)} />
                        {type.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Item Selection */}
          <div className="space-y-2">
            <Label>Item</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className={cn(
                    "w-full justify-between font-normal",
                    !formData.item_id && "text-slate-500"
                  )}
                >
                  {formData.item_id
                    ? items.find((item) => (item.item_id || item.id) === formData.item_id)?.name
                    : "Search items..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Search items..."
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                  />
                  <CommandList>
                    <CommandEmpty>No items found.</CommandEmpty>
                    <CommandGroup>
                      {items
                        .filter((item) =>
                          item.name.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((item) => {
                          const itemId = item.item_id || item.id;
                          return (
                            <CommandItem
                              key={itemId}
                              selected={formData.item_id === itemId}
                              onSelect={() => {
                                handleChange('item_id', itemId);
                                setSearchQuery('');
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  formData.item_id === itemId ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <span>{item.name}</span>
                                  {item.category && (
                                    <Badge variant="secondary" className="text-[10px] px-1 h-5 text-slate-500 bg-slate-100 border border-slate-200">
                                      {item.category}
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-xs text-slate-500">
                                  {formatNumber(item.current_stock, 2)} {item.unit_of_measure} in stock
                                </span>
                              </div>
                            </CommandItem>
                          );
                        })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label>Quantity</Label>
            <Input
              type="number"
              min={0}
              value={formData.quantity}
              onChange={(e) => handleChange('quantity', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
            />
          </div>

          {/* Expiry Date (For Purchase Receipts / Additions) */}
          {formData.movement_type === 'purchase_receipt' && (
            <div className="space-y-2">
              <Label>Expiry Date (Optional)</Label>
              <Input
                type="date"
                value={formData.expiry_date}
                onChange={(e) => handleChange('expiry_date', e.target.value)}
              />
              <p className="text-xs text-slate-500">
                Leave blank to auto-calculate based on shelf life.
              </p>
            </div>
          )}

          {/* Batch Selection (For Deductions) */}
          {['calculated_loss', 'production_consumption', 'return'].includes(formData.movement_type) && batches.length > 0 && (
            <div className="space-y-2">
              <Label>Deduct from specific Batch (Optional)</Label>
              <Select value={formData.batch_id} onValueChange={(v) => handleChange('batch_id', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select batch (Default: Oldest)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="oldest">Auto-select Oldest</SelectItem>
                  {batches.map(batch => (
                    <SelectItem key={batch.batch_id} value={batch.batch_id.toString()}>
                      #{batch.batch_id} - Qty: {parseFloat(batch.quantity) - parseFloat(batch.quantity_consumed)} - Exp: {batch.expiry_date ? format(new Date(batch.expiry_date), 'MMM d, yyyy') : 'N/A'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Transfer Locations */}
          {showTransferLocations && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>From Location</Label>
                <Select value={formData.from_location} onValueChange={(v) => handleChange('from_location', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map(loc => (
                      <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>To Location</Label>
                <Select value={formData.to_location} onValueChange={(v) => handleChange('to_location', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map(loc => (
                      <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Single Location */}
          {showSingleLocation && (
            <div className="space-y-2">
              <Label>{formData.movement_type === 'purchase_receipt' ? 'To Location' : 'From Location'}</Label>
              <Select
                value={formData.movement_type === 'purchase_receipt' ? formData.to_location : formData.from_location}
                onValueChange={(v) => handleChange(formData.movement_type === 'purchase_receipt' ? 'to_location' : 'from_location', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map(loc => (
                    <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Loss Reason */}
          {showLossReason && (
            <div className="space-y-2">
              <Label>Loss Reason</Label>
              <Select value={formData.loss_reason} onValueChange={(v) => handleChange('loss_reason', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  {lossReasons.map(reason => (
                    <SelectItem key={reason.value} value={reason.value}>{reason.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Reference ID */}
          <div className="space-y-2">
            <Label>Reference ID (Optional)</Label>
            <Input
              value={formData.reference_id}
              onChange={(e) => handleChange('reference_id', e.target.value)}
              placeholder="e.g., PO-001, JO-002"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Add any notes about this movement..."
              rows={3}
            />
          </div>

          {/* C9. Stock Impact Preview */}
          {formData.item_id && formData.quantity > 0 && (
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 text-sm">
              <h4 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-slate-500" />
                Stock Impact
              </h4>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-slate-500 text-xs uppercase tracking-wide">Current</p>
                  <p className="font-medium text-slate-900 mt-0.5">
                    {formatNumber(items.find(i => (i.item_id || i.id) === formData.item_id)?.current_stock || 0, 2)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs uppercase tracking-wide">Change</p>
                  <p className={cn("font-medium mt-0.5",
                    formData.movement_type === 'transfer' ? 'text-blue-600' :
                      isPositiveMovement(formData.movement_type) ? "text-emerald-600" : "text-red-500"
                  )}>
                    {formData.movement_type === 'transfer' ? 'No Change' : (
                      <>
                        {isPositiveMovement(formData.movement_type) ? '+' : '-'}
                        {formatNumber(formData.quantity, 2)}
                      </>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs uppercase tracking-wide">Projected</p>
                  <p className="font-bold text-slate-900 mt-0.5">
                    {(() => {
                      const current = parseFloat(items.find(i => (i.item_id || i.id) === formData.item_id)?.current_stock || 0);
                      const change = parseFloat(formData.quantity || 0);
                      if (formData.movement_type === 'transfer') return formatNumber(current, 2);
                      const projected = isPositiveMovement(formData.movement_type)
                        ? current + change
                        : current - change;
                      return formatNumber(projected, 2);
                    })()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-8">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!formData.item_id || formData.quantity <= 0}
            className="bg-teal-600 hover:bg-teal-700"
          >
            Record Movement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}