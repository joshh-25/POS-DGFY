
import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils.js';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "../../src/lib/utils.js";

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export default function LowStockList({ items }) {
  const navigate = useNavigate();
  const [selectedItem, setSelectedItem] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('materials');

  // Split items into products and materials
  const allLowStockItems = items
    .filter(item => item.current_stock < item.min_threshold)
    .sort((a, b) => (a.current_stock / a.min_threshold) - (b.current_stock / b.min_threshold));

  const lowStockProducts = allLowStockItems.filter(item => item.category === 'product');
  const lowStockMaterials = allLowStockItems.filter(item => item.category !== 'product');

  const handleItemClick = (item) => {
    setSelectedItem(item);
    setDialogOpen(true);
  };

  const handleConfirm = () => {
    if (!selectedItem) return;

    // Determine action based on category
    // Job Order for products
    if (selectedItem.category === 'product') {
      navigate(`/job-orders?action=create&productId=${selectedItem.id || selectedItem.item_id}`);
    } else {
      // Purchase Order for ingredients, packaging, etc.
      navigate(`/purchase-orders?action=create&itemId=${selectedItem.id || selectedItem.item_id}`);
    }
    setDialogOpen(false);
  };

  const renderItemList = (itemList, emptyMessage) => {
    if (itemList.length === 0) {
      return (
        <div className="p-6 text-center">
          <p className="text-sm text-emerald-600 font-medium">{emptyMessage}</p>
        </div>
      );
    }

    return (
      <div className="divide-y divide-slate-100">
        {itemList.slice(0, 5).map((item, index) => {
          const percentage = Math.round((item.current_stock / item.max_capacity) * 100);
          const isCritical = item.current_stock < item.min_threshold * 0.5;

          return (
            <div
              key={item.id || `low-stock-${index}`}
              className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
              onClick={() => handleItemClick(item)}
            >
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
                Min threshold: {item.min_threshold} {item.unit_of_measure} • Need to order: {Math.max(
                  item.purchase_allowance || 0,
                  (item.min_threshold || 0) - (item.current_stock || 0)
                )} {item.unit_of_measure}
              </p>
            </div>
          );
        })}
      </div>
    );
  };

  if (allLowStockItems.length === 0) {
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
    <>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Low Stock Alerts</h3>
                <p className="text-sm text-slate-500">{allLowStockItems.length} items need attention</p>
              </div>
            </div>
            <Link to={createPageUrl("Items") + "?filter=low"}>
              <Button variant="ghost" size="sm" className="text-teal-600 hover:text-teal-700">
                View All <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="materials" className="text-sm">
                Ingredients & Supplies ({lowStockMaterials.length})
              </TabsTrigger>
              <TabsTrigger value="products" className="text-sm">
                Products ({lowStockProducts.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {activeTab === 'materials' && renderItemList(lowStockMaterials, "All ingredients and supplies are well stocked!")}
        {activeTab === 'products' && renderItemList(lowStockProducts, "All products are well stocked!")}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restock Item</DialogTitle>
            <DialogDescription>
              {selectedItem?.category === 'product'
                ? `Would you like to create a Job Order for ${selectedItem?.name}?`
                : `Would you like to create a Purchase Order for ${selectedItem?.name}?`
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleConfirm} className="bg-teal-600 hover:bg-teal-700">
              {selectedItem?.category === 'product' ? 'Create Job Order' : 'Create Purchase Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}