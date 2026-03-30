import React from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UomSelect } from '@/components/ui/UomSelect';

export default function BasicInfoStep({ data, updateData }) {
  return (
    <div className="space-y-6">
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
        <h3 className="font-semibold text-teal-900 mb-1">Product Basic Information</h3>
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
            placeholder="e.g., PRD-GTM-001"
            value={data.sku_code}
            onChange={(e) => updateData({ sku_code: e.target.value })}
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
        <h4 className="font-medium text-slate-900 mb-4">Inventory Settings</h4>
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

          <div className="space-y-2">
            <Label>Current Stock</Label>
            <Input
              type="number"
              placeholder="0"
              value={data.current_stock ?? ''}
              onChange={(e) => updateData({ current_stock: parseFloat(e.target.value) || 0 })}
            />
            <p className="text-xs text-slate-500">Initial stock on hand</p>
          </div>

          {/* Auto-calculated threshold display */}
          {data.max_capacity > 0 && (
            <div className="col-span-2 bg-slate-50 rounded-lg p-4 border border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-slate-700">
                  ⚙️ Auto-calculated from System Settings
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
