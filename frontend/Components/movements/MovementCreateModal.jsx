import React, { useMemo, useState, useEffect } from 'react';
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
  Activity,
  Barcode
} from 'lucide-react';
import { Badge } from "../ui/badge";
import { cn } from "../../src/lib/utils.js";
import { useLocations } from '../../src/hooks/useLocations.js';
import * as itemService from '../../src/services/itemService.js';
import { format } from 'date-fns';
import { getMovementConfig, isPositiveMovement, lossReasons } from '../utils/movementConfig.js';
import { formatNumber } from '../../src/lib/numberUtils.js';
import { toast } from 'sonner';

const STOCK_IN_TYPES = Object.freeze([
  { value: 'purchase_receipt', label: 'Purchase Receipt' },
  { value: 'return', label: 'Return to Stock' },
  { value: 'adjustment', label: 'Manual Adjustment' },
  { value: 'production_output', label: 'Production Output' }
]);

const STOCK_OUT_TYPES = Object.freeze([
  { value: 'production_consumption', label: 'Production Consumption' },
  { value: 'calculated_loss', label: 'Loss / Waste' },
  { value: 'goods_issue', label: 'Goods Issue' }
]);

const MOVEMENT_DIRECTION_OPTIONS = Object.freeze([
  { value: 'stock_in', label: 'Stock In' },
  { value: 'stock_out', label: 'Stock Out' },
  { value: 'transfer', label: 'Transfer' }
]);

const DEFAULT_MOVEMENT_TYPE_BY_DIRECTION = Object.freeze({
  stock_in: 'purchase_receipt',
  stock_out: 'production_consumption',
  transfer: 'transfer'
});

const STOCK_OUT_MOVEMENT_TYPES = new Set(['production_consumption', 'calculated_loss', 'goods_issue']);

const findItemByFormId = (items = [], itemIdValue = '') => {
  const normalized = Number.parseInt(itemIdValue, 10);
  if (!Number.isInteger(normalized) || normalized <= 0) return null;
  return items.find((item) => Number(item?.item_id || item?.id) === normalized) || null;
};

