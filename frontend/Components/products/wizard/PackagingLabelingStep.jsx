import React, { useMemo } from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, CheckCircle, XCircle, Plus, Trash2, AlertTriangle, Search } from 'lucide-react';
import { cn } from "../../../src/lib/utils.js";
import { formatNumber, formatQty } from '../../../src/lib/numberUtils.js';
import { canBeProductPackaging } from '@/components/utils/categoryHelpers';

export default function PackagingLabelingStep({ data, updateData, items }) {
  // Ensure packaging_info is an object, even if it comes in as something else (like an ID from bad state)
  const packaging = (data.packaging_info && typeof data.packaging_info === 'object') ? data.packaging_info : {};
  const packagingItems = Array.isArray(data.packaging_items) ? data.packaging_items : [];

  // Filter items with category 'packaging'
  const availablePackagingItems = useMemo(() => {
    return items?.filter(item => canBeProductPackaging(item)) || [];
  }, [items]);

  // Auto-fix packaging items that have item_id but missing item_name (data corruption fix)
  React.useEffect(() => {
    if (packagingItems.length > 0 && availablePackagingItems.length > 0) {
      let needsUpdate = false;
      const fixed = packagingItems.map(pkg => {
        if (pkg.item_id && !pkg.item_name) {
          const item = availablePackagingItems.find(i => i.item_id === pkg.item_id);
          if (item) {
            needsUpdate = true;
            return { ...pkg, item_name: item.name };
          }
        }
        return pkg;
      });

      if (needsUpdate) {
        updateData({ packaging_items: fixed });
      }
    }
  }, [packagingItems, availablePackagingItems]);

  const updatePackaging = (field, value) => {
    updateData({
      packaging_info: {
        ...packaging,
        [field]: value
      }
    });
  };

  const addPackagingItem = () => {
    updateData({
      packaging_items: [...packagingItems, { item_id: '', item_name: '', quantity: 1 }]
    });
  };

  const removePackagingItem = (index) => {
    updateData({
      packaging_items: packagingItems.filter((_, i) => i !== index)
    });
  };

  const updatePackagingItem = (index, field, value) => {
    const updated = [...packagingItems];
    if (field === 'item_id') {
      const itemId = parseInt(value);
      // Guard against NaN if parse fails, though Select usually returns valid string numbers
      if (isNaN(itemId)) return;

      const selectedItem = availablePackagingItems.find(item => item.item_id === itemId);
      updated[index] = {
        ...updated[index],
        item_id: itemId,
        item_name: selectedItem?.name || ''
      };
    } else if (field === 'quantity') {
      // Handle quantity updates safely
      const numValue = value === '' ? '' : parseFloat(value);
      updated[index] = { ...updated[index], [field]: isNaN(numValue) && numValue !== '' ? 0 : numValue };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    updateData({ packaging_items: updated });
  };

  // Calculate total packaging cost per batch
  const totalPackagingCost = useMemo(() => {
    return packagingItems.reduce((sum, pkg) => {
      const item = availablePackagingItems.find(i => i.item_id === pkg.item_id);
      return sum + ((item?.cost_per_unit || 0) * pkg.quantity);
    }, 0);
  }, [packagingItems, availablePackagingItems]);

  return (
    <div className="space-y-6">
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
        <h3 className="font-semibold text-teal-900 mb-1">Packaging & Labeling Validation</h3>
        <p className="text-sm text-teal-700">Select packaging items from inventory and ensure full compliance with labeling regulations.</p>
      </div>

      {/* Packaging Items Selection */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Packaging Items</Label>
          <Button variant="outline" size="sm" onClick={addPackagingItem}>
            <Plus className="w-4 h-4 mr-2" /> Add Packaging
          </Button>
        </div>

        {availablePackagingItems.length === 0 ? (
          <div className="text-center p-6 border-2 border-dashed border-amber-200 rounded-xl bg-amber-50">
            <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
            <p className="text-amber-700 font-medium">No packaging items in inventory</p>
            <p className="text-sm text-amber-600 mt-1">Add items with category &quot;Packaging&quot; to your inventory first.</p>
          </div>
        ) : packagingItems.length === 0 ? (
          <div className="text-center p-8 border-2 border-dashed border-slate-200 rounded-xl">
            <Package className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-slate-500">No packaging items added yet.</p>
            <p className="text-sm text-slate-400 mt-1">Click &quot;Add Packaging&quot; to add packaging items from your inventory.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {packagingItems.map((pkg, index) => {
              const item = availablePackagingItems.find(i => i.item_id === pkg.item_id);
              const totalNeeded = pkg.quantity;
              const hasEnough = item && item.current_stock >= totalNeeded;

              return (
                <div key={index} className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <Label className="text-xs">Packaging Item</Label>
                      <Select
                        value={pkg.item_id ? String(pkg.item_id) : ''}
                        onValueChange={(val) => updatePackagingItem(index, 'item_id', val)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select packaging item">
                            {pkg.item_id ? (
                              item ?
                                `${item.name} (${formatQty(item.current_stock)} ${item.unit_of_measure} available)` :
                                (pkg.item_name || pkg.item_id)
                            ) : null}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {availablePackagingItems.map(item => (
                            <SelectItem key={item.item_id} value={String(item.item_id)}>
                              {item.name} ({formatQty(item.current_stock)} {item.unit_of_measure} available)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Quantity per batch</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="1"
                          min="1"
                          value={pkg.quantity}
                          onChange={(e) => updatePackagingItem(index, 'quantity', e.target.value)}
                        />
                        <Button variant="ghost" size="sm" onClick={() => removePackagingItem(index)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {item && (
                    <div className="flex items-center justify-between text-sm bg-slate-50 p-2 rounded">
                      <div className="flex items-center gap-2">
                        {hasEnough ? (
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                        )}
                        <span className={cn(hasEnough ? 'text-emerald-700' : 'text-amber-700')}>
                          Need: {totalNeeded} {item.unit_of_measure} • Available: {formatQty(item.current_stock)} {item.unit_of_measure}
                        </span>
                      </div>
                      <Badge variant="outline" className="bg-white">
                        ₱{formatNumber(item.cost_per_unit * totalNeeded, 2)}
                      </Badge>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Packaging Cost Summary */}
      {packagingItems.length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <h4 className="font-medium text-purple-900 mb-3">Packaging Cost Summary</h4>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <p className="text-sm text-purple-700">Total Packaging Cost (per batch)</p>
              <p className="text-xl font-bold text-purple-900">₱{formatNumber(totalPackagingCost, 2)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Packaging Specifications (text inputs) */}
      <div className="border-t border-slate-200 pt-6 mt-6">
        <h4 className="font-semibold text-slate-900 mb-4">Packaging Specifications</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Primary Packaging</Label>
            <Input
              placeholder="e.g., Glass bottle, Plastic pouch"
              value={packaging.primary_packaging || ''}
              onChange={(e) => updatePackaging('primary_packaging', e.target.value)}
            />
            <p className="text-xs text-slate-500">Direct contact with product</p>
          </div>

          <div className="space-y-2">
            <Label>Secondary Packaging</Label>
            <Input
              placeholder="e.g., Cardboard box, Shrink wrap"
              value={packaging.secondary_packaging || ''}
              onChange={(e) => updatePackaging('secondary_packaging', e.target.value)}
            />
            <p className="text-xs text-slate-500">Outer packaging for transport</p>
          </div>

          <div className="space-y-2">
            <Label>Packaging Material</Label>
            <Input
              placeholder="e.g., Food-grade HDPE, Glass"
              value={packaging.packaging_material || ''}
              onChange={(e) => updatePackaging('packaging_material', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Net Weight / Volume</Label>
            <Input
              placeholder="e.g., 500g, 250ml"
              value={packaging.net_weight || ''}
              onChange={(e) => updatePackaging('net_weight', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Label Compliance Checklist */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Label Compliance Checklist</Label>
        <div
          onClick={() => updatePackaging('label_compliance', !packaging.label_compliance)}
          className={cn(
            "flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all",
            packaging.label_compliance
              ? "border-emerald-500 bg-emerald-50"
              : "border-slate-200 bg-white"
          )}
        >
          <Checkbox checked={packaging.label_compliance} />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {packaging.label_compliance ? (
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              ) : (
                <XCircle className="w-5 h-5 text-slate-400" />
              )}
              <span className="font-semibold text-slate-900">All Labels Meet Regulatory Requirements</span>
            </div>
            <ul className="text-sm text-slate-600 mt-2 space-y-1 ml-7">
              <li>✓ Product name clearly displayed</li>
              <li>✓ Net weight/volume statement</li>
              <li>✓ Ingredient list in descending order</li>
              <li>✓ Allergen declaration (if applicable)</li>
              <li>✓ Nutritional information panel</li>
              <li>✓ Manufacturer name and address</li>
              <li>✓ Best before / Use by date</li>
              <li>✓ Storage instructions</li>
              <li>✓ Lot/batch code for traceability</li>
              <li>✓ Country of origin</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <h4 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
          <Package className="w-5 h-5" />
          Packaging Validation
        </h4>
        <p className="text-sm text-amber-700 mb-2">Ensure packaging materials are:</p>
        <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
          <li>Food-safe and FDA approved</li>
          <li>Appropriate for product characteristics (pH, moisture, etc.)</li>
          <li>Provide adequate barrier properties</li>
          <li>Tamper-evident where required</li>
          <li>Sustainable and recyclable when possible</li>
        </ul>
      </div>
    </div>
  );
}
