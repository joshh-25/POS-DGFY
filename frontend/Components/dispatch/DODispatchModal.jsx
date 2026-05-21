import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, PackageCheck } from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber } from '../../src/lib/numberUtils.js';
import { listTenantLocations } from '../../src/services/tenantLocationService.js';

/**
 * DODispatchModal - execute dispatch (stock deduction) for one or more lines.
 *
 * Props:
 *   open        {boolean}
 *   onClose     {function}
 *   onDispatch  {function({ lines, locationId })} - must return a promise
 *   do_         {Object} - the Dispatch Order with .lines array
 */
export default function DODispatchModal({ open, onClose, onDispatch, do: doOrder }) {
  const [quantities, setQuantities] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [locations, setLocations] = useState([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState('');

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const loadLocations = async () => {
      setLoadingLocations(true);
      try {
        const rows = await listTenantLocations({ include_inactive: false });
        if (cancelled) return;

        const activeLocations = (Array.isArray(rows) ? rows : []).filter(
          (location) => location?.is_active !== false
        );
        setLocations(activeLocations);

        if (activeLocations.length === 1) {
          setSelectedLocationId(String(activeLocations[0].location_id));
          return;
        }

        setSelectedLocationId((previous) => {
          if (
            previous
            && activeLocations.some((location) => Number(location.location_id) === Number(previous))
          ) {
            return previous;
          }
          return '';
        });
      } catch (_error) {
        if (!cancelled) {
          setLocations([]);
          setSelectedLocationId('');
        }
      } finally {
        if (!cancelled) {
          setLoadingLocations(false);
        }
      }
    };

    loadLocations();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const requiresLocationSelection = useMemo(() => locations.length > 1, [locations]);

  // Dispatchable lines are those with remaining quantity > 0.
  const dispatchableLines = (doOrder?.lines || []).filter((line) => {
    const remaining = parseFloat(line.qty_ordered) - parseFloat(line.qty_dispatched || 0);
    return remaining > 0;
  });

  const getQty = (lineId) => quantities[lineId] ?? '';

  const setQty = (lineId, value) => {
    setQuantities((prev) => ({ ...prev, [lineId]: value }));
  };

  const getRemaining = (line) => {
    return parseFloat(line.qty_ordered) - parseFloat(line.qty_dispatched || 0);
  };

  const handleSetMax = (line) => {
    setQty(line.line_id, String(getRemaining(line)));
  };

  const validate = () => {
    if (requiresLocationSelection && !selectedLocationId) {
      toast.error('Select a location before dispatching.');
      return false;
    }

    const entries = dispatchableLines.filter((line) => {
      const qty = parseFloat(getQty(line.line_id));
      return !Number.isNaN(qty) && qty > 0;
    });

    if (entries.length === 0) {
      toast.error('Enter a quantity to dispatch for at least one line');
      return false;
    }

    for (const line of entries) {
      const qty = parseFloat(getQty(line.line_id));
      const remaining = getRemaining(line);
      if (qty > remaining) {
        toast.error(`Line for "${line.item?.name}" exceeds remaining qty (${formatNumber(remaining)})`);
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!doOrder) return;
    if (!validate()) return;

    setSubmitting(true);
    try {
      const lines = dispatchableLines
        .filter((line) => {
          const qty = parseFloat(getQty(line.line_id));
          return !Number.isNaN(qty) && qty > 0;
        })
        .map((line) => ({
          line_id: line.line_id,
          qty_to_dispatch: parseFloat(getQty(line.line_id))
        }));

      await onDispatch({
        lines,
        locationId: selectedLocationId ? Number.parseInt(selectedLocationId, 10) : null
      });

      setQuantities({});
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Dispatch failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setQuantities({});
    if (locations.length !== 1) {
      setSelectedLocationId('');
    }
    onClose();
  };

  if (!doOrder) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-teal-600" />
            Execute Dispatch - {doOrder.do_number}
          </DialogTitle>
          <DialogDescription>
            Enter quantities to dispatch for this run. Partial dispatch is supported.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="text-sm text-slate-600">
            <span className="font-medium">Recipient:</span> {doOrder.recipient_name}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Stock Location</Label>
            {loadingLocations ? (
              <div className="text-xs text-slate-500">Loading locations...</div>
            ) : requiresLocationSelection ? (
              <select
                className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={selectedLocationId}
                onChange={(event) => setSelectedLocationId(event.target.value)}
                disabled={submitting}
              >
                <option value="">Select location</option>
                {locations.map((location) => (
                  <option key={`do-dispatch-location-${location.location_id}`} value={location.location_id}>
                    {location.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-xs text-slate-600 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                {locations[0]?.name || 'Default location'}
              </div>
            )}
          </div>

          {dispatchableLines.length === 0 ? (
            <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
              All lines have been fully dispatched.
            </p>
          ) : (
            <div className="space-y-3">
              {dispatchableLines.map((line) => {
                const remaining = getRemaining(line);
                const itemName = line.item?.name || `Item #${line.item_id}`;
                const qtyInput = getQty(line.line_id);

                return (
                  <div key={line.line_id} className="border border-slate-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{itemName}</p>
                        <p className="text-xs text-slate-500">{line.item?.sku_code}</p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="text-slate-500">Ordered: <span className="font-medium text-slate-700">{formatNumber(line.qty_ordered)}</span></p>
                        <p className="text-slate-500">Dispatched: <span className="font-medium text-slate-700">{formatNumber(line.qty_dispatched || 0)}</span></p>
                        <p className="text-teal-600 font-medium">Remaining: {formatNumber(remaining)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">Qty to dispatch now</Label>
                        <Input
                          type="number"
                          min="0.001"
                          max={remaining}
                          step="any"
                          placeholder={`Max: ${formatNumber(remaining)}`}
                          value={qtyInput}
                          onChange={(event) => setQty(line.line_id, event.target.value)}
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-5 text-xs"
                        onClick={() => handleSetMax(line)}
                      >
                        Full
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          {dispatchableLines.length > 0 && (
            <Button onClick={handleSubmit} disabled={submitting} className="bg-teal-600 hover:bg-teal-700">
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Dispatch
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
