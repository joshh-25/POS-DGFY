import React from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Package, CheckCircle, XCircle } from 'lucide-react';
import { cn } from "../../../src/lib/utils.js";

export default function PackagingLabelingStep({ data, updateData }) {
  const packaging = data.packaging_info || {};

  const updatePackaging = (field, value) => {
    updateData({
      packaging_info: {
        ...packaging,
        [field]: value
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
        <h3 className="font-semibold text-teal-900 mb-1">Packaging & Labeling Validation</h3>
        <p className="text-sm text-teal-700">Ensure packaging integrity and full compliance with labeling regulations.</p>
      </div>

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