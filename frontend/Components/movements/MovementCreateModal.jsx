import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowLeftRight,
  RotateCcw,
  AlertCircle,
  ChevronsUpDown,
  Check
} from 'lucide-react';
import { cn } from "../../src/lib/utils.js";

const movementTypes = [
  { value: 'purchase_receipt', label: 'Purchase Receipt', icon: ArrowDownCircle, color: 'text-emerald-600' },
  { value: 'production_consumption', label: 'Production Consumption', icon: ArrowUpCircle, color: 'text-red-500' },
  { value: 'transfer', label: 'Transfer', icon: ArrowLeftRight, color: 'text-blue-500' },
  { value: 'return', label: 'Return', icon: RotateCcw, color: 'text-blue-500' },
  { value: 'calculated_loss', label: 'Calculated Loss', icon: AlertCircle, color: 'text-red-600' }
];

const lossReasons = [
  { value: 'waste', label: 'Waste' },
  { value: 'spoilage', label: 'Spoilage' },
  { value: 'damage', label: 'Damage' },
  { value: 'pilferage', label: 'Pilferage' }
];

const locations = [
  'Main Warehouse',
  'Production Floor',
  'Shipping Area',
  'Quality Control',
  'Cold Storage'
];

export default function MovementCreateModal({ open, onClose, onSubmit, items, preselectedItem }) {
  const [formData, setFormData] = useState({
    item_id: '',
    item_name: '',
    movement_type: 'purchase_receipt',
    quantity: 1,
    from_location: '',
    to_location: '',
    reference_id: '',
    notes: '',
    loss_reason: ''
  });

  const [searchQuery, setSearchQuery] = useState('');

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
        const item = items.find(i => i.id === value);
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
                {movementTypes.map(type => {
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
                    ? items.find((item) => item.id === formData.item_id)?.name
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
                        .map((item) => (
                          <CommandItem
                            key={item.id}
                            selected={formData.item_id === item.id}
                            onSelect={() => {
                              handleChange('item_id', item.id);
                              setSearchQuery('');
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                formData.item_id === item.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col">
                              <span>{item.name}</span>
                              <span className="text-xs text-slate-500">
                                {item.current_stock} {item.unit_of_measure} in stock
                              </span>
                            </div>
                          </CommandItem>
                        ))}
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