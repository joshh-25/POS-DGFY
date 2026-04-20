import React, { useMemo, useState } from 'react';
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Star, CheckCircle, XCircle, Calendar } from 'lucide-react';
import { cn } from "../../src/lib/utils.js";
import { formatQty } from '../../src/lib/numberUtils.js';
import { format, addDays } from 'date-fns';
import { useLocations } from '../../src/hooks/useLocations.js';

const getUnitPriceVarianceMeta = ({ unitPrice = 0, baselineCost = 0 }) => {
  if (!(baselineCost > 0)) return null;
  const variancePercent = ((unitPrice - baselineCost) / baselineCost) * 100;
  if (Math.abs(variancePercent) < 0.05) {
    return {
      label: 'At average',
      className: 'bg-slate-100 text-slate-700 border-slate-200'
    };
  }
  return {
    label: `${variancePercent > 0 ? '+' : ''}${variancePercent.toFixed(1)}% vs avg`,
    className: variancePercent > 0
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
  };
};

const buildReceiptItems = (poItems = []) => poItems.map((item) => {
  let calculatedExpiry = null;
  if (item.fifo_enabled && item.shelf_life_days) {
    calculatedExpiry = format(addDays(new Date(), item.shelf_life_days), 'yyyy-MM-dd');
  }
  return {
    ...item,
    quantity_received: item.quantity_received || item.quantity,
    quality_check: item.quality_check || 'pass',
    weighted_avg_cost: Number(item.weighted_avg_cost || item?.cost_metrics?.scoped?.weighted_avg_cost || item?.cost_metrics?.global?.weighted_avg_cost || item.cost_per_unit || 0),
    expiry_date: item.expiry_date || calculatedExpiry || ''
  };
});

