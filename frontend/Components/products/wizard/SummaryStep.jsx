import React from 'react';
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, Package, DollarSign, Calendar, ShieldCheck, Beaker, Box } from 'lucide-react';
import { cn } from "../../../src/lib/utils.js";
import { formatNumber } from '../../../src/lib/numberUtils.js';

export default function SummaryStep({ data, items }) {
  const ingredientItems = items?.filter(item => item.category === 'ingredient') || [];
  const packagingItemsList = items?.filter(item => item.category === 'packaging') || [];

  const isComplete = (section) => {
    switch (section) {
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
        return data.packaging_items?.length > 0 || data.packaging_info?.primary_packaging;
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
    { id: 'recipe', label: 'Recipe & Ingredients', icon: Beaker },
    { id: 'yield', label: 'Yield Management', icon: Package },
    { id: 'nutrition', label: 'Nutritional Info', icon: Package },
    { id: 'allergens', label: 'Allergen Management', icon: AlertTriangle },
    { id: 'properties', label: 'Physical Properties', icon: Package },
    { id: 'shelf_life', label: 'Shelf Life', icon: Calendar },
    { id: 'packaging', label: 'Packaging', icon: Box },
    { id: 'cost', label: 'Cost Analysis', icon: DollarSign },
    { id: 'qc', label: 'Quality Control', icon: CheckCircle },
    { id: 'compliance', label: 'Compliance', icon: ShieldCheck },
  ];

  const completedCount = sections.filter(s => isComplete(s.id)).length;
  const completionPercent = Math.round((completedCount / sections.length) * 100);

  // Calculate costs for summary
  const batchSize = data.batch_size || 1;

  const ingredientCost = (data.ingredients || []).reduce((sum, ing) => {
    const item = ingredientItems.find(i => i.item_id === ing.item_id);
    return sum + ((item?.cost_per_unit || 0) * ing.quantity);
  }, 0);

  const packagingCost = (data.packaging_items || []).reduce((sum, pkg) => {
    const item = packagingItemsList.find(i => i.item_id === pkg.item_id);
    return sum + ((item?.cost_per_unit || 0) * pkg.quantity);
  }, 0);

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
            <p className="text-slate-400">Packaging Items:</p>
            <p className="font-semibold">{data.packaging_items?.length || 0} items</p>
          </div>
          <div>
            <p className="text-slate-400">Shelf Life:</p>
            <p className="font-semibold">{data.shelf_life?.duration_days || 0} days</p>
          </div>
          <div>
            <p className="text-slate-400">Yield:</p>
            <p className="font-semibold">{data.yield_percentage || 100}% - {data.processing_loss || 0}% loss</p>
          </div>
          {data.allergens?.length > 0 && (
            <div className="md:col-span-2">
              <p className="text-slate-400 mb-1">Allergens:</p>
              <div className="flex flex-wrap gap-2">
                {data.allergens.map((allergen, index) => {
                  // Handle both string format (wizard) and object format (database)
                  const allergenName = typeof allergen === 'string' ? allergen : allergen.allergen_name;
                  const isContamination = typeof allergen === 'object' ? allergen.is_cross_contamination : false;
                  const key = typeof allergen === 'string' ? allergen : `${allergen.allergen_name}-${index}`;

                  return (
                    <Badge key={key} className={isContamination ? "bg-orange-500 hover:bg-orange-600" : "bg-red-500 hover:bg-red-600"}>
                      {allergenName}{isContamination ? ' (may contain)' : ''}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cost Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Beaker className="w-5 h-5 text-emerald-600" />
            <p className="font-medium text-emerald-900">Ingredients</p>
          </div>
          <p className="text-2xl font-bold text-emerald-900">₱{formatNumber(ingredientCost, 2)}</p>
          <p className="text-xs text-emerald-600">per batch ({data.ingredients?.length || 0} items)</p>
          {(data.ingredients || []).length > 0 && (
            <ul className="mt-2 text-sm text-emerald-700 space-y-1">
              {data.ingredients.slice(0, 3).map((ing, idx) => (
                <li key={idx}>• {ing.item_name || 'Unnamed'}</li>
              ))}
              {data.ingredients.length > 3 && (
                <li className="text-emerald-500">... and {data.ingredients.length - 3} more</li>
              )}
            </ul>
          )}
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Box className="w-5 h-5 text-purple-600" />
            <p className="font-medium text-purple-900">Packaging</p>
          </div>
          <p className="text-2xl font-bold text-purple-900">₱{formatNumber(packagingCost, 2)}</p>
          <p className="text-xs text-purple-600">per batch ({data.packaging_items?.length || 0} items)</p>
          {(data.packaging_items || []).length > 0 && (
            <ul className="mt-2 text-sm text-purple-700 space-y-1">
              {data.packaging_items.slice(0, 3).map((pkg, idx) => (
                <li key={idx}>• {pkg.item_name || 'Unnamed'}</li>
              ))}
              {data.packaging_items.length > 3 && (
                <li className="text-purple-500">... and {data.packaging_items.length - 3} more</li>
              )}
            </ul>
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