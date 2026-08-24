import React, { useState, useMemo, useEffect } from 'react';
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
import { Plus, Trash2, Loader2, Check, ChevronsUpDown } from 'lucide-react';
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
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from 'sonner';
import { canBeDispatched } from '../utils/categoryHelpers.js';
import { cn } from '../../src/lib/utils.js';

const emptyLine = () => ({ item_id: '', qty_ordered: '', sale_price_per_unit: '', notes: '' });

/**
 * DOCreateModal — create a new draft DO or edit an existing draft.
 *
 * Props:
 *   open        {boolean}
 *   onClose     {function}
 *   onSave      {function(payload)} — receives validated payload, must return a promise
 *   items       {Array}  — full item list for line item picker
 *   existingDO  {Object|null} — when editing a draft; null for create
 */
export default function DOCreateModal({ open, onClose, onSave, items = [], existingDO = null }) {
  const isEdit = !!existingDO;

  const [recipientName, setRecipientName] = useState(existingDO?.recipient_name || '');
  const [recipientType, setRecipientType] = useState(existingDO?.recipient_type || 'external');
  const [referenceJo, setReferenceJo] = useState(existingDO?.reference_jo || '');
  const [referencePo, setReferencePo] = useState(existingDO?.reference_po || '');
  const [dispatchDate, setDispatchDate] = useState(
    existingDO?.dispatch_date
      ? existingDO.dispatch_date.slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState(existingDO?.notes || '');
  const [lines, setLines] = useState(
    existingDO?.lines?.length
      ? existingDO.lines.map(l => ({
        item_id: String(l.item_id),
        qty_ordered: String(l.qty_ordered),
        sale_price_per_unit: l.sale_price_per_unit != null ? String(l.sale_price_per_unit) : '',
        notes: l.notes || ''
      }))
      : [emptyLine()]
  );
  const [submitting, setSubmitting] = useState(false);

  // Sync form state when existingDO or open changes (handles re-open for edit)
  useEffect(() => {
    if (open) {
      setRecipientName(existingDO?.recipient_name || '');
      setRecipientType(existingDO?.recipient_type || 'external');
      setReferenceJo(existingDO?.reference_jo || '');
      setReferencePo(existingDO?.reference_po || '');
      setDispatchDate(
        existingDO?.dispatch_date
          ? existingDO.dispatch_date.slice(0, 10)
          : new Date().toISOString().slice(0, 10)
      );
      setNotes(existingDO?.notes || '');
      setLines(
        existingDO?.lines?.length
          ? existingDO.lines.map(l => ({
            item_id: String(l.item_id),
            qty_ordered: String(l.qty_ordered),
            sale_price_per_unit: l.sale_price_per_unit != null ? String(l.sale_price_per_unit) : '',
            notes: l.notes || ''
          }))
          : [emptyLine()]
      );
    }
  }, [open, existingDO]);

  const dispatchableItems = useMemo(() => {
    // 1. Base list of items that can be dispatched
    const activeDispatchable = items.filter(i =>
      canBeDispatched(i) && i.status === 'active'
    );

    // 2. We MUST ensure items already in the lines are included, 
    // even if they are inactive, so the display name shows up.
    const selectedIds = new Set(lines.map(l => l.item_id).filter(Boolean));
    const extraItems = items.filter(i =>
      selectedIds.has(String(i.item_id)) &&
      !activeDispatchable.some(ad => String(ad.item_id) === String(i.item_id))
    );

    return [...activeDispatchable, ...extraItems];
  }, [items, lines]);

  const addLine = () => setLines(prev => [...prev, emptyLine()]);

  const removeLine = (idx) => {
    if (lines.length === 1) return;
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  const updateLine = (idx, field, value) => {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: value };
      // Auto-fill sale price when item is selected and price is not yet set
      if (field === 'item_id' && !l.sale_price_per_unit) {
        const selectedItem = items.find(it => String(it.item_id) === String(value));
        if (selectedItem) {
          const suggested = selectedItem.default_sale_price != null
            ? selectedItem.default_sale_price
            : selectedItem.cost_per_unit;
          if (suggested != null) updated.sale_price_per_unit = String(suggested);
        }
      }
      return updated;
    }));
  };

  const validate = () => {
    if (!recipientName.trim()) { toast.error('Recipient name is required'); return false; }
    if (!dispatchDate) { toast.error('Dispatch date is required'); return false; }
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.item_id) { toast.error(`Line ${i + 1}: select an item`); return false; }
      const qty = parseFloat(l.qty_ordered);
      if (!qty || qty <= 0) { toast.error(`Line ${i + 1}: quantity must be positive`); return false; }
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload = {
        recipient_name: recipientName.trim(),
        recipient_type: recipientType,
        reference_jo: referenceJo.trim() || null,
        reference_po: referencePo.trim() || null,
        dispatch_date: dispatchDate,
        notes: notes.trim() || null,
        lines: lines.map(l => ({
          item_id: parseInt(l.item_id),
          qty_ordered: parseFloat(l.qty_ordered),
          sale_price_per_unit: l.sale_price_per_unit !== '' ? parseFloat(l.sale_price_per_unit) : null,
          notes: l.notes.trim() || null
        }))
      };
      await onSave(payload);
      handleClose();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save dispatch order');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isEdit) {
      setRecipientName('');
      setRecipientType('external');
      setReferenceJo('');
      setReferencePo('');
      setDispatchDate(new Date().toISOString().slice(0, 10));
      setNotes('');
      setLines([emptyLine()]);
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto pb-8">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Dispatch Order' : 'New Dispatch Order'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label>Recipient Name <span className="text-red-500">*</span></Label>
              <Input
                placeholder="Customer or branch name"
                value={recipientName}
                onChange={e => setRecipientName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Recipient Type</Label>
              <Select value={recipientType} onValueChange={setRecipientType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="external">External (Customer)</SelectItem>
                  <SelectItem value="internal">Internal (Branch)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Dispatch Date <span className="text-red-500">*</span></Label>
              <Input
                type="date"
                value={dispatchDate}
                onChange={e => setDispatchDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>JO Reference</Label>
              <Input
                placeholder="e.g. JO-2026-0001"
                value={referenceJo}
                onChange={e => setReferenceJo(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>PO Reference</Label>
              <Input
                placeholder="Optional"
                value={referencePo}
                onChange={e => setReferencePo(e.target.value)}
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                placeholder="Optional notes about this dispatch"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          {/* Line items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Items to Dispatch</Label>
              <Button variant="outline" size="sm" onClick={addLine}>
                <Plus className="w-4 h-4 mr-1" /> Add Line
              </Button>
            </div>

            {dispatchableItems.length === 0 && (
              <p className="text-sm text-slate-500 bg-amber-50 border border-amber-200 rounded-lg p-3">
                No finished goods items found. Only active finished goods can be dispatched.
              </p>
            )}

            {lines.map((line, idx) => (
              <ItemRow
                key={idx}
                idx={idx}
                line={line}
                items={items}
                dispatchableItems={dispatchableItems}
                updateLine={updateLine}
                removeLine={removeLine}
                linesCount={lines.length}
              />
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * ItemRow — separate row component to manage internal popover state for each line.
 */
function ItemRow({ idx, line, items, dispatchableItems, updateLine, removeLine, linesCount }) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const selectedItem = line.item_id
    ? items.find(i => String(i.item_id) === line.item_id)
    : null;

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return dispatchableItems;
    const s = searchTerm.toLowerCase();
    return dispatchableItems.filter(it =>
      it.name.toLowerCase().includes(s) ||
      it.sku_code.toLowerCase().includes(s)
    );
  }, [dispatchableItems, searchTerm]);

  const priceHint = selectedItem
    ? selectedItem.default_sale_price != null
      ? `Last: ₱${parseFloat(selectedItem.default_sale_price).toFixed(2)}`
      : selectedItem.cost_per_unit != null
        ? `Cost: ₱${parseFloat(selectedItem.cost_per_unit).toFixed(2)}`
        : null
    : null;

  return (
    <div className="grid grid-cols-12 gap-2 items-start p-3 border border-slate-200 rounded-lg bg-slate-50">
      <div className="col-span-3 space-y-1">
        {idx === 0 && <Label className="text-xs text-slate-500">Item</Label>}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className={cn(
                "w-full justify-between font-normal bg-white",
                !line.item_id && "text-slate-500"
              )}
            >
              <span className="truncate">
                {selectedItem ? selectedItem.name : "Select item..."}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Search item..."
                value={searchTerm}
                onValueChange={setSearchTerm}
              />
              <CommandList>
                {filteredItems.length === 0 && <CommandEmpty>No item found.</CommandEmpty>}
                <CommandGroup>
                  {filteredItems.map((item) => (
                    <CommandItem
                      key={item.item_id}
                      value={`${item.name} ${item.sku_code} ${item.item_id}`}
                      onSelect={() => {
                        updateLine(idx, 'item_id', String(item.item_id));
                        setOpen(false);
                        setSearchTerm("");
                      }}
                      className="flex flex-col items-start gap-1"
                    >
                      <div className="flex items-center w-full">
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4 shrink-0",
                            line.item_id === String(item.item_id) ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span className="font-medium text-slate-900">{item.name}</span>
                      </div>
                      <span className="text-xs text-slate-400 ml-6">{item.sku_code}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <div className="col-span-2 space-y-1">
        {idx === 0 && <Label className="text-xs text-slate-500">Qty</Label>}
        <div className="relative">
          <Input
            type="number"
            min="0"
            step="1"
            placeholder="Qty"
            value={line.qty_ordered}
            onChange={e => updateLine(idx, 'qty_ordered', e.target.value)}
            className="bg-white"
          />
          {line.item_id && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none uppercase">
              {selectedItem?.unit_of_measure}
            </span>
          )}
        </div>
      </div>

      <div className="col-span-4 space-y-1">
        {idx === 0 && (
          <Label className="text-xs text-slate-500 whitespace-nowrap">
            Sale Price/Unit
          </Label>
        )}
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">₱</span>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="Price per unit"
            value={line.sale_price_per_unit}
            onChange={e => updateLine(idx, 'sale_price_per_unit', e.target.value)}
            className="pl-5 bg-white"
          />
        </div>
        {priceHint && !line.sale_price_per_unit && (
          <p className="text-xs text-slate-400">{priceHint}</p>
        )}
      </div>

      <div className="col-span-2 space-y-1">
        {idx === 0 && <Label className="text-xs text-slate-500">Notes</Label>}
        <Input
          placeholder="Optional"
          value={line.notes}
          onChange={e => updateLine(idx, 'notes', e.target.value)}
          className="bg-white"
        />
      </div>

      <div className={`col-span-1 flex ${idx === 0 ? 'mt-5' : 'items-center pt-1'}`}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => removeLine(idx)}
          disabled={linesCount === 1}
          className="text-slate-400 hover:text-red-500"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
