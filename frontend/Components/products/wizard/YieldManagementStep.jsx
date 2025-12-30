import React from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Info, TrendingDown, TrendingUp } from 'lucide-react';
import { formatNumber } from '../../../src/lib/numberUtils.js';
import { cn } from "../../../src/lib/utils.js";

export default function YieldManagementStep({ data, updateData }) {
  const batchSize = data.batch_size ?? '';
  const yieldPercentage = data.yield_percentage || 100;
  const processingLoss = data.processing_loss || 0;

  const effectiveYield = yieldPercentage - processingLoss;
  const actualOutput = ((batchSize || 0) * effectiveYield) / 100;

  return (
    <div className="space-y-6">
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
        <h3 className="font-semibold text-teal-900 mb-1">Yield Management & Processing Loss</h3>
        <p className="text-sm text-teal-700">Track expected output and account for processing losses during production.</p>
      </div>

      {/* Batch Size */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          Batch Size (units produced per batch)
          <Info className="w-4 h-4 text-slate-400" />
        </Label>
        <Input
          type="number"
          min="1"
          step="1"
          value={batchSize}
          onChange={(e) => {
            const value = e.target.value;
            // Allow empty string while typing
            if (value === '') {
              updateData({ batch_size: '' });
            } else {
              const numValue = parseInt(value);
              if (!isNaN(numValue) && numValue >= 1) {
                updateData({ batch_size: numValue });
              }
            }
          }}
          onBlur={() => {
            // Allow empty/null for draft mode - don't force a value
            // This lets users save drafts without batch size set
          }}
          placeholder="Enter number of units per batch"
        />
        <p className="text-xs text-slate-500">Number of finished units produced in one production run</p>
      </div>

      {/* Yield Percentage */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            Expected Yield Percentage
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </Label>
          <span className="text-2xl font-bold text-teal-600">
            {formatNumber(yieldPercentage, 1)}%
          </span>
        </div>
        <Slider
          value={[yieldPercentage]}
          onValueChange={([val]) => updateData({ yield_percentage: val })}
          min={50}
          max={100}
          step={0.5}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-slate-500">
          <span>Low Yield (50%)</span>
          <span>Perfect Yield (100%)</span>
        </div>
        <p className="text-xs text-slate-500">Expected percentage of input materials that become finished product</p>
      </div>

      {/* Processing Loss */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            Processing Loss Percentage
            <TrendingDown className="w-4 h-4 text-amber-600" />
          </Label>
          <span className="text-2xl font-bold text-amber-600">
            {formatNumber(processingLoss, 1)}%
          </span>
        </div>
        <Slider
          value={[processingLoss]}
          onValueChange={([val]) => updateData({ processing_loss: val })}
          min={0}
          max={50}
          step={0.5}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-slate-500">
          <span>No Loss (0%)</span>
          <span>High Loss (50%)</span>
        </div>
        <p className="text-xs text-slate-500">Material lost during processing (spillage, evaporation, trimming, etc.)</p>
      </div>

      {/* Yield Summary Card */}
      <div className={cn(
        "border rounded-xl p-6 space-y-4",
        effectiveYield >= 90 ? "bg-emerald-50 border-emerald-200" :
        effectiveYield >= 75 ? "bg-amber-50 border-amber-200" :
        "bg-red-50 border-red-200"
      )}>
        <div>
          <h4 className="font-semibold text-slate-900 mb-2">Production Summary</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-lg p-3 border border-slate-200">
              <p className="text-xs text-slate-500 mb-1">Planned Batch Size</p>
              <p className="text-2xl font-bold text-slate-900">{batchSize || '0'}</p>
              <p className="text-xs text-slate-600">units per batch</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-slate-200">
              <p className="text-xs text-slate-500 mb-1">Effective Yield</p>
              <p className={cn(
                "text-2xl font-bold",
                effectiveYield >= 90 ? "text-emerald-600" :
                effectiveYield >= 75 ? "text-amber-600" :
                "text-red-600"
              )}>
                {formatNumber(effectiveYield, 1)}%
              </p>
              <p className="text-xs text-slate-600">after losses</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-slate-200">
              <p className="text-xs text-slate-500 mb-1">Actual Output</p>
              <p className="text-2xl font-bold text-teal-600">{formatNumber(actualOutput, 2)}</p>
              <p className="text-xs text-slate-600">units expected</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-slate-200">
              <p className="text-xs text-slate-500 mb-1">Loss per Batch</p>
              <p className="text-2xl font-bold text-amber-600">{formatNumber((batchSize || 0) - actualOutput, 2)}</p>
              <p className="text-xs text-slate-600">units lost</p>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-200">
          <p className="text-xs text-slate-600">
            {effectiveYield >= 90 && "✅ Excellent yield rate! Production is highly efficient."}
            {effectiveYield >= 75 && effectiveYield < 90 && "⚠️  Good yield, but there's room for improvement."}
            {effectiveYield < 75 && "❌ High processing loss detected. Consider reviewing production methods."}
          </p>
        </div>
      </div>

      {/* Production Notes */}
      <div className="space-y-2">
        <Label>Production Notes (Optional)</Label>
        <Textarea
          placeholder="Add any notes about production process, common issues, tips for minimizing loss..."
          value={data.production_notes || ''}
          onChange={(e) => updateData({ production_notes: e.target.value })}
          className="h-24"
        />
      </div>
    </div>
  );
}
