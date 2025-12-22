
import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils.js';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "../../src/lib/utils.js";

export default function LowStockList({ items }) {
  const lowStockItems = items
    .filter(item => item.current_stock < item.min_threshold)
    .sort((a, b) => (a.current_stock / a.min_threshold) - (b.current_stock / b.min_threshold));

  if (lowStockItems.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Low Stock Alerts</h3>
            <p className="text-sm text-slate-500">No items below threshold</p>
          </div>
        </div>
        <p className="text-sm text-emerald-600 font-medium">All stock levels are healthy!</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="p-6 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Low Stock Alerts</h3>
              <p className="text-sm text-slate-500">{lowStockItems.length} items need attention</p>
            </div>
          </div>
          <Link to={createPageUrl("Items") + "?filter=low"}>
            <Button variant="ghost" size="sm" className="text-teal-600 hover:text-teal-700">
              View All <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {lowStockItems.slice(0, 5).map((item) => {
          const percentage = Math.round((item.current_stock / item.max_capacity) * 100);
          const isCritical = item.current_stock < item.min_threshold * 0.5;
          
          return (
            <div key={item.id} className="p-4 hover:bg-slate-50 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{item.name}</span>
                  <span className={cn(
                    "text-xs font-medium px-2 py-0.5 rounded-full",
                    isCritical ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                  )}>
                    {isCritical ? "Critical" : "Low"}
                  </span>
                </div>
                <span className="text-sm font-medium text-slate-600">
                  {item.current_stock} / {item.max_capacity} {item.unit_of_measure}
                </span>
              </div>
              <Progress 
                value={percentage} 
                className="h-2"
              />
              <p className="text-xs text-slate-500 mt-1">
                Min threshold: {item.min_threshold} {item.unit_of_measure} • Need to order: {Math.max(0, item.min_threshold - item.current_stock)} {item.unit_of_measure}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}