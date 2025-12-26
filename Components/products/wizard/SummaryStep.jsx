import React from 'react';
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, Package, DollarSign, Calendar, ShieldCheck } from 'lucide-react';
import { cn } from "../../../src/lib/utils.js";
import { formatNumber } from '../../../src/lib/numberUtils.js';

export default function SummaryStep({ data }) {
  const isComplete = (section) => {
    switch(section) {
      case 'basic':
        return data.name && data.sku_code && data.unit_of_measure;
      case 'recipe':
        return data.ingredients?.length > 0 && data.batch_size > 0;
      case 'yield':
        return data.yield_percentage && data.processing_loss !== undefined;
      case 'nutrition':
        return data.nutritional_info?.serving_size;
      case 'allergens':
        return data.allergens !== undefined;
      case 'properties':
        return data.physical_properties?.texture || data.physical_properties?.color;
      case 'shelf_life':
        return data.shelf_life?.duration_days > 0;
      case 'packaging':
        return data.packaging_info?.primary_packaging;
      case 'cost':
        return data.cost_per_unit > 0;
      case 'qc':
        return data.quality_control?.test_frequency;
      case 'compliance':
        return data.regulatory_compliance?.fda_approved;
      default:
        return false;
    }
  };

  const sections = [
    { id: 'basic', label: 'Basic Information', icon: Package },
    { id: 'recipe', label: 'Recipe & Ingredients', icon: Package },
    { id: 'yield', label: 'Yield Management', icon: Package },
    { id: 'nutrition', label: 'Nutritional Info', icon: Package },
    { id: 'allergens', label: 'Allergen Management', icon: AlertTriangle },
    { id: 'properties', label: 'Physical Properties', icon: Package },
    { id: 'shelf_life', label: 'Shelf Life', icon: Calendar },
    { id: 'packaging', label: 'Packaging', icon: Package },
    { id: 'cost', label: 'Cost Analysis', icon: DollarSign },
    { id: 'qc', label: 'Quality Control', icon: CheckCircle },
    { id: 'compliance', label: 'Compliance', icon: ShieldCheck },
  ];

  const completedCount = sections.filter(s => isComplete(s.id)).length;
  const completionPercent = Math.round((completedCount / sections.length) * 100);

  return (
    <div className="space-y-6">
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
        <h3 className="font-semibold text-teal-900 mb-1">Product Summary & Validation Checklist</h3>
        <p className="text-sm text-teal-700">Review all sections before creating the product.</p>
      </div>

      {/* Completion Progress */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-slate-900">Completion Status</h4>
          <span className="text-2xl font-bold text-teal-600">{completionPercent}%</span>
        </div>
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
          <div 
            className="h-full bg-teal-600 transition-all"
            style={{ width: `${completionPercent}%` }}
          />
        </div>
        <p className="text-sm text-slate-600 mt-2">
          {completedCount} of {sections.length} sections completed
        </p>
      </div>

      {/* Section Checklist */}
      <div className="space-y-2">
        <h4 className="font-semibold text-slate-900 mb-3">Validation Checklist</h4>
        {sections.map(section => {
          const Icon = section.icon;
          const complete = isComplete(section.id);
          return (
            <div
              key={section.id}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border",
                complete 
                  ? "bg-emerald-50 border-emerald-200" 
                  : "bg-amber-50 border-amber-200"
              )}
            >
              {complete ? (
                <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              )}
              <Icon className={cn("w-4 h-4 flex-shrink-0", complete ? "text-emerald-600" : "text-amber-600")} />
              <span className={cn("font-medium", complete ? "text-emerald-900" : "text-amber-900")}>
                {section.label}
              </span>
              <Badge 
                variant="outline" 
                className={cn("ml-auto", complete ? "bg-emerald-100 text-emerald-700 border-emerald-300" : "bg-amber-100 text-amber-700 border-amber-300")}
              >
                {complete ? 'Complete' : 'Incomplete'}
              </Badge>
            </div>
          );
        })}
      </div>

      {/* Product Summary */}
      <div className="bg-slate-900 text-white rounded-xl p-6">
        <h4 className="font-semibold mb-4">Product Summary</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-slate-400">Name:</p>
            <p className="font-semibold">{data.name || 'Not set'}</p>
          </div>
          <div>
            <p className="text-slate-400">SKU:</p>
            <p className="font-semibold">{data.sku_code || 'Not set'}</p>
          </div>
          <div>
            <p className="text-slate-400">Batch Size:</p>
            <p className="font-semibold">{data.batch_size || 0} units</p>
          </div>
          <div>
            <p className="text-slate-400">Cost per Unit:</p>
            <p className="font-semibold">₱{formatNumber(data.cost_per_unit, 2)}</p>
          </div>
          <div>
            <p className="text-slate-400">Ingredients:</p>
            <p className="font-semibold">{data.ingredients?.length || 0} items</p>
          </div>
          <div>
            <p className="text-slate-400">Shelf Life:</p>
            <p className="font-semibold">{data.shelf_life?.duration_days || 0} days</p>
          </div>
          {data.allergens?.length > 0 && (
            <div className="md:col-span-2">
              <p className="text-slate-400 mb-1">Allergens:</p>
              <div className="flex flex-wrap gap-2">
                {data.allergens.map(allergen => (
                  <Badge key={allergen} className="bg-red-500 hover:bg-red-600">
                    {allergen}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {completionPercent < 100 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm text-amber-700">
            <strong>Note:</strong> Some sections are incomplete. You can still create the product, 
            but completing all sections ensures full compliance and accurate data.
          </p>
        </div>
      )}
    </div>
  );
}