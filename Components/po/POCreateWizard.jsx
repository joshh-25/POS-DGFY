import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  ArrowRight, 
  ArrowLeft, 
  Check, 
  Star, 
  Truck, 
  DollarSign,
  AlertTriangle,
  Package,
  Plus
} from 'lucide-react';
import { cn } from "../../src/lib/utils.js";
import { getStockStatus, getQualityColor } from '@/components/data/dummyData';
import { formatNumber } from '../../src/lib/numberUtils.js';

export default function POCreateWizard({ open, onClose, onSubmit, suppliers, items }) {
  const [step, setStep] = useState(1);
  const [selectedItems, setSelectedItems] = useState([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState([]);
  const [supplierItemMapping, setSupplierItemMapping] = useState({});
  const [orderQuantities, setOrderQuantities] = useState({});
  const [expectedDelivery, setExpectedDelivery] = useState('');

  // Get items that need restocking
  const restockItems = useMemo(() => {
    return items.filter(item => {
      const status = getStockStatus(item);
      return status === 'critical' || status === 'warning' || item.category !== 'product';
    });
  }, [items]);

  // Calculate supplier recommendations
  const supplierRecommendations = useMemo(() => {
    if (selectedItems.length === 0) return [];

    return suppliers.map(supplier => {
      const canSupply = selectedItems.filter(itemId => 
        supplier.items_supplied.some(si => si.item_id === itemId)
      );
      
      // Find additional low-stock items this supplier can provide
      const additionalLowStock = restockItems
        .filter(item => {
          const status = getStockStatus(item);
          return (status === 'critical' || status === 'warning') && 
                 !selectedItems.includes(item.id) &&
                 supplier.items_supplied.some(si => si.item_id === item.id);
        });
      
      const totalCost = canSupply.reduce((sum, itemId) => {
        const supplierItem = supplier.items_supplied.find(si => si.item_id === itemId);
        const qty = orderQuantities[itemId] || supplierItem?.moq || 1;
        return sum + (supplierItem?.price_per_unit || 0) * qty;
      }, 0);

      const moqCompatible = canSupply.every(itemId => {
        const supplierItem = supplier.items_supplied.find(si => si.item_id === itemId);
        const qty = orderQuantities[itemId] || supplierItem?.moq || 1;
        return qty >= (supplierItem?.moq || 0);
      });

      return {
        ...supplier,
        canSupplyItems: canSupply,
        canSupplyCount: canSupply.length,
        additionalLowStock,
        totalCost,
        moqCompatible,
        coverage: (canSupply.length / selectedItems.length) * 100
      };
    })
    .filter(s => s.canSupplyCount > 0)
    .sort((a, b) => {
      // Sort by coverage, then by price
      if (b.coverage !== a.coverage) return b.coverage - a.coverage;
      return a.totalCost - b.totalCost;
    });
  }, [selectedItems, suppliers, orderQuantities, restockItems]);

  const toggleItem = (itemId) => {
    setSelectedItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const handleQuantityChange = (itemId, qty) => {
    setOrderQuantities(prev => ({ ...prev, [itemId]: qty }));
  };

  const toggleSupplier = (supplier) => {
    setSelectedSuppliers(prev => {
      const isSelected = prev.some(s => s.id === supplier.id);
      if (isSelected) {
        // Remove supplier and their item mappings
        const newMapping = { ...supplierItemMapping };
        delete newMapping[supplier.id];
        setSupplierItemMapping(newMapping);
        return prev.filter(s => s.id !== supplier.id);
      } else {
        // Add supplier and auto-assign items they can supply
        const newMapping = { ...supplierItemMapping };
        newMapping[supplier.id] = supplier.canSupplyItems;
        setSupplierItemMapping(newMapping);
        return [...prev, supplier];
      }
    });
  };

  const addRecommendedItem = (supplierId, itemId) => {
    // Add item to selected items
    if (!selectedItems.includes(itemId)) {
      setSelectedItems(prev => [...prev, itemId]);
    }
    // Add item to this supplier's mapping
    setSupplierItemMapping(prev => ({
      ...prev,
      [supplierId]: [...(prev[supplierId] || []), itemId]
    }));
  };

  const handleSubmit = () => {
    if (selectedSuppliers.length === 0) return;

    // Create separate PO for each supplier
    selectedSuppliers.forEach(supplier => {
      const supplierItemIds = supplierItemMapping[supplier.id] || [];
      
      const poItems = supplierItemIds.map(itemId => {
        const supplierItem = supplier.items_supplied.find(si => si.item_id === itemId);
        const item = items.find(i => i.id === itemId);
        const qty = orderQuantities[itemId] || supplierItem?.moq || 1;
        return {
          item_id: itemId,
          item_name: item?.name || '',
          quantity: qty,
          unit_price: supplierItem?.price_per_unit || 0,
          total_price: qty * (supplierItem?.price_per_unit || 0),
          quantity_received: 0,
          quality_check: null
        };
      });

      const subtotal = poItems.reduce((sum, item) => sum + item.total_price, 0);
      
      // Calculate bulk discount
      let discount = 0;
      if (supplier.bulk_discounts) {
        const totalQty = poItems.reduce((sum, item) => sum + item.quantity, 0);
        const applicableDiscount = supplier.bulk_discounts
          .filter(d => totalQty >= d.min_quantity)
          .sort((a, b) => b.discount_percent - a.discount_percent)[0];
        if (applicableDiscount) {
          discount = subtotal * (applicableDiscount.discount_percent / 100);
        }
      }

      onSubmit({
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        items: poItems,
        subtotal,
        discount,
        total_amount: subtotal - discount,
        expected_delivery_date: expectedDelivery || new Date(Date.now() + supplier.avg_delivery_days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      });
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Purchase Order</DialogTitle>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-4 py-4">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center font-medium transition-colors",
                step >= s ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-400"
              )}>
                {step > s ? <Check className="w-4 h-4" /> : s}
              </div>
              {s < 3 && (
                <div className={cn(
                  "w-16 h-0.5 mx-2",
                  step > s ? "bg-teal-600" : "bg-slate-200"
                )} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Select Items */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-slate-900">Select Items to Order</h3>
              <Badge variant="outline">{selectedItems.length} selected</Badge>
            </div>
            <div className="grid gap-3 max-h-96 overflow-y-auto">
              {restockItems.map(item => {
                const status = getStockStatus(item);
                const isSelected = selectedItems.includes(item.id);
                const needsRestock = status === 'critical' || status === 'warning';
                
                return (
                  <div 
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all",
                      isSelected 
                        ? "border-teal-500 bg-teal-50" 
                        : "border-slate-200 hover:border-slate-300"
                    )}
                  >
                    <Checkbox checked={isSelected} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{item.name}</span>
                        {needsRestock && (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Low Stock
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">
                        Current: {item.current_stock} / Min: {item.min_threshold} {item.unit_of_measure}
                      </p>
                    </div>
                    {isSelected && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Qty:</Label>
                        <Input
                          type="number"
                          className="w-20"
                          value={orderQuantities[item.id] || ''}
                          onChange={(e) => handleQuantityChange(item.id, parseInt(e.target.value) || 0)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Select Supplier(s) */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-slate-900">Select Suppliers</h3>
              <Badge variant="outline">{selectedSuppliers.length} supplier{selectedSuppliers.length !== 1 ? 's' : ''} selected</Badge>
            </div>
            {supplierRecommendations.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                No suppliers can provide the selected items
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {supplierRecommendations.map((supplier, idx) => {
                  const isSelected = selectedSuppliers.some(s => s.id === supplier.id);
                  return (
                    <div
                      key={supplier.id}
                      className={cn(
                        "p-4 rounded-xl border transition-all",
                        isSelected
                          ? "border-teal-500 bg-teal-50"
                          : "border-slate-200"
                      )}
                    >
                      <div 
                        className="cursor-pointer"
                        onClick={() => toggleSupplier(supplier)}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <Checkbox checked={isSelected} />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-900">{supplier.name}</span>
                                {idx === 0 && (
                                  <Badge className="bg-teal-100 text-teal-700">Best Match</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                                <span className="flex items-center gap-1">
                                  <Star className={cn("w-4 h-4", getQualityColor(supplier.quality_rating))} fill="currentColor" />
                                  {formatNumber(supplier.quality_rating, 1)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Truck className="w-4 h-4" />
                                  {supplier.avg_delivery_days} days
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-slate-900">₱{formatNumber(supplier.totalCost, 2)}</p>
                            <p className="text-sm text-slate-500">Est. Total</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-1">
                            <Package className="w-4 h-4 text-slate-400" />
                            <span>{supplier.canSupplyCount}/{selectedItems.length} items</span>
                          </div>
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-teal-500 rounded-full"
                              style={{ width: `${supplier.coverage}%` }}
                            />
                          </div>
                          <span className="text-slate-500">{Math.round(supplier.coverage)}% coverage</span>
                        </div>
                        {!supplier.moqCompatible && (
                          <p className="text-xs text-amber-600 mt-2">
                            ⚠️ Some quantities are below minimum order requirements
                          </p>
                        )}
                      </div>
                      
                      {/* Additional Low Stock Recommendations */}
                      {isSelected && supplier.additionalLowStock.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-slate-200">
                          <p className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            Also available from this supplier:
                          </p>
                          <div className="space-y-2">
                            {supplier.additionalLowStock.map(item => {
                              const supplierItem = supplier.items_supplied.find(si => si.item_id === item.id);
                              const isAdded = supplierItemMapping[supplier.id]?.includes(item.id);
                              return (
                                <div 
                                  key={item.id}
                                  className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200"
                                >
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium text-slate-900">{item.name}</span>
                                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                                        Low Stock
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-slate-500">
                                      Current: {item.current_stock} / Min: {item.min_threshold} {item.unit_of_measure}
                                      {supplierItem && ` • ₱${supplierItem.price_per_unit}/${item.unit_of_measure}`}
                                    </p>
                                  </div>
                                  {!isAdded ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        addRecommendedItem(supplier.id, item.id);
                                        if (supplierItem) {
                                          handleQuantityChange(item.id, supplierItem.moq || 1);
                                        }
                                      }}
                                      className="text-teal-600 border-teal-200 hover:bg-teal-50"
                                    >
                                      <Plus className="w-3 h-3 mr-1" />
                                      Add
                                    </Button>
                                  ) : (
                                    <Badge className="bg-teal-100 text-teal-700">Added</Badge>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Review & Confirm */}
        {step === 3 && selectedSuppliers.length > 0 && (
          <div className="space-y-4">
            <h3 className="font-medium text-slate-900">Review Orders</h3>
            
            <div className="space-y-2">
              <Label>Expected Delivery Date</Label>
              <Input
                type="date"
                value={expectedDelivery}
                onChange={(e) => setExpectedDelivery(e.target.value)}
              />
            </div>

            <div className="space-y-4 max-h-[450px] overflow-y-auto">
              {selectedSuppliers.map(supplier => {
                const supplierItemIds = supplierItemMapping[supplier.id] || [];
                const subtotal = supplierItemIds.reduce((sum, itemId) => {
                  const supplierItem = supplier.items_supplied.find(si => si.item_id === itemId);
                  const qty = orderQuantities[itemId] || supplierItem?.moq || 1;
                  return sum + (qty * (supplierItem?.price_per_unit || 0));
                }, 0);

                return (
                  <div key={supplier.id} className="border rounded-xl overflow-hidden">
                    <div className="bg-slate-50 p-4 border-b border-slate-200">
                      <p className="text-sm text-slate-500">Supplier</p>
                      <p className="font-semibold text-slate-900">{supplier.name}</p>
                    </div>

                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left p-3 text-sm font-medium text-slate-600">Item</th>
                          <th className="text-right p-3 text-sm font-medium text-slate-600">Qty</th>
                          <th className="text-right p-3 text-sm font-medium text-slate-600">Unit Price</th>
                          <th className="text-right p-3 text-sm font-medium text-slate-600">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {supplierItemIds.map(itemId => {
                          const item = items.find(i => i.id === itemId);
                          const supplierItem = supplier.items_supplied.find(si => si.item_id === itemId);
                          const qty = orderQuantities[itemId] || supplierItem?.moq || 1;
                          const total = qty * (supplierItem?.price_per_unit || 0);
                          return (
                            <tr key={itemId}>
                              <td className="p-3 font-medium text-slate-900">{item?.name}</td>
                              <td className="p-3 text-right text-slate-600">{qty}</td>
                              <td className="p-3 text-right text-slate-600">₱{formatNumber(supplierItem?.price_per_unit, 2)}</td>
                              <td className="p-3 text-right font-medium text-slate-900">₱{formatNumber(total, 2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <div className="bg-slate-50 p-4 border-t border-slate-200">
                      <div className="flex justify-between text-lg font-bold">
                        <span>Supplier Total</span>
                        <span className="text-teal-600">₱{formatNumber(subtotal, 2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-slate-600">Total Order Value</p>
                  <p className="text-xs text-slate-500">{selectedSuppliers.length} supplier{selectedSuppliers.length !== 1 ? 's' : ''}</p>
                </div>
                <p className="text-2xl font-bold text-teal-600">
                  ₱{formatNumber(
                    selectedSuppliers.reduce((sum, supplier) => {
                      const supplierItemIds = supplierItemMapping[supplier.id] || [];
                      return sum + supplierItemIds.reduce((itemSum, itemId) => {
                        const supplierItem = supplier.items_supplied.find(si => si.item_id === itemId);
                        const qty = orderQuantities[itemId] || supplierItem?.moq || 1;
                        return itemSum + (qty * (parseFloat(supplierItem?.price_per_unit || 0)));
                      }, 0);
                    }, 0),
                    2
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex justify-between">
          <div>
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(step - 1)}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            {step < 3 ? (
              <Button 
                onClick={() => setStep(step + 1)}
                disabled={(step === 1 && selectedItems.length === 0) || (step === 2 && selectedSuppliers.length === 0)}
                className="bg-teal-600 hover:bg-teal-700"
              >
                Next <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} className="bg-teal-600 hover:bg-teal-700">
                Create {selectedSuppliers.length} Order{selectedSuppliers.length !== 1 ? 's' : ''}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}