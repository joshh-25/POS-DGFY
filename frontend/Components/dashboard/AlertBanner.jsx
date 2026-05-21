import React from 'react';
import { AlertTriangle, Calendar } from 'lucide-react';
import { cn } from "../../src/lib/utils.js";

export default function AlertBanner({ type, title, message, icon: CustomIcon }) {
  const styles = {
    warning: {
      bg: "bg-amber-50 border-amber-200",
      icon: "bg-amber-100 text-amber-600",
      title: "text-amber-800",
      message: "text-amber-700"
    },
    critical: {
      bg: "bg-red-50 border-red-200",
      icon: "bg-red-100 text-red-600",
      title: "text-red-800",
      message: "text-red-700"
    },
    info: {
      bg: "bg-blue-50 border-blue-200",
      icon: "bg-blue-100 text-blue-600",
      title: "text-blue-800",
      message: "text-blue-700"
    }
  };

  const style = styles[type] || styles.info;
  const Icon = CustomIcon || AlertTriangle;

  return (
    <div className={cn("rounded-xl border p-4 flex items-start gap-4", style.bg)}>
      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", style.icon)}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <h4 className={cn("font-semibold", style.title)}>{title}</h4>
        <p className={cn("text-sm mt-0.5", style.message)}>{message}</p>
      </div>
    </div>
  );
}