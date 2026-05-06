import React, { useMemo, useState } from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Package, TrendingDown, AlertTriangle, Trash2, MapPin, Check } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from "../../src/lib/utils.js";
import { formatNumber, formatPeso } from '../../src/lib/numberUtils.js';
import { isNearExpiry, isExpired } from '@/components/utils/expiryHelpers.js';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import WriteOffBatchDialog from './WriteOffBatchDialog.jsx';

const locationKey = (locationId) => {
  const parsed = Number.parseInt(locationId, 10);
  return Number.isInteger(parsed) && parsed > 0 ? String(parsed) : 'unassigned';
};

const locationLabel = (value) => (
  value?.location?.name
  || value?.location_name
  || value?.name
  || (value?.location_id ? `#${value.location_id}` : 'Unassigned')
);

const remainingQuantity = (batch) => (
  Number.parseFloat(batch.quantity || 0) - Number.parseFloat(batch.quantity_consumed || 0)
);

const sortBatches = (batches = []) => (
  [...batches].sort((a, b) => new Date(a.received_date) - new Date(b.received_date))
);

const resolveNextBatchId = (batches = []) => {
  const index = batches.findIndex((batch) => !isExpired(batch.expiry_date));
  return index === -1 ? null : batches[index]?.batch_id;
};

const LocationMetric = ({ label, value }) => (
  <div className="min-w-0">
    <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
    <p className="truncate text-sm font-semibold text-slate-900">{value}</p>
  </div>
);

const buildLocationGroups = (item = {}, activeBatches = []) => {
  const groups = new Map();

  const ensureGroup = (key, seed = {}) => {
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        location_id: key === 'unassigned' ? null : Number.parseInt(key, 10),
        label: locationLabel(seed),
        stock_qty: null,
        weighted_avg_cost: null,
        inventory_value: null,
        batches: []
      });
    }
    return groups.get(key);
  };

  (Array.isArray(item.item_location_stocks) ? item.item_location_stocks : []).forEach((row) => {
    const key = locationKey(row?.location_id);
    const group = ensureGroup(key, row);
    group.stock_qty = Number.parseFloat(row?.quantity_on_hand || 0);
  });

  (Array.isArray(item?.cost_metrics?.by_location) ? item.cost_metrics.by_location : []).forEach((row) => {
    const key = locationKey(row?.location_id);
    const group = ensureGroup(key, row);
    group.stock_qty = group.stock_qty == null ? Number.parseFloat(row?.available_qty || 0) : group.stock_qty;
    group.weighted_avg_cost = Number.parseFloat(row?.weighted_avg_cost || 0);
    group.inventory_value = Number.parseFloat(row?.inventory_value || 0);
  });

  activeBatches.forEach((batch) => {
    const key = locationKey(batch?.location_id);
    const group = ensureGroup(key, batch);
    group.batches.push(batch);
  });

  return Array.from(groups.values())
    .map((group) => {
      const batches = sortBatches(group.batches);
      const batchQty = batches.reduce((sum, batch) => sum + remainingQuantity(batch), 0);
      const weightedCost = batchQty > 0
        ? batches.reduce((sum, batch) => sum + (remainingQuantity(batch) * Number.parseFloat(batch.cost_per_unit || 0)), 0) / batchQty
        : 0;
      return {
        ...group,
        batches,
        batch_qty: batchQty,
        weighted_avg_cost: group.weighted_avg_cost || weightedCost,
        inventory_value: group.inventory_value || (weightedCost * batchQty),
        next_batch_id: resolveNextBatchId(batches)
      };
    })
    .sort((a, b) => {
      if (a.key === 'unassigned') return 1;
      if (b.key === 'unassigned') return -1;
      return String(a.label).localeCompare(String(b.label));
    });
};

