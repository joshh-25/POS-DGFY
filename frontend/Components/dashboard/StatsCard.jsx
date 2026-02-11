import React from 'react';
import { cn } from "../../src/lib/utils.js";

export default function StatsCard({ title, value, subtitle, icon: Icon, trend, trendUp, color = "teal" }) {
  const colorClasses = {
    teal: {
      bg: "bg-teal-50",
      icon: "bg-teal-500",
      trend: trendUp ? "text-emerald-600" : "text-red-500"
    },
    red: {
      bg: "bg-red-50",
      icon: "bg-red-500",
      trend: trendUp ? "text-emerald-600" : "text-red-500"
    },
    amber: {
      bg: "bg-amber-50",
      icon: "bg-amber-500",
      trend: trendUp ? "text-emerald-600" : "text-red-500"
    },
    emerald: {
      bg: "bg-emerald-50",
      icon: "bg-emerald-500",
      trend: trendUp ? "text-emerald-600" : "text-red-500"
    },
    blue: {
      bg: "bg-blue-50",
      icon: "bg-blue-500",
      trend: trendUp ? "text-emerald-600" : "text-red-500"
    }
  };

  const colors = colorClasses[color] || colorClasses.teal;

  return (
    <div className={cn("bg-white rounded-2xl border border-slate-200 p-6", colors.bg)}>
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-500 truncate" title={title}>{title}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 truncate" title={String(value)}>{value}</p>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
          )}
          {trend && (
            <div className={cn("flex items-center gap-1 mt-2 text-sm font-medium", colors.trend)}>
              {trend}
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", colors.icon)}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        )}
      </div>
    </div>
  );
}