export default function POReceiptModal({
  po,
  open,
  onClose,
  onConfirm,
  onLocationChange = null,
  locationUpdating = false
}) {
  const { locations, loading: loadingLocations } = useLocations();
  const activeLocations = useMemo(
    () => (Array.isArray(locations) ? locations.filter((location) => location?.is_active !== false) : []),
    [locations]
  );
  const [manualLocationId, setManualLocationId] = useState('');
  const [itemDrafts, setItemDrafts] = useState({});
  const [deliveryRating, setDeliveryRating] = useState(5);
  const [notes, setNotes] = useState(po.notes || '');
  const items = useMemo(() => {
    const draftMap = itemDrafts || {};
    return buildReceiptItems(po.items).map((item) => {
      const draft = draftMap[Number(item.line_item_id)] || {};
      return {
        ...item,
        quantity_received: draft.quantity_received ?? item.quantity_received,
        quality_check: draft.quality_check ?? item.quality_check,
        expiry_date: draft.expiry_date ?? item.expiry_date
      };
    });
  }, [po.items, itemDrafts]);
  const selectedLocationId = useMemo(() => {
    if (
      manualLocationId &&
      activeLocations.some((location) => String(location.location_id) === String(manualLocationId))
    ) {
      return String(manualLocationId);
    }
    if (activeLocations.length === 1) {
      return String(activeLocations[0].location_id);
    }
    return '';
  }, [manualLocationId, activeLocations]);
  const requiresLocationSelection = activeLocations.length > 1;

  const handleLocationChange = (value) => {
    setManualLocationId(value);
    if (typeof onLocationChange === 'function') {
      onLocationChange(value);
    }
  };

  const updateItem = (index, field, value) => {
    const targetItem = items[index];
    if (!targetItem) return;
    const lineItemId = Number(targetItem.line_item_id);
    if (!Number.isInteger(lineItemId) || lineItemId <= 0) return;
    setItemDrafts((prev) => {
      const currentDraft = prev[lineItemId] || {};
      return {
        ...prev,
        [lineItemId]: {
          ...currentDraft,
          [field]: value
        }
      };
    });
  };

  const handleConfirm = () => {
    // Convert empty strings to 0 for number fields
    const cleanedItems = items.map(item => ({
      ...item,
      quantity_received: item.quantity_received === '' ? 0 : item.quantity_received,
      expiry_date: item.expiry_date || null // Include expiry date
    }));
    const allReceived = cleanedItems.every(item => parseFloat(item.quantity_received) === parseFloat(item.quantity));
    const anyReceived = cleanedItems.some(item => item.quantity_received > 0);

    onConfirm({
      items: cleanedItems,
      location_id: selectedLocationId ? Number(selectedLocationId) : null,
      status: allReceived ? 'received' : (anyReceived ? 'partial' : 'pending'),
      delivery_rating: deliveryRating,
      notes
    });
  };

  const markAllReceived = () => {
    setItemDrafts(() => {
      const nextDrafts = {};
      items.forEach((item) => {
        const lineItemId = Number(item.line_item_id);
        if (!Number.isInteger(lineItemId) || lineItemId <= 0) return;
        nextDrafts[lineItemId] = {
          quantity_received: parseFloat(item.quantity) || 0,
          quality_check: 'pass',
          expiry_date: item.expiry_date || ''
        };
      });
      return nextDrafts;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receive Items - {po.po_number}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          <div className="flex items-center justify-between bg-slate-50 rounded-xl p-4">
            <div>
              <p className="text-sm text-slate-500">Supplier</p>
              <p className="font-semibold text-slate-900">{po.supplier_name}</p>
            </div>
            <Button variant="outline" size="sm" onClick={markAllReceived}>
              Mark All Received
            </Button>
          </div>

          {/* Items */}
          <div className="space-y-3">
            {items.map((item, idx) => {
              const varianceMeta = getUnitPriceVarianceMeta({
                unitPrice: Number(item.unit_price || 0),
                baselineCost: Number(item.weighted_avg_cost || 0)
              });

              return (
              <div key={idx} className="bg-slate-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="space-y-1">
                    <span className="font-medium text-slate-900 block">{item.item_name}</span>
                    {varianceMeta && (
                      <Badge variant="outline" className={varianceMeta.className}>
                        {varianceMeta.label}
                      </Badge>
                    )}
                  </div>
                  <Badge variant="outline">Ordered: {formatQty(item.quantity)}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Quantity Received</Label>
                    <Input
                      type="number"
                      min={0}
                      max={parseFloat(item.quantity) || 0}
                      step="0.01"
                      value={item.quantity_received}
                      onChange={(e) => updateItem(idx, 'quantity_received', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Quality Check</Label>
                    <Select
                      value={item.quality_check}
                      onValueChange={(v) => updateItem(idx, 'quality_check', v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pass">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-emerald-500" />
                            Pass
                          </div>
                        </SelectItem>
                        <SelectItem value="fail">
                          <div className="flex items-center gap-2">
                            <XCircle className="w-4 h-4 text-red-500" />
                            Fail
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Expiry Date - shown for FIFO-enabled items */}
                {item.fifo_enabled && (
                  <div className="mt-3 pt-3 border-t border-slate-200">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-blue-500" />
                        <Label className="text-xs font-medium text-blue-700">Expiry Date</Label>
                        {item.shelf_life_days && (
                          <span className="text-xs text-slate-500">
                            (Auto: +{item.shelf_life_days} days)
                          </span>
                        )}
                      </div>
                      <Input
                        type="date"
                        value={item.expiry_date || ''}
                        onChange={(e) => updateItem(idx, 'expiry_date', e.target.value)}
                        className="bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>

          {/* Delivery Rating */}
          <div className="space-y-2">
            <Label>Receive Location</Label>
            <Select
              value={selectedLocationId}
              onValueChange={handleLocationChange}
              disabled={loadingLocations || activeLocations.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingLocations ? "Loading locations..." : "Select location"} />
              </SelectTrigger>
              <SelectContent>
                {activeLocations.map((location) => (
                  <SelectItem key={location.location_id} value={String(location.location_id)}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {requiresLocationSelection && !selectedLocationId && (
              <p className="text-xs text-red-600">Location is required when multiple active locations exist.</p>
            )}
            {locationUpdating && (
              <p className="text-xs text-slate-500">Refreshing location-based average cost...</p>
            )}
          </div>

          {/* Delivery Rating */}
          <div className="space-y-2">
            <Label>Delivery Rating</Label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  onClick={() => setDeliveryRating(star)}
                  className="focus:outline-none"
                >
                  <Star
                    className={cn(
                      "w-8 h-8 transition-colors",
                      star <= deliveryRating ? "text-amber-500" : "text-slate-200"
                    )}
                    fill={star <= deliveryRating ? "currentColor" : "none"}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this delivery..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="pt-8">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedLocationId || loadingLocations || locationUpdating}
            className="bg-teal-600 hover:bg-teal-700"
          >
            Confirm Receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