const BatchCard = ({ batch, item, isNextToUse, onWriteOff }) => {
  const nearExpiry = isNearExpiry(batch.expiry_date);
  const expired = isExpired(batch.expiry_date);
  const remaining = remainingQuantity(batch);

  return (
    <div
      className={cn(
        "bg-white rounded-lg p-3 border-2",
        isNextToUse ? "border-blue-500" : "border-slate-200",
        expired && "opacity-60 border-red-300"
      )}
    >
      <div className="flex items-start justify-between mb-2 gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="break-all text-sm font-semibold text-slate-900">
              Batch {batch.batch_id}
            </span>
            {isNextToUse && (
              <Badge className="bg-blue-500 text-white text-xs">Next to use</Badge>
            )}
            {expired && (
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                Expired
              </Badge>
            )}
            {nearExpiry && !expired && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                Expiring Soon
              </Badge>
            )}
          </div>
          <p className="mt-1 break-words text-xs text-slate-500">
            PO: {batch.po_number || 'N/A'}
          </p>
          {batch.notes && (
            <p className="mt-1 break-words text-xs italic text-slate-600">
              Note: {batch.notes}
            </p>
          )}
        </div>
        <div className="flex items-start gap-2">
          <div className="text-right">
            <p className="text-lg font-bold text-slate-900">{formatNumber(remaining, 2)}</p>
            <p className="text-xs text-slate-500">{item.unit_of_measure}</p>
          </div>
          {expired && (
            <Button
              size="sm"
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 h-8 px-2 flex-shrink-0"
              aria-label={`Write off expired batch ${batch.batch_id}`}
              onClick={(event) => {
                event.stopPropagation();
                onWriteOff(batch);
              }}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Write Off
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-3 text-slate-600">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            Received: {format(new Date(batch.received_date), 'MMM d, yyyy')}
          </span>
          {batch.expiry_date ? (
            <span className={cn(
              "flex items-center gap-1",
              expired ? "text-red-600" : nearExpiry ? "text-amber-600" : ""
            )}>
              <TrendingDown className="w-3 h-3" />
              Expires: {format(new Date(batch.expiry_date), 'MMM d, yyyy')}
            </span>
          ) : (
            <span className="text-slate-400 italic">No expiry</span>
          )}
        </div>
        <span className="font-semibold text-slate-900">
          {formatPeso(batch.cost_per_unit || 0)}/unit
        </span>
      </div>
    </div>
  );
};

export default function FIFOBatchViewer({ item, onRefresh }) {
  const [writeOffTarget, setWriteOffTarget] = useState(null);
  const [locationFilter, setLocationFilter] = useState({ itemId: null, key: 'all' });
  const isServiceOnlyItem = String(item?.category || '').trim().toLowerCase() === 'service';
  const itemId = item?.item_id ?? null;

  const activeBatches = useMemo(() => (
    (item?.fifo_batches || []).filter((batch) => remainingQuantity(batch) > 0)
  ), [item?.fifo_batches]);

  const locationGroups = useMemo(() => buildLocationGroups(item, activeBatches), [item, activeBatches]);
  const requestedLocationKey = locationFilter.itemId === itemId ? locationFilter.key : 'all';
  const selectedLocationKey = requestedLocationKey === 'all'
    || locationGroups.some((group) => group.key === requestedLocationKey)
    ? requestedLocationKey
    : 'all';
  const selectLocationKey = (key) => setLocationFilter({ itemId, key });

  if (!item?.fifo_enabled || isServiceOnlyItem) return null;

  const visibleGroups = selectedLocationKey === 'all'
    ? locationGroups
    : locationGroups.filter((group) => group.key === selectedLocationKey);
  const visibleBatches = visibleGroups.flatMap((group) => group.batches);

  if (activeBatches.length === 0) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
        <Package className="w-8 h-8 text-slate-400 mx-auto mb-2" />
        <p className="text-sm text-slate-500">No active FIFO batches</p>
        <p className="text-xs text-slate-400 mt-1">
          Batches are created when POs are received or JOs complete
        </p>
      </div>
    );
  }

  const totalQuantity = visibleBatches.reduce((sum, batch) => sum + remainingQuantity(batch), 0);
  const weightedAvgCost = totalQuantity > 0
    ? visibleBatches.reduce((sum, batch) => (
      sum + (remainingQuantity(batch) * Number.parseFloat(batch.cost_per_unit || 0))
    ), 0) / totalQuantity
    : 0;
  const expiredCount = visibleBatches.filter((batch) => isExpired(batch.expiry_date)).length;
  const nearExpiryCount = visibleBatches.filter((batch) => isNearExpiry(batch.expiry_date)).length;
  const showLocationFilter = locationGroups.length > 1;

  return (
    <>
      <Accordion type="single" collapsible defaultValue="fifo-batches" className="bg-blue-50 border border-blue-200 rounded-xl overflow-hidden">
        <AccordionItem value="fifo-batches" className="border-none">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-blue-100/50 [&[data-state=open]]:bg-blue-50">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <Package className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <h4 className="font-semibold text-blue-900">FIFO Batches By Location</h4>
              <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">
                {visibleBatches.length} batch{visibleBatches.length !== 1 ? 'es' : ''}
              </Badge>
              {expiredCount > 0 && (
                <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {expiredCount} expired
                </Badge>
              )}
              {nearExpiryCount > 0 && (
                <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200">
                  {nearExpiryCount} expiring soon
                </Badge>
              )}
            </div>
          </AccordionTrigger>

          <AccordionContent className="px-4 pb-4 pt-0">
            {showLocationFilter && (
              <div className="mb-3 flex flex-wrap gap-2" aria-label="FIFO batch location filters">
                <Button
                  type="button"
                  size="sm"
                  variant={selectedLocationKey === 'all' ? 'default' : 'outline'}
                  aria-pressed={selectedLocationKey === 'all'}
                  aria-label="Show FIFO batches for all locations"
                  className={cn(
                    "max-w-full gap-1.5",
                    selectedLocationKey === 'all' && "ring-2 ring-teal-200 ring-offset-1"
                  )}
                  onClick={() => selectLocationKey('all')}
                >
                  {selectedLocationKey === 'all' && <Check className="h-3.5 w-3.5" />}
                  <span className="truncate">All locations</span>
                </Button>
                {locationGroups.map((group) => (
                  <Button
                    key={`fifo-location-filter-${group.key}`}
                    type="button"
                    size="sm"
                    variant={selectedLocationKey === group.key ? 'default' : 'outline'}
                    aria-pressed={selectedLocationKey === group.key}
                    aria-label={`Show FIFO batches for ${group.label}`}
                    className={cn(
                      "max-w-full gap-1.5",
                      selectedLocationKey === group.key && "ring-2 ring-teal-200 ring-offset-1"
                    )}
                    onClick={() => selectLocationKey(group.key)}
                  >
                    {selectedLocationKey === group.key && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
                    <span className="truncate">{group.label}</span>
                  </Button>
                ))}
              </div>
            )}

            <div className="space-y-3">
              {visibleGroups.map((group) => (
                <div key={`fifo-location-${group.key}`} className="space-y-3 rounded-lg border border-blue-100 bg-white/80 p-3">
                  <div className="space-y-3 border-b border-blue-100 pb-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <MapPin className="h-4 w-4 flex-shrink-0 text-blue-700" />
                      <span className="min-w-0 break-words text-sm font-semibold text-blue-950">{group.label}</span>
                      <Badge variant="outline" className="bg-white border-blue-200 text-blue-700">
                        {group.batches.length} batch{group.batches.length !== 1 ? 'es' : ''}
                      </Badge>
                      {group.next_batch_id && (
                        <Badge variant="outline" className="bg-blue-50 border-blue-200 text-blue-700">
                          Next: Batch {group.next_batch_id}
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      <LocationMetric
                        label="On hand"
                        value={`${formatNumber(group.stock_qty ?? group.batch_qty, 2)} ${item.unit_of_measure}`}
                      />
                      <LocationMetric
                        label="Batch qty"
                        value={`${formatNumber(group.batch_qty, 2)} ${item.unit_of_measure}`}
                      />
                      <LocationMetric
                        label="Avg cost"
                        value={formatPeso(group.weighted_avg_cost || 0)}
                      />
                      <LocationMetric
                        label="Value"
                        value={formatPeso(group.inventory_value || 0)}
                      />
                    </div>
                  </div>

                  {group.batches.length > 0 ? (
                    <div className="space-y-2">
                      {group.batches.map((batch) => (
                        <BatchCard
                          key={batch.batch_id}
                          batch={batch}
                          item={item}
                          isNextToUse={batch.batch_id === group.next_batch_id}
                          onWriteOff={setWriteOffTarget}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-500">
                      No active FIFO batches for this location.
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 border-t border-blue-200 pt-3 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-md bg-white/60 px-3 py-2 text-sm">
                <span className="text-blue-700">Visible Quantity</span>
                <span className="text-right font-semibold text-blue-900">
                  {formatNumber(totalQuantity, 2)} {item.unit_of_measure}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md bg-white/60 px-3 py-2 text-sm">
                <span className="text-blue-700">Visible Weighted Avg Cost</span>
                <span className="text-right font-semibold text-blue-900">
                  {formatPeso(weightedAvgCost || 0)}/unit
                </span>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <WriteOffBatchDialog
        open={!!writeOffTarget}
        onClose={() => setWriteOffTarget(null)}
        batch={writeOffTarget}
        item={item}
        onSuccess={() => {
          setWriteOffTarget(null);
          onRefresh?.();
        }}
      />
    </>
  );
}
