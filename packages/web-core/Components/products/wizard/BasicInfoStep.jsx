import React from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UomSelect } from '@/components/ui/UomSelect';

export default function BasicInfoStep({
  data,
  updateData,
  onSkuChange,
  locations = [],
  loadingLocations = false,
  stockAllocationDraft = {},
  onStockAllocationChange,
  existingStockByLocation = new Map()
}) {
  const activeLocations = Array.isArray(locations) ? locations.filter((location) => location?.is_active !== false) : [];
  const getExistingStock = (locationId) => {
    if (existingStockByLocation instanceof Map) {
      return Number(existingStockByLocation.get(String(locationId)) || 0);
    }
    return Number(existingStockByLocation?.[String(locationId)] || 0);
  };

  return (
    <div className="space-y-6">
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
        <h3 className="wizard-section-title font-semibold text-teal-900 mb-1">Product Basic Information</h3>
        <p className="text-sm text-teal-700">Start by defining the core details of your product.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Product Name *</Label>
          <Input
            placeholder="e.g., Ginger Tea Mix"
            value={data.name}
            onChange={(e) => updateData({ name: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label>SKU Code *</Label>
          <Input
            placeholder="Auto-generated from product name"
            value={data.sku_code}
            onChange={(e) => {
              if (typeof onSkuChange === 'function') {
                onSkuChange(e.target.value);
                return;
              }
              updateData({ sku_code: e.target.value });
            }}
          />
        </div>

        <div className="space-y-2">
          <Label>Product Type *</Label>
          <Select
            value={data.product_type || 'finished_goods'}
            onValueChange={(val) => updateData({ product_type: val, category: 'product' })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="finished_goods">Finished Goods</SelectItem>
              <SelectItem value="work_in_progress">Work In Progress</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-500">
            Finished Goods are final products ready for sale. Work In Progress can be used as ingredients in other products.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Unit of Measure *</Label>
          <UomSelect
            value={data.unit_of_measure}
            onValueChange={(val) => updateData({ unit_of_measure: val })}
            placeholder="Select unit..."
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label>VAT Type {data.product_type === 'finished_goods' ? '*' : ''}</Label>
          <Select
            value={data.vat_type || 'vatable'}
            onValueChange={(val) => updateData({ vat_type: val })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vatable">Vatable (12%)</SelectItem>
              <SelectItem value="vat_exempt">VAT Exempt</SelectItem>
              <SelectItem value="zero_rated">Zero Rated</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-500">
            Required for finished goods sold in POS. This value is snapshotted into every POS sale line.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          placeholder="Describe your product, its features, and intended use..."
          value={data.description ?? ''}
          onChange={(e) => updateData({ description: e.target.value })}
          className="h-24"
        />
      </div>

      <div className="border-t border-slate-200 pt-4 mt-4">
        <h4 className="wizard-section-title font-medium text-slate-900 mb-4">Inventory Settings</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Max Capacity *</Label>
            <Input
              type="number"
              placeholder="1000"
              value={data.max_capacity || ''}
              onChange={(e) => updateData({ max_capacity: parseFloat(e.target.value) || null })}
            />
            <p className="text-xs text-slate-500">Maximum stock capacity</p>
          </div>

          <div className="space-y-3 md:col-span-2">
            <div>
              <Label>Optional stock additions by branch</Label>
              <p className="text-xs text-slate-500">
                Add stock independently at each branch. Existing balances are reference-only and are not replaced.
              </p>
            </div>
            {loadingLocations ? (
              <p className="text-xs text-slate-500">Loading active branches...</p>
            ) : activeLocations.length === 0 ? (
              <p className="text-xs text-amber-700">Add an active branch before assigning stock.</p>
            ) : (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                {activeLocations.map((location) => {
                  const locationKey = String(location.location_id);
                  const currentBalance = getExistingStock(location.location_id);
                  return (
                    <div key={`product-stock-allocation-${locationKey}`} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,8rem)] sm:items-center">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{location.name}</p>
                        <p className="text-xs text-slate-500">On hand: {currentBalance} {data.unit_of_measure || 'units'}</p>
                      </div>
                      <span className="hidden text-xs text-slate-400 sm:inline">Add</span>
                      <Input
                        aria-label={`Add stock at ${location.name}`}
                        type="number"
                        min={0}
                        step="any"
                        placeholder="0"
                        value={stockAllocationDraft[locationKey] ?? ''}
                        onChange={(event) => onStockAllocationChange?.(location.location_id, event.target.value)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Auto-calculated threshold display */}
          {data.max_capacity > 0 && (
            <div className="col-span-2 bg-slate-50 rounded-lg p-4 border border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-slate-700">
                  Auto-calculated from System Settings
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500">Min Threshold (40%)</p>
                  <p className="font-semibold text-slate-900">
                    {Math.round(data.max_capacity * 0.4)} {data.unit_of_measure || 'units'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Purchase Allowance (20%)</p>
                  <p className="font-semibold text-slate-900">
                    {Math.round(data.max_capacity * 0.2)} {data.unit_of_measure || 'units'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

