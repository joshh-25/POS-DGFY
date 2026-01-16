import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils.js';
import { Calendar, Clock, ArrowRight, Package, Layers } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "../../src/lib/utils.js";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { format } from 'date-fns';

export default function ExpiringBatchesList({ alerts }) {
  const [activeTab, setActiveTab] = useState('critical');

  // Separate alerts by type and severity
  const expiryAlerts = alerts.filter(a => a.type === 'expiring_batch');
  const missingExpiryAlerts = alerts.filter(a => a.type === 'missing_expiry_date');

  const criticalAlerts = expiryAlerts.filter(a => a.severity === 'critical');
  const warningAlerts = expiryAlerts.filter(a => a.severity === 'warning');

  // Count unique items with expiring batches
  const uniqueItemsCount = new Set(alerts.map(a => a.item_id)).size;

  const renderAlertList = (alertList, emptyMessage) => {
    if (alertList.length === 0) {
      return (
        <div className="p-6 text-center">
          <p className="text-sm text-emerald-600 font-medium">{emptyMessage}</p>
        </div>
      );
    }

    return (
      <div className="divide-y divide-slate-100">
        {alertList.slice(0, 5).map((alert, index) => {
          const isMissingExpiry = alert.type === 'missing_expiry_date';

          const days = alert.days_until_expiry;
          const isDaysInvalid = days === null || days === undefined || Number.isNaN(days);
          const isExpired = !isMissingExpiry && !isDaysInvalid && days < 0;

          // Calculate shelf life progress if available
          const shelfLifeDays = alert.shelf_life_days;
          const hasShelfLife = shelfLifeDays && shelfLifeDays > 0;
          const shelfLifeUsed = hasShelfLife && alert.received_date
            ? Math.ceil((new Date() - new Date(alert.received_date)) / (1000 * 60 * 60 * 24))
            : null;

          return (
            <Link
              key={`alert-${alert.batch_id}-${index}`}
              to={createPageUrl("Items")}
              className="block p-4 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-slate-400" />
                  <span className="font-medium text-slate-900">{alert.item_name}</span>
                  {alert.fifo_enabled && (
                    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">
                      <Layers className="w-3 h-3 mr-1" />
                      FIFO
                    </Badge>
                  )}
                  <Badge variant="outline" className={cn(
                    "text-xs font-medium",
                    isMissingExpiry || isDaysInvalid
                      ? "bg-slate-100 text-slate-700 border-slate-200"
                      : isExpired
                        ? "bg-red-100 text-red-700 border-red-200"
                        : days <= 7
                          ? "bg-red-100 text-red-700 border-red-200"
                          : days <= 14
                            ? "bg-amber-100 text-amber-700 border-amber-200"
                            : "bg-yellow-100 text-yellow-700 border-yellow-200"
                  )}>
                    {isMissingExpiry ? 'Missing Date' : isDaysInvalid ? 'Invalid Date' : isExpired ? 'Expired' : `${days}d left`}
                  </Badge>
                </div>
                <span className="text-sm text-slate-600">
                  Batch #{alert.batch_id}
                </span>
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {isMissingExpiry
                    ? 'Expiry date not set'
                    : isDaysInvalid
                      ? 'Expiry date invalid'
                      : isExpired
                        ? `Expired ${Math.abs(days)} days ago`
                        : days === 0
                          ? 'Expires today'
                          : days === 1
                            ? 'Expires tomorrow'
                            : `Expires in ${days} days`
                  }
                </span>
                <span>
                  {parseFloat(alert.available_quantity).toFixed(2)} {alert.unit_of_measure}
                </span>
                <span className="text-slate-400">SKU: {alert.item_sku}</span>
              </div>

              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-3 text-xs">
                  {alert.expiry_date && !isNaN(new Date(alert.expiry_date).getTime()) && (
                    <span className="text-slate-400">
                      Expiry: {format(new Date(alert.expiry_date), 'MMM d, yyyy')}
                    </span>
                  )}
                  {alert.po_number && (
                    <span className="text-slate-400">
                      PO: {alert.po_number}
                    </span>
                  )}
                  {alert.suggestion && (
                    <span className="text-amber-600 font-medium">
                      {alert.suggestion}
                    </span>
                  )}
                </div>
                {hasShelfLife && (
                  <span className="text-xs text-slate-500">
                    Shelf life: {shelfLifeDays} days
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    );
  };

  if (alerts.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Expiry Alerts</h3>
            <p className="text-sm text-slate-500">No batches expiring soon</p>
          </div>
        </div>
        <p className="text-sm text-emerald-600 font-medium">All batches are within shelf life!</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="p-6 border-b border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Expiry Alerts</h3>
              <p className="text-sm text-slate-500">
                {alerts.length} batch{alerts.length !== 1 ? 'es' : ''} across {uniqueItemsCount} item{uniqueItemsCount !== 1 ? 's' : ''} need attention
              </p>
            </div>
          </div>
          <Link to={createPageUrl("Items") + "?filter=expiring"}>
            <Button variant="ghost" size="sm" className="text-teal-600 hover:text-teal-700">
              View All <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="critical" className="text-sm">
              Critical ({criticalAlerts.length})
            </TabsTrigger>
            <TabsTrigger value="warning" className="text-sm">
              Warning ({warningAlerts.length})
            </TabsTrigger>
            <TabsTrigger value="missing" className="text-sm">
              Missing ({missingExpiryAlerts.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {activeTab === 'critical' && renderAlertList(criticalAlerts, "No critical expiries!")}
      {activeTab === 'warning' && renderAlertList(warningAlerts, "No batches expiring within 30 days!")}
      {activeTab === 'missing' && renderAlertList(missingExpiryAlerts, "No batches with missing expiry dates!")}
    </div>
  );
}
