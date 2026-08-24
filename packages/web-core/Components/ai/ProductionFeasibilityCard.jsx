import React from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Package,
  ArrowRight,
  Layers,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { cn } from "@/lib/utils";

/**
 * Card component for displaying production feasibility analysis results
 */
export default function ProductionFeasibilityCard({ data }) {
  if (!data) return null;

  // Check if this is a single product analysis or overview
  const isSingleProduct = data.product != null;

  if (isSingleProduct) {
    return <SingleProductAnalysis data={data} />;
  }

  return <ProductionOverview data={data} />;
}

/**
 * Single product feasibility analysis
 */
function SingleProductAnalysis({ data }) {
  const { product, can_produce, max_producible, raw_materials, shortages, production_chain, message } = data;

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Header */}
      <div className={cn(
        "px-4 py-3 flex items-center gap-3",
        can_produce ? "bg-emerald-50 border-b border-emerald-100" : "bg-red-50 border-b border-red-100"
      )}>
        {can_produce ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
        ) : (
          <XCircle className="w-5 h-5 text-red-600" />
        )}
        <div className="flex-1">
          <h3 className="font-semibold text-slate-900">{product.name}</h3>
          <p className="text-sm text-slate-600">SKU: {product.sku_code} | Level {product.nesting_level}</p>
        </div>
        <div className="text-right">
          <span className={cn(
            "text-lg font-bold",
            can_produce ? "text-emerald-600" : "text-red-600"
          )}>
            {can_produce ? `Can produce ${max_producible}` : "Cannot produce"}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Production Chain (if nested) */}
        {production_chain && product.nesting_level > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Production Chain
            </h4>
            <pre className="text-xs bg-slate-50 p-3 rounded-lg overflow-x-auto text-slate-700 font-mono">
              {production_chain}
            </pre>
          </div>
        )}

        {/* Shortages */}
        {shortages && shortages.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Ingredient Shortages ({shortages.length})
            </h4>
            <div className="space-y-2">
              {shortages.map((shortage, idx) => (
                <div key={idx} className="flex items-center justify-between bg-red-50 px-3 py-2 rounded-lg">
                  <span className="font-medium text-red-900">{shortage.name}</span>
                  <div className="text-sm text-red-700">
                    Need: <span className="font-semibold">{shortage.required.toFixed(2)}</span> {shortage.unit}
                    <ArrowRight className="inline w-3 h-3 mx-1" />
                    Have: <span className="font-semibold">{shortage.available.toFixed(2)}</span>
                    <span className="ml-2 text-red-600 font-bold">
                      (Short: {shortage.shortage.toFixed(2)})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Raw Materials Summary */}
        {raw_materials && raw_materials.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <Package className="w-4 h-4" />
              Raw Materials Required ({raw_materials.length})
            </h4>
            <div className="grid gap-2">
              {raw_materials.slice(0, 6).map((rm, idx) => (
                <div key={idx} className={cn(
                  "flex items-center justify-between px-3 py-2 rounded-lg text-sm",
                  rm.has_shortage ? "bg-red-50" : "bg-emerald-50"
                )}>
                  <div className="flex items-center gap-2">
                    {rm.has_shortage ? (
                      <XCircle className="w-4 h-4 text-red-500" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    )}
                    <span className={rm.has_shortage ? "text-red-900" : "text-emerald-900"}>
                      {rm.name}
                    </span>
                    <span className="text-xs text-slate-500">({rm.category})</span>
                  </div>
                  <div className={rm.has_shortage ? "text-red-700" : "text-emerald-700"}>
                    {rm.required.toFixed(2)} / {rm.available.toFixed(2)} {rm.unit}
                  </div>
                </div>
              ))}
              {raw_materials.length > 6 && (
                <p className="text-sm text-slate-500 text-center">
                  +{raw_materials.length - 6} more ingredients
                </p>
              )}
            </div>
          </div>
        )}

        {/* Message */}
        <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">{message}</p>
      </div>
    </div>
  );
}

/**
 * Production overview showing all products
 */
function ProductionOverview({ data }) {
  const { summary, fully_producible, partially_producible, message } = data;

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-teal-600" />
          Production Feasibility Analysis
        </h3>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-2 p-4 bg-white border-b">
        <StatBox
          label="Total Products"
          value={summary.total_products}
          color="slate"
        />
        <StatBox
          label="Can Produce"
          value={summary.fully_producible}
          color="emerald"
          icon={CheckCircle2}
        />
        <StatBox
          label="Partial"
          value={summary.partially_producible}
          color="amber"
          icon={AlertTriangle}
        />
        <StatBox
          label="Blocked"
          value={summary.not_producible}
          color="red"
          icon={XCircle}
        />
      </div>

      {/* Fully Producible */}
      {fully_producible && fully_producible.length > 0 && (
        <div className="p-4 border-b">
          <h4 className="text-sm font-semibold text-emerald-700 mb-2 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Ready to Produce ({fully_producible.length})
          </h4>
          <div className="space-y-2">
            {fully_producible.slice(0, 5).map((product, idx) => (
              <div key={idx} className="flex items-center justify-between bg-emerald-50 px-3 py-2 rounded-lg">
                <div>
                  <span className="font-medium text-emerald-900">{product.name}</span>
                  <span className="ml-2 text-xs text-emerald-700">
                    {product.product_type === 'finished_goods' ? 'Finished' : 'WIP'}
                    {product.nesting_level > 0 && ` | L${product.nesting_level}`}
                  </span>
                </div>
                <span className="text-sm font-semibold text-emerald-700">
                  Max: {product.max_producible} units
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Partially Producible */}
      {partially_producible && partially_producible.length > 0 && (
        <div className="p-4 border-b">
          <h4 className="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Limited Production ({partially_producible.length})
          </h4>
          <div className="space-y-2">
            {partially_producible.slice(0, 3).map((product, idx) => (
              <div key={idx} className="flex items-center justify-between bg-amber-50 px-3 py-2 rounded-lg">
                <div>
                  <span className="font-medium text-amber-900">{product.name}</span>
                  <span className="ml-2 text-xs text-amber-700">SKU: {product.sku_code}</span>
                </div>
                <div className="text-right text-sm">
                  <span className="font-semibold text-amber-700">Max: {product.max_producible}</span>
                  {product.bottleneck && (
                    <p className="text-xs text-amber-600">
                      Bottleneck: {product.bottleneck.name}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Message */}
      <div className="p-4 bg-slate-50">
        <p className="text-sm text-slate-600">{message}</p>
      </div>
    </div>
  );
}

/**
 * Stat box component
 */
function StatBox({ label, value, color, icon: Icon }) {
  const colorClasses = {
    slate: 'bg-slate-100 text-slate-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700'
  };

  return (
    <div className={cn("rounded-lg p-3 text-center", colorClasses[color])}>
      <div className="flex items-center justify-center gap-1">
        {Icon && <Icon className="w-4 h-4" />}
        <span className="text-xl font-bold">{value}</span>
      </div>
      <p className="text-xs mt-1">{label}</p>
    </div>
  );
}
