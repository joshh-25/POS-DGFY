import React, { useState } from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Package, TrendingDown, AlertTriangle, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from "../../src/lib/utils.js";
import { formatNumber } from '../../src/lib/numberUtils.js';
import { isNearExpiry, isExpired } from '@/components/utils/expiryHelpers.js';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import WriteOffBatchDialog from './WriteOffBatchDialog.jsx';

export default function FIFOBatchViewer({ item, onRefresh }) {
  const [writeOffTarget, setWriteOffTarget] = useState(null);

  if (!item.fifo_enabled) return null;

  // Filter to batches with remaining stock
  const activeBatches = (item.fifo_batches || []).filter(batch => {
    const remaining = parseFloat(batch.quantity) - parseFloat(batch.quantity_consumed || 0);
    return remaining > 0;
  });

  if (activeBatches.length === 0) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
        <Package className="w-8 h-8 text-slate-400 mx-auto mb-2" />
        <p className="text-sm text-slate-500">No active FIFO batches</p>
        <p className="text-xs text-slate-400 mt-1">
          Batches are created when POs are received or JOs complete
        </p>
      </div>
    );
  }

  const sortedBatches = [...activeBatches].sort((a, b) =>
    new Date(a.received_date) - new Date(b.received_date)
  );

  // Find the first non-expired batch — that's the real "Next to use"
  const nextToUseIdx = sortedBatches.findIndex(b => !isExpired(b.expiry_date));

  const totalQuantity = sortedBatches.reduce((sum, b) =>
    sum + (parseFloat(b.quantity) - parseFloat(b.quantity_consumed || 0)), 0
  );

  const weightedAvgCost = totalQuantity > 0
    ? sortedBatches.reduce((sum, b) => {
      const remaining = parseFloat(b.quantity) - parseFloat(b.quantity_consumed || 0);
      return sum + (remaining * parseFloat(b.cost_per_unit || 0));
    }, 0) / totalQuantity
    : 0;

  // Summary counts for the accordion trigger chips
  const expiredCount = sortedBatches.filter(b => isExpired(b.expiry_date)).length;
  const nearExpiryCount = sortedBatches.filter(b => isNearExpiry(b.expiry_date)).length;

  return (
    <>
      <Accordion type="single" collapsible defaultValue="fifo-batches" className="bg-blue-50 border border-blue-200 rounded-xl overflow-hidden">
        <AccordionItem value="fifo-batches" className="border-none">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-blue-100/50 [&[data-state=open]]:bg-blue-50">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Package className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <h4 className="font-semibold text-blue-900">FIFO Batches (Oldest First)</h4>
              <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">
                {sortedBatches.length} batch{sortedBatches.length !== 1 ? 'es' : ''}
              </Badge>
              {expiredCount > 0 && (
                <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {expiredCount} expired
                </Badge>
              )}
              {nearExpiryCount > 0 && (
                <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200">
                  {nearExpiryCount} expiring soon
                </Badge>
              )}
            </div>
          </AccordionTrigger>

          <AccordionContent className="px-4 pb-4 pt-0">
            <div className="space-y-2">
              {sortedBatches.map((batch, idx) => {
                const nearExpiry = isNearExpiry(batch.expiry_date);
                const expired = isExpired(batch.expiry_date);
                const remaining = parseFloat(batch.quantity) - parseFloat(batch.quantity_consumed || 0);
                const isNextToUse = nextToUseIdx !== -1 && idx === nextToUseIdx;

                return (
                  <div
                    key={batch.batch_id}
                    className={cn(
                      "bg-white rounded-lg p-3 border-2",
                      isNextToUse ? "border-blue-500" : "border-slate-200",
                      expired && "opacity-60 border-red-300"
                    )}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">
                            Batch {batch.batch_id}
                          </span>
                          {isNextToUse && (
                            <Badge className="bg-blue-500 text-white text-xs">Next to use</Badge>
                          )}
                          {expired && (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                              Expired
                            </Badge>
                          )}
                          {nearExpiry && !expired && (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                              Expiring Soon
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          PO: {batch.po_number || 'N/A'}
                        </p>
                        {batch.notes && (
                          <p className="text-xs text-slate-600 mt-1 italic">
                            📝 {batch.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="text-right">
                          <p className="text-lg font-bold text-slate-900">{formatNumber(remaining, 2)}</p>
                          <p className="text-xs text-slate-500">{item.unit_of_measure}</p>
                        </div>
                        {expired && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 h-8 px-2 flex-shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setWriteOffTarget(batch);
                            }}
                          >
                            <Trash2 className="w-3 h-3 mr-1" />
                            Write Off
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3 text-slate-600">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Received: {format(new Date(batch.received_date), 'MMM d, yyyy')}
                        </span>
                        {batch.expiry_date ? (
                          <span className={cn(
                            "flex items-center gap-1",
                            expired ? "text-red-600" : nearExpiry ? "text-amber-600" : ""
                          )}>
                            <TrendingDown className="w-3 h-3" />
                            Expires: {format(new Date(batch.expiry_date), 'MMM d, yyyy')}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">No expiry</span>
                        )}
                      </div>
                      <span className="font-semibold text-slate-900">
                        ₱{formatNumber(batch.cost_per_unit, 2)}/unit
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 pt-3 border-t border-blue-200">
              <div className="flex justify-between text-sm">
                <span className="text-blue-700">Total Quantity:</span>
                <span className="font-semibold text-blue-900">
                  {formatNumber(totalQuantity, 2)} {item.unit_of_measure}
                </span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-blue-700">Weighted Avg Cost:</span>
                <span className="font-semibold text-blue-900">
                  ₱{formatNumber(weightedAvgCost, 2)}/unit
                </span>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Write-off dialog — rendered outside accordion to avoid z-index issues */}
      <WriteOffBatchDialog
        open={!!writeOffTarget}
        onClose={() => setWriteOffTarget(null)}
        batch={writeOffTarget}
        item={item}
        onSuccess={() => {
          setWriteOffTarget(null);
          onRefresh?.();
        }}
      />
    </>
  );
}
