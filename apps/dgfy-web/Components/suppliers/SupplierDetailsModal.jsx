import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils.js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Mail,
  Phone,
  MapPin,
  FilePlus,
  Star,
  Percent
} from 'lucide-react';
import { cn } from "../../src/lib/utils.js";
import { dummyPurchaseOrders } from '@/components/data/dummyData';
import { formatNumber } from '../../src/lib/numberUtils.js';
import SupplierScorecard from '@/components/SupplierScorecard';

export default function SupplierDetailsModal({ supplier, open, onClose }) {
  if (!supplier) return null;

  // Try to use real supplier_id for filtering
  const sid = supplier.supplier_id || supplier.id;
  const recentDeliveries = (dummyPurchaseOrders || [])
    .filter(po => (po.supplier_id === sid) && po.status === 'received')
    .slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{supplier.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Contact Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 text-slate-600">
              <Mail className="w-4 h-4 text-slate-400" />
              <span>{supplier.email}</span>
            </div>
            <div className="flex items-center gap-3 text-slate-600">
              <Phone className="w-4 h-4 text-slate-400" />
              <span>{supplier.phone}</span>
            </div>
            <div className="flex items-start gap-3 text-slate-600 col-span-2">
              <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
              <span>{supplier.address}</span>
            </div>
            {supplier.notes && (
              <div className="flex items-start gap-3 text-slate-600 col-span-2 bg-slate-50 p-2 rounded-md">
                <FilePlus className="w-4 h-4 text-slate-400 mt-0.5" />
                <span className="text-sm italic">{supplier.notes}</span>
              </div>
            )}
          </div>

          {/* Performance Scorecard (AI Analyzed) */}
          <div>
            <h4 className="font-medium text-slate-900 mb-3">Performance Scorecard</h4>
            <SupplierScorecard supplierId={sid} />
          </div>

          {/* Items Supplied */}
          <div>
            <h4 className="font-medium text-slate-900 mb-3">Items Supplied</h4>
            <div className="bg-slate-50 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="text-left p-3 text-sm font-medium text-slate-600">Item</th>
                    <th className="text-right p-3 text-sm font-medium text-slate-600">MOQ</th>
                    <th className="text-right p-3 text-sm font-medium text-slate-600">Price/Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(supplier.items_supplied || []).map((item, idx) => (
                    <tr key={idx}>
                      <td className="p-3 font-medium text-slate-900">{item.item_name}</td>
                      <td className="p-3 text-right text-slate-600">{item.moq}</td>
                      <td className="p-3 text-right text-slate-900 font-medium">₱{formatNumber(item.price_per_unit, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bulk Discounts */}
          {supplier.bulk_discounts && supplier.bulk_discounts.length > 0 && (
            <div>
              <h4 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                <Percent className="w-4 h-4" />
                Bulk Discount Tiers
              </h4>
              <div className="flex flex-wrap gap-3">
                {supplier.bulk_discounts.map((tier, idx) => (
                  <div key={idx} className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2">
                    <p className="text-sm text-emerald-700">
                      <span className="font-semibold">{tier.min_quantity}+</span> units = <span className="font-semibold">{tier.discount_percent}%</span> off
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Deliveries */}
          {recentDeliveries.length > 0 && (
            <div>
              <h4 className="font-medium text-slate-900 mb-3">Recent Deliveries</h4>
              <div className="space-y-2">
                {recentDeliveries.map((po) => (
                  <div key={po.id} className="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                    <div>
                      <p className="font-medium text-slate-900">{po.po_number}</p>
                      <p className="text-sm text-slate-500">{po.received_date}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-600">₱{formatNumber(po.total_amount, 2)}</span>
                      {po.delivery_rating && (
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-amber-500" fill="currentColor" />
                          <span className="text-sm font-medium">{po.delivery_rating}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-8 pb-6 border-t border-slate-200">
            <Link to={createPageUrl("PurchaseOrders") + `?supplier=${supplier.supplier_id || supplier.id}&action=create`}>
              <Button className="w-full bg-teal-600 hover:bg-teal-700">
                <FilePlus className="w-4 h-4 mr-2" />
                Create Purchase Order
              </Button>
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}