import React, { useMemo } from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { DollarSign, TrendingUp, Package, Beaker } from 'lucide-react';
import { formatNumber } from '../../../src/lib/numberUtils.js';
import { canBeProductIngredient } from '@/components/utils/categoryHelpers';

export default function CostFinancialStep({ data, updateData, items }) {
  // Load from wizard_metadata if editing a draft, otherwise use top-level data
  const wizardData = data.wizard_metadata || {};
  const [laborCost, setLaborCost] = React.useState(data.labor_cost || wizardData.labor_cost || 0);
  const [overheadCost, setOverheadCost] = React.useState(data.overhead_cost || wizardData.overhead_cost || 0);
  const [additionalPackagingCost, setAdditionalPackagingCost] = React.useState(data.additional_packaging_cost || wizardData.additional_packaging_cost || 0);
  const [desiredMargin, setDesiredMargin] = React.useState(30);

  const ingredientItems = items?.filter(item => canBeProductIngredient(item)) || [];
  const packagingItemsList = items?.filter(item => item.category === 'packaging') || [];
  const batchSize = Number(data.batch_size) || 1;

  // Calculate ingredient cost from selected ingredients
  const ingredientCost = useMemo(() => {
    const ingredients = data.ingredients || [];
    return ingredients.reduce((sum, ing) => {
      const item = ingredientItems.find(i => i.item_id === Number(ing.item_id));
      const cost = Number(item?.cost_per_unit || 0);
      const qty = Number(ing.quantity || 0);
      return sum + (cost * qty);
    }, 0);
  }, [data.ingredients, ingredientItems, batchSize]);

  // Calculate packaging cost from selected packaging items
  const packagingCost = useMemo(() => {
    const packagingItems = data.packaging_items || [];
    return packagingItems.reduce((sum, pkg) => {
      const item = packagingItemsList.find(i => i.item_id === Number(pkg.item_id));
      const cost = Number(item?.cost_per_unit || 0);
      const qty = Number(pkg.quantity || 0);
      return sum + (cost * qty);
    }, 0);
  }, [data.packaging_items, packagingItemsList, batchSize]);

  // Total COGS Calculation
  const calculation = useMemo(() => {
    // Inputs
    const ingredients = Number(ingredientCost || 0);
    const packaging = Number(packagingCost || 0);
    const labor = Number(laborCost || 0);
    const overhead = Number(overheadCost || 0);
    const addPkg = Number(additionalPackagingCost || 0);
    const bSize = Number(data.batch_size) || 1; // Default to 1 to avoid div by zero

    // Yield defaults to 100 if invalid/zero
    const yPct = Number(data.yield_percentage) || 100;
    const pLoss = Number(data.processing_loss) || 0;
    const effYield = Math.max(0.01, (yPct - pLoss) / 100); // Floor at 1% yield to avoid Infinity

    // Totals
    const totalPkg = packaging + addPkg;
    const cogs = ingredients + totalPkg + labor + overhead;
    const actualUnits = bSize * effYield;
    const perUnit = actualUnits > 0 ? (cogs / actualUnits) : 0;

    // Pricing
    const margin = Number(desiredMargin) || 0;
    const marginFactor = Math.max(0.1, 1 - (margin / 100)); // Max 90% logic check
    const price = perUnit > 0 ? (perUnit / marginFactor) : 0;

    return {
      ingredients,
      packaging: totalPkg,
      labor,
      overhead,
      totalCOGS: cogs,
      batchSize: bSize,
      actualUnits,
      costPerUnit: isFinite(perUnit) ? perUnit : 0,
      suggestedPrice: isFinite(price) ? price : 0
    };
  }, [ingredientCost, packagingCost, laborCost, overheadCost, additionalPackagingCost, data.batch_size, data.yield_percentage, data.processing_loss, desiredMargin]);

  const { totalCOGS, costPerUnit, suggestedPrice, batchSize: cBatchSize, packaging: totalPackagingCost } = calculation;

  React.useEffect(() => {
    // Sync calculations back to parent data
    const currentCost = Number(data.cost_per_unit) || 0;
    if (Math.abs(currentCost - costPerUnit) > 0.001) {
      updateData({
        cost_per_unit: costPerUnit,
        labor_cost: Number(laborCost),
        overhead_cost: Number(overheadCost),
        additional_packaging_cost: Number(additionalPackagingCost)
      });
    }
  }, [costPerUnit, laborCost, overheadCost, additionalPackagingCost, updateData, data.cost_per_unit]);

  const hasIngredients = (data.ingredients || []).length > 0;
  const hasPackaging = (data.packaging_items || []).length > 0;

  return (
    <div className="space-y-6">
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
        <h3 className="font-semibold text-teal-900 mb-1">Cost & Financial Validations</h3>
        <p className="text-sm text-teal-700">Calculate true Cost of Goods Sold (COGS) and determine profitable pricing.</p>
      </div>

      {/* Auto-calculated costs summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Beaker className="w-5 h-5 text-emerald-600" />
            <p className="font-medium text-emerald-900">Ingredients Cost</p>
          </div>
          <p className="text-2xl font-bold text-emerald-900">₱{formatNumber(ingredientCost, 2)}</p>
          <p className="text-xs text-emerald-600">
            {hasIngredients
              ? `${data.ingredients?.length || 0} ingredients per batch`
              : 'No ingredients added yet'}
          </p>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-5 h-5 text-purple-600" />
            <p className="font-medium text-purple-900">Packaging Cost</p>
          </div>
          <p className="text-2xl font-bold text-purple-900">₱{formatNumber(packagingCost, 2)}</p>
          <p className="text-xs text-purple-600">
            {hasPackaging
              ? `${data.packaging_items?.length || 0} packaging items per batch`
              : 'No packaging items added yet'}
          </p>
        </div>
      </div>

      {/* Manual cost inputs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Additional Packaging Cost per Batch</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={additionalPackagingCost}
            onChange={(e) => setAdditionalPackagingCost(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
          />
          <p className="text-xs text-slate-500">For unlisted packaging items</p>
        </div>

        <div className="space-y-2">
          <Label>Labor Cost per Batch</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={laborCost}
            onChange={(e) => setLaborCost(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
          />
        </div>

        <div className="space-y-2">
          <Label>Overhead & Utilities per Batch</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={overheadCost}
            onChange={(e) => setOverheadCost(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
          />
        </div>
      </div>

      {/* Total Cost Breakdown */}
      <div className="bg-slate-900 text-white rounded-xl p-6">
        <h4 className="font-semibold mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Total Cost Breakdown
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <p className="text-xs text-slate-400">Raw Materials</p>
            <p className="text-lg font-bold">₱{formatNumber(ingredientCost, 2)}</p>
            <p className="text-xs text-slate-500 mt-1">{calculation.actualUnits > 0 ? `₱${formatNumber(ingredientCost / calculation.actualUnits, (ingredientCost / calculation.actualUnits) < 0.01 ? 8 : 2)}/unit` : 'N/A'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Packaging</p>
            <p className="text-lg font-bold">₱{formatNumber(totalPackagingCost, 2)}</p>
            <p className="text-xs text-slate-500 mt-1">{calculation.actualUnits > 0 ? `₱${formatNumber(totalPackagingCost / calculation.actualUnits, (totalPackagingCost / calculation.actualUnits) < 0.01 ? 8 : 2)}/unit` : 'N/A'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Labor</p>
            <p className="text-lg font-bold">₱{formatNumber(laborCost, 2)}</p>
            <p className="text-xs text-slate-500 mt-1">{calculation.actualUnits > 0 ? `₱${formatNumber(laborCost / calculation.actualUnits, (laborCost / calculation.actualUnits) < 0.01 ? 8 : 2)}/unit` : 'N/A'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Overhead</p>
            <p className="text-lg font-bold">₱{formatNumber(overheadCost, 2)}</p>
            <p className="text-xs text-slate-500 mt-1">{calculation.actualUnits > 0 ? `₱${formatNumber(overheadCost / calculation.actualUnits, (overheadCost / calculation.actualUnits) < 0.01 ? 8 : 2)}/unit` : 'N/A'}</p>
          </div>
          <div className="bg-white/10 rounded-lg p-2 -m-2">
            <p className="text-xs text-slate-300">Total COGS</p>
            <p className="text-xl font-bold text-teal-400">₱{formatNumber(totalCOGS, 2)}</p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-700">
          <div className="flex justify-between items-center">
            <span className="text-sm">Total Production Cost per Batch ({batchSize} units):</span>
            <span className="text-2xl font-bold">₱{formatNumber(totalCOGS, 2)}</span>
          </div>
          <div className="flex justify-between items-center mt-2">
            <span className="text-sm">Cost per Unit (after yield adjustment):</span>
            <span className="text-xl font-bold text-emerald-400">₱{formatNumber(costPerUnit, costPerUnit > 0 && costPerUnit < 0.01 ? 8 : 2)}</span>
          </div>
        </div>
      </div>

      {/* Profit Margin Slider */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Desired Profit Margin</Label>
          <span className="text-2xl font-bold text-teal-600">{desiredMargin}%</span>
        </div>
        <Slider
          value={[desiredMargin]}
          onValueChange={([val]) => setDesiredMargin(val)}
          min={10}
          max={80}
          step={5}
          className="w-full"
        />
      </div>

      {/* Suggested Selling Price */}
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-teal-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Suggested Selling Price
            </h4>
            <p className="text-sm text-teal-700 mt-1">
              Based on {desiredMargin}% profit margin
            </p>
          </div>
          <div className="text-right">
            <p className="text-4xl font-bold text-teal-900">₱{formatNumber(suggestedPrice, suggestedPrice > 0 && suggestedPrice < 0.01 ? 8 : 2)}</p>
            <p className="text-sm text-teal-600">per unit</p>
          </div>
        </div>
      </div>
    </div>
  );
}