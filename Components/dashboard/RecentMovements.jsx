import React from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowRight, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, RotateCcw, AlertCircle } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "../../src/lib/utils.js";
import { createPageUrl } from '@/utils.js';

const movementConfig = {
  purchase_receipt: { 
    icon: ArrowDownCircle, 
    color: "text-emerald-600", 
    bg: "bg-emerald-50 border-emerald-200", 
    label: "Purchase Receipt" 
  },
  production_consumption: { 
    icon: ArrowUpCircle, 
    color: "text-red-500", 
    bg: "bg-red-50 border-red-200", 
    label: "Production Consumption" 
  },
  transfer: { 
    icon: ArrowLeftRight, 
    color: "text-blue-500", 
    bg: "bg-blue-50 border-blue-200", 
    label: "Transfer" 
  },
  return: { 
    icon: RotateCcw, 
    color: "text-blue-500", 
    bg: "bg-blue-50 border-blue-200", 
    label: "Return" 
  },
  calculated_loss: { 
    icon: AlertCircle, 
    color: "text-red-600", 
    bg: "bg-red-50 border-red-200", 
    label: "Calculated Loss" 
  }
};

export default function RecentMovements({ movements = [] }) {
  const recentMovements = movements
    .filter(mov => mov.created_date) // Filter out invalid dates
    .sort((a, b) => {
      const dateA = new Date(a.created_date);
      const dateB = new Date(b.created_date);
      return dateB - dateA;
    })
    .slice(0, 5);

  if (recentMovements.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
            <ArrowLeftRight className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Recent Movements</h3>
            <p className="text-sm text-slate-500">No movements recorded</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 font-medium">No stock movements to display</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="p-6 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
              <ArrowLeftRight className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Recent Movements</h3>
              <p className="text-sm text-slate-500">Latest stock activity</p>
            </div>
          </div>
          <Link to={createPageUrl("StockMovements")}>
            <Button variant="ghost" size="sm" className="text-teal-600 hover:text-teal-700">
              View All <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {recentMovements.map((mov) => {
          const config = movementConfig[mov.movement_type] || movementConfig.transfer;
          const Icon = config.icon;
          const isPositive = mov.movement_type === 'purchase_receipt' || mov.movement_type === 'return';
          
          return (
            <div key={mov.id} className="p-4 hover:bg-slate-50 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{mov.item_name}</span>
                  <Badge variant="outline" className={cn("flex items-center gap-1 w-fit text-xs", config.bg)}>
                    <Icon className={cn("w-3 h-3", config.color)} />
                    {config.label}
                  </Badge>
                </div>
                <span className={cn(
                  "text-sm font-semibold",
                  isPositive ? "text-emerald-600" : "text-red-500"
                )}>
                  {isPositive ? '+' : '-'}{mov.quantity}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  {mov.created_date 
                    ? format(new Date(mov.created_date), 'MMM d, yyyy h:mm a')
                    : 'N/A'}
                </span>
                {mov.reference_id && (
                  <span className="font-medium">{mov.reference_id}</span>
                )}
              </div>
              {mov.notes && (
                <p className="text-xs text-slate-400 mt-1 truncate">{mov.notes}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
