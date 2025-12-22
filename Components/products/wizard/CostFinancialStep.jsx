import React, { useMemo } from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { DollarSign, TrendingUp } from 'lucide-react';

export default function CostFinancialStep({ data, updateData, items }) {
  const [packagingCost, setPackagingCost] = React.useState(0);
  const [laborCost, setLaborCost] = React.useState(0);
  const [overheadCost, setOverheadCost] = React.useState(0);
  const [desiredMargin, setDesiredMargin] = React.useState(30);

  const ingredientItems = items?.filter(item => item.category === 'ingredient') || [];
  
  const ingredientCost = useMemo(() => {
    const ingredients = data.ingredients || [];
    const batchSize = data.batch_size || 1;
    return ingredients.reduce((sum, ing) => {
      const item = ingredientItems.find(i => i.id === ing.item_id);
      return sum + ((item?.cost_per_unit || 0) * ing.quantity * batchSize);
    }, 0);
  }, [data.ingredients, data.batch_size, ingredientItems]);

  const totalCOGS = useMemo(() => {
    return ingredientCost + packagingCost + laborCost + overheadCost;
  }, [ingredientCost, packagingCost, laborCost, overheadCost]);

  const costPerUnit = useMemo(() => {
    const batchSize = data.batch_size || 1;
    const effectiveYield = ((data.yield_percentage || 100) - (data.processing_loss || 0)) / 100;
    const actualUnits = batchSize * effectiveYield;
    return actualUnits > 0 ? totalCOGS / actualUnits : 0;
  }, [totalCOGS, data.batch_size, data.yield_percentage, data.processing_loss]);

  const suggestedPrice = useMemo(() => {
    return costPerUnit / (1 - desiredMargin / 100);
  }, [costPerUnit, desiredMargin]);

  React.useEffect(() => {
    updateData({ cost_per_unit: costPerUnit });
  }, [costPerUnit]);

  return (
    <div className="space-y-6">
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
        <h3 className="font-semibold text-teal-900 mb-1">Cost & Financial Validations</h3>
        <p className="text-sm text-teal-700">Calculate true Cost of Goods Sold (COGS) and determine profitable pricing.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p className="text-sm text-emerald-700 mb-1">Raw Materials Cost</p>
          <p className="text-2xl font-bold text-emerald-900">₱{ingredientCost.toFixed(2)}</p>
          <p className="text-xs text-emerald-600">per batch (auto-calculated)</p>
        </div>

        <div className="space-y-2">
          <Label>Packaging Cost per Batch</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={packagingCost}
            onChange={(e) => setPackagingCost(parseFloat(e.target.value) || 0)}
          />
        </div>

        <div className="space-y-2">
          <Label>Labor Cost per Batch</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={laborCost}
            onChange={(e) => setLaborCost(parseFloat(e.target.value) || 0)}
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
            onChange={(e) => setOverheadCost(parseFloat(e.target.value) || 0)}
          />
        </div>
      </div>

      <div className="bg-slate-900 text-white rounded-xl p-6">
        <h4 className="font-semibold mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Total Cost Breakdown
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-slate-400">Raw Materials</p>
            <p className="text-lg font-bold">₱{ingredientCost.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Packaging</p>
            <p className="text-lg font-bold">₱{packagingCost.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Labor</p>
            <p className="text-lg font-bold">₱{laborCost.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Overhead</p>
            <p className="text-lg font-bold">₱{overheadCost.toFixed(2)}</p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-700">
          <div className="flex justify-between items-center">
            <span className="text-sm">Total COGS per Batch:</span>
            <span className="text-2xl font-bold">₱{totalCOGS.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center mt-2">
            <span className="text-sm">Cost per Unit:</span>
            <span className="text-xl font-bold text-emerald-400">₱{costPerUnit.toFixed(2)}</span>
          </div>
        </div>
      </div>

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
            <p className="text-4xl font-bold text-teal-900">₱{suggestedPrice.toFixed(2)}</p>
            <p className="text-sm text-teal-600">per unit</p>
          </div>
        </div>
      </div>
    </div>
  );
}