export default function MovementCreateModal({ open, onClose, onSubmit, items, preselectedItem }) {
  const { locations, loading: loadingLocations } = useLocations();
  const activeLocations = useMemo(
    () => (Array.isArray(locations) ? locations.filter((location) => location?.is_active !== false) : []),
    [locations]
  );

  const [formData, setFormData] = useState({
    item_id: '',
    item_name: '',
    movement_direction: 'stock_in',
    movement_type: DEFAULT_MOVEMENT_TYPE_BY_DIRECTION.stock_in,
    quantity: 1,
    location_id: '',
    source_location_id: '',
    destination_location_id: '',
    reference_id: '',
    notes: '',
    loss_reason: '',
    batch_id: 'oldest',
    expiry_date: ''
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [batches, setBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [scanCode, setScanCode] = useState('');
  const [scanFeedback, setScanFeedback] = useState(null);
  const [scanLoading, setScanLoading] = useState(false);

  const selectedItem = useMemo(
    () => findItemByFormId(items, formData.item_id),
    [items, formData.item_id]
  );

  const selectedLocationIdForBatches = useMemo(() => {
    if (formData.movement_type === 'transfer') {
      return formData.source_location_id || '';
    }
    return formData.location_id || '';
  }, [formData.location_id, formData.movement_type, formData.source_location_id]);

  const movementTypeOptions = useMemo(() => {
    if (formData.movement_direction === 'stock_out') return STOCK_OUT_TYPES;
    if (formData.movement_direction === 'transfer') return [{ value: 'transfer', label: 'Transfer' }];
    return STOCK_IN_TYPES;
  }, [formData.movement_direction]);
  const canTransferAcrossLocations = activeLocations.length > 1;

  const showLossReason = formData.movement_type === 'calculated_loss';
  const showTransferLocations = formData.movement_type === 'transfer';
  const showBatchSelector = STOCK_OUT_MOVEMENT_TYPES.has(formData.movement_type);
  const requiresSingleLocation = !showTransferLocations && activeLocations.length > 0;
  const locationIsRequiredHint = !showTransferLocations && activeLocations.length > 1;

  useEffect(() => {
    if (!open) return;
    if (activeLocations.length === 0) return;

    setFormData((previous) => {
      const next = { ...previous };
      if (!next.location_id && !showTransferLocations) {
        next.location_id = String(activeLocations[0].location_id);
      }
      if (showTransferLocations && !next.source_location_id) {
        next.source_location_id = String(activeLocations[0].location_id);
      }
      if (showTransferLocations && !next.destination_location_id) {
        const fallbackDestination = activeLocations.find(
          (location) => Number(location.location_id) !== Number(next.source_location_id)
        ) || activeLocations[0];
        next.destination_location_id = String(fallbackDestination.location_id);
      }
      return next;
    });
  }, [activeLocations, open, showTransferLocations]);

  useEffect(() => {
    if (!open) return;
    if (canTransferAcrossLocations) return;
    if (formData.movement_direction !== 'transfer') return;
    setFormData((previous) => ({
      ...previous,
      movement_direction: 'stock_in',
      movement_type: DEFAULT_MOVEMENT_TYPE_BY_DIRECTION.stock_in,
      source_location_id: '',
      destination_location_id: ''
    }));
  }, [canTransferAcrossLocations, formData.movement_direction, open]);

  useEffect(() => {
    if (preselectedItem) {
      setFormData((previous) => ({
        ...previous,
        item_id: String(preselectedItem.item_id || preselectedItem.id || ''),
        item_name: preselectedItem.name || ''
      }));
    }
  }, [preselectedItem]);

  useEffect(() => {
    const fetchBatches = async () => {
      if (!formData.item_id || !showBatchSelector) {
        setBatches([]);
        return;
      }
      if (!selectedItem?.fifo_enabled) {
        setBatches([]);
        return;
      }
      if (activeLocations.length > 1 && !selectedLocationIdForBatches) {
        setBatches([]);
        return;
      }

      const parsedItemId = Number.parseInt(formData.item_id, 10);
      if (!Number.isInteger(parsedItemId) || parsedItemId <= 0) {
        setBatches([]);
        return;
      }

      setLoadingBatches(true);
      try {
        const fetchedBatches = await itemService.getItemBatches(parsedItemId, {
          location_id: selectedLocationIdForBatches || undefined
        });
        setBatches(Array.isArray(fetchedBatches) ? fetchedBatches : []);
      } catch (error) {
        console.error("Failed to fetch batches:", error);
        setBatches([]);
      } finally {
        setLoadingBatches(false);
      }
    };

    fetchBatches();
  }, [
    activeLocations.length,
    formData.item_id,
    selectedItem?.fifo_enabled,
    selectedLocationIdForBatches,
    showBatchSelector
  ]);

  const handleChange = (field, value) => {
    setFormData((previous) => {
      const next = { ...previous, [field]: value };
      if (field === 'item_id') {
        const item = findItemByFormId(items, value);
        next.item_name = item?.name || '';
        next.batch_id = 'oldest';
      }
      return next;
    });
  };

  const handleDirectionChange = (direction) => {
    if (direction === 'transfer' && !canTransferAcrossLocations) {
      toast.error('Transfer requires at least two active locations.');
      return;
    }
    const defaultType = DEFAULT_MOVEMENT_TYPE_BY_DIRECTION[direction] || 'purchase_receipt';
    setFormData((previous) => ({
      ...previous,
      movement_direction: direction,
      movement_type: defaultType,
      batch_id: 'oldest',
      loss_reason: '',
      expiry_date: '',
      source_location_id: direction === 'transfer' ? previous.source_location_id : '',
      destination_location_id: direction === 'transfer' ? previous.destination_location_id : ''
    }));
  };

  const handleResolveBarcodeScan = async () => {
    const code = String(scanCode || '').trim();
    if (!code) {
      toast.error('Scan or type a barcode first.');
      return;
    }
    const scanLocationId = showTransferLocations ? formData.source_location_id : formData.location_id;
    if (activeLocations.length > 0 && !scanLocationId) {
      toast.error(showTransferLocations ? 'Select a source location before scanning.' : 'Select a stock location before scanning.');
      return;
    }

    setScanLoading(true);
    setScanFeedback(null);
    try {
      const result = await itemService.resolveItemBarcode({
        code,
        location_id: scanLocationId || undefined,
        operation: showTransferLocations ? 'transfer' : 'stock_movement'
      });
      if (result?.status !== 'resolved') {
        const reason = result?.reason_code || 'BARCODE_NOT_FOUND';
        setScanFeedback({ type: 'blocked', message: reason });
        toast.error(`Barcode not resolved: ${reason}`);
        return;
      }
      const barcode = result.barcode || {};
      const resolvedItemId = Number(barcode.item_id || barcode.item?.item_id);
      const matchedItem = items.find((candidate) => Number(candidate?.item_id || candidate?.id) === resolvedItemId);
      if (!matchedItem) {
        setScanFeedback({ type: 'blocked', message: 'Resolved item is not available in this movement form.' });
        toast.error('Resolved item is not available in this movement form.');
        return;
      }
      const multiplier = Number(barcode.quantity_multiplier || 1);
      setFormData((previous) => ({
        ...previous,
        item_id: String(matchedItem.item_id || matchedItem.id || ''),
        item_name: matchedItem.name || '',
        quantity: Number.isFinite(multiplier) && multiplier > 0 ? multiplier : previous.quantity,
        batch_id: barcode.scope === 'batch' && barcode.metadata?.batch_id
          ? String(barcode.metadata.batch_id)
          : previous.batch_id
      }));
      setSearchQuery('');
      setScanFeedback({
        type: 'resolved',
        message: `${matchedItem.name} selected${multiplier > 1 ? `, quantity x${multiplier}` : ''}.`
      });
      toast.success('Barcode resolved for stock movement.');
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || 'Failed to resolve barcode.';
      setScanFeedback({ type: 'blocked', message });
      toast.error(message);
    } finally {
      setScanLoading(false);
    }
  };

  const handleSubmit = () => {
    const parsedItemId = Number.parseInt(formData.item_id, 10);
    if (!Number.isInteger(parsedItemId) || parsedItemId <= 0) {
      toast.error('Select an item first.');
      return;
    }

    const quantity = Number.parseFloat(formData.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error('Quantity must be greater than 0.');
      return;
    }

    const payload = {
      item_id: parsedItemId,
      quantity,
      movement_type: formData.movement_type,
      reference_id: String(formData.reference_id || '').trim() || null,
      notes: String(formData.notes || '').trim() || null,
      batch_id: formData.batch_id && formData.batch_id !== 'oldest'
        ? Number.parseInt(formData.batch_id, 10)
        : null,
      expiry_date: formData.movement_type === 'purchase_receipt'
        ? (String(formData.expiry_date || '').trim() || null)
        : null,
      loss_reason: formData.movement_type === 'calculated_loss'
        ? (String(formData.loss_reason || '').trim() || null)
        : null
    };

    if (showTransferLocations) {
      const sourceLocationId = Number.parseInt(formData.source_location_id, 10);
      const destinationLocationId = Number.parseInt(formData.destination_location_id, 10);

      if (!Number.isInteger(sourceLocationId) || !Number.isInteger(destinationLocationId)) {
        toast.error('Select source and destination locations.');
        return;
      }
      if (sourceLocationId === destinationLocationId) {
        toast.error('Source and destination locations must be different.');
        return;
      }

      payload.source_location_id = sourceLocationId;
      payload.destination_location_id = destinationLocationId;
    } else {
      const locationId = Number.parseInt(formData.location_id, 10);
      if (requiresSingleLocation && !Number.isInteger(locationId)) {
        toast.error('Select a stock location.');
        return;
      }
      payload.location_id = Number.isInteger(locationId) ? locationId : null;
    }

    if (showLossReason && !payload.loss_reason) {
      toast.error('Select a loss reason.');
      return;
    }

    onSubmit(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Record Stock Movement</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label>Movement Direction</Label>
            <Select value={formData.movement_direction} onValueChange={handleDirectionChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOVEMENT_DIRECTION_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    disabled={option.value === 'transfer' && !canTransferAcrossLocations}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!canTransferAcrossLocations && (
              <p className="text-xs text-slate-500">
                Enable at least two active locations to use transfer movements.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-teal-100 bg-teal-50 p-3 space-y-2">
            <Label className="flex items-center gap-2 text-teal-900">
              <Barcode className="h-4 w-4" />
              Scan item, package, shelf, or batch label
            </Label>
            <div className="flex flex-wrap gap-2">
              <Input
                value={scanCode}
                onChange={(event) => setScanCode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleResolveBarcodeScan();
                  }
                }}
                placeholder="Scan before recording stock movement"
                className="min-w-[220px] flex-1 bg-white"
              />
              <Button type="button" variant="outline" onClick={handleResolveBarcodeScan} disabled={scanLoading}>
                {scanLoading ? 'Resolving...' : 'Resolve'}
              </Button>
            </div>
            <p className="text-xs text-teal-900">
              Scans only prefill item, batch, and suggested quantity. The submitted stock movement still enforces location and stock rules.
            </p>
            {scanFeedback && (
              <p className={cn('text-xs font-medium', scanFeedback.type === 'resolved' ? 'text-teal-700' : 'text-red-600')}>
                {scanFeedback.message}
              </p>
            )}
          </div>

          {formData.movement_direction !== 'transfer' && (
            <div className="space-y-2">
              <Label>Stock {formData.movement_direction === 'stock_in' ? 'In' : 'Out'} Type</Label>
              <Select value={formData.movement_type} onValueChange={(value) => handleChange('movement_type', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {movementTypeOptions.map((type) => {
                    const config = getMovementConfig(type.value);
                    const Icon = config.icon;
                    return (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <Icon className={cn("w-4 h-4", config.color)} />
                          {type.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

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
                  {selectedItem?.name || "Search items..."}
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
                        .filter((item) => String(item?.name || '').toLowerCase().includes(searchQuery.toLowerCase()))
                        .map((item) => {
                          const itemId = String(item.item_id || item.id || '');
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
                                  {formatNumber(item.current_stock, 2)} {item.unit_of_measure} total stock
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

          <div className="space-y-2">
            <Label>Quantity</Label>
            <Input
              type="number"
              min={0}
              value={formData.quantity}
              onChange={(e) => handleChange('quantity', e.target.value === '' ? '' : Number.parseFloat(e.target.value) || 0)}
            />
          </div>

          {showTransferLocations ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Source Location</Label>
                <Select value={formData.source_location_id} onValueChange={(value) => handleChange('source_location_id', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingLocations ? "Loading locations..." : "Select source"} />
                  </SelectTrigger>
                  <SelectContent>
                    {activeLocations.map((location) => (
                      <SelectItem key={`source-${location.location_id}`} value={String(location.location_id)}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Destination Location</Label>
                <Select value={formData.destination_location_id} onValueChange={(value) => handleChange('destination_location_id', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingLocations ? "Loading locations..." : "Select destination"} />
                  </SelectTrigger>
                  <SelectContent>
                    {activeLocations.map((location) => (
                      <SelectItem key={`destination-${location.location_id}`} value={String(location.location_id)}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Location</Label>
              <Select value={formData.location_id} onValueChange={(value) => handleChange('location_id', value)}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingLocations ? "Loading locations..." : "Select location"} />
                </SelectTrigger>
                <SelectContent>
                  {activeLocations.map((location) => (
                    <SelectItem key={`location-${location.location_id}`} value={String(location.location_id)}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {locationIsRequiredHint && !formData.location_id && (
                <p className="text-xs text-red-600">Required when multiple active locations exist.</p>
              )}
            </div>
          )}

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

          {showBatchSelector && selectedItem?.fifo_enabled && (
            <div className="space-y-2">
              <Label>FIFO Batch (Optional)</Label>
              <Select value={formData.batch_id} onValueChange={(value) => handleChange('batch_id', value)}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingBatches ? "Loading batches..." : "Auto-select oldest batch"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="oldest">Auto-select oldest batch</SelectItem>
                  {batches.map((batch) => {
                    const available = Number.parseFloat(batch.quantity || 0) - Number.parseFloat(batch.quantity_consumed || 0);
                    return (
                      <SelectItem key={batch.batch_id} value={String(batch.batch_id)}>
                        #{batch.batch_id} - Qty: {formatNumber(available, 2)} - Exp: {batch.expiry_date ? format(new Date(batch.expiry_date), 'MMM d, yyyy') : 'N/A'}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {!loadingBatches && batches.length === 0 && (
                <p className="text-xs text-slate-500">No available batches for the selected location.</p>
              )}
            </div>
          )}

          {showLossReason && (
            <div className="space-y-2">
              <Label>Loss Reason</Label>
              <Select value={formData.loss_reason} onValueChange={(value) => handleChange('loss_reason', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  {lossReasons.map((reason) => (
                    <SelectItem key={reason.value} value={reason.value}>{reason.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Reference ID (Optional)</Label>
            <Input
              value={formData.reference_id}
              onChange={(e) => handleChange('reference_id', e.target.value)}
              placeholder="e.g., PO-001, JO-002"
            />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Add any notes about this movement..."
              rows={3}
            />
          </div>

          {selectedItem && Number(formData.quantity) > 0 && (
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 text-sm">
              <h4 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-slate-500" />
                Stock Impact
              </h4>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-slate-500 text-xs uppercase tracking-wide">Current</p>
                  <p className="font-medium text-slate-900 mt-0.5">
                    {formatNumber(selectedItem.current_stock || 0, 2)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs uppercase tracking-wide">Change</p>
                  <p className={cn(
                    "font-medium mt-0.5",
                    formData.movement_type === 'transfer' ? 'text-blue-600' : (
                      isPositiveMovement(formData.movement_type) ? "text-emerald-600" : "text-red-500"
                    )
                  )}>
                    {formData.movement_type === 'transfer'
                      ? 'No net change'
                      : `${isPositiveMovement(formData.movement_type) ? '+' : '-'}${formatNumber(formData.quantity, 2)}`}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs uppercase tracking-wide">Projected</p>
                  <p className="font-bold text-slate-900 mt-0.5">
                    {(() => {
                      const current = Number.parseFloat(selectedItem.current_stock || 0);
                      const change = Number.parseFloat(formData.quantity || 0);
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
            disabled={!formData.item_id || Number(formData.quantity) <= 0}
            className="bg-teal-600 hover:bg-teal-700"
          >
            Record Movement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
