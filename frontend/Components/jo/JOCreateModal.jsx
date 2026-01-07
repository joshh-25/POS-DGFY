import React, { useState, useMemo, useEffect } from 'react';
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
import { AlertTriangle, CheckCircle, Package, Plus, Search } from 'lucide-react';
import { cn } from "../../src/lib/utils.js";
import { formatNumber } from '../../src/lib/numberUtils.js';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import { toast } from 'sonner';

/**
 * Calculate suggested production quantity to bring stock to healthy level
 * Target: min_threshold + purchase_allowance (comfortable stock level)
 */
const calculateSuggestedProductionQty = (product) => {
  const currentStock = parseFloat(product?.current_stock) || 0;
  const minThreshold = parseFloat(product?.min_threshold) || 0;
  const purchaseAllowance = parseFloat(product?.purchase_allowance) || 0;

  // Target: bring stock to threshold + allowance buffer
  const targetStock = minThreshold + purchaseAllowance;
  const deficit = Math.max(0, targetStock - currentStock);

  // At minimum, produce the purchase_allowance amount or 1
  return Math.max(Math.ceil(deficit), Math.ceil(purchaseAllowance), 1);
};

export default function JOCreateModal({ open, onClose, onSubmit, onSaveDraft, products, items, jobOrder, initialProductId }) {
  // If editing an existing JO, we operate in single-mode
  const isEditing = !!jobOrder;
  const isEditingDraft = jobOrder?.status === 'draft';

  // Selection state for new JOs (Bulk Mode)
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [quantities, setQuantities] = useState({}); // { [productId]: quantity }

  // Selection state for editing (Single Mode)
  const [singleSelectedProduct, setSingleSelectedProduct] = useState('');
  const [singleQuantity, setSingleQuantity] = useState(1);

  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Initialize state when opening
  useEffect(() => {
    if (open) {
      if (isEditing) {
        setSingleSelectedProduct(jobOrder.product_id);
        setSingleQuantity(jobOrder.quantity_to_produce);
      } else {
        if (initialProductId) {
          const pid = parseInt(initialProductId);
          setSelectedProductIds([pid]);
          setQuantities({ [pid]: 1 });
        } else {
          setSelectedProductIds([]);
          setQuantities({});
        }
      }
      setIsDirty(false);
      setSearchQuery('');
    }
  }, [open, jobOrder, isEditing, initialProductId]);

  // Identify low stock products
  const lowStockProducts = useMemo(() => {
    return products.filter(p => {
      // Logic for low stock: current_stock <= min_threshold
      // Ensure we treat null/undefined thresholds safely
      const minThreshold = p.min_threshold || 0;
      return (p.current_stock || 0) <= minThreshold;
    });
  }, [products]);

  // Filter products by search query
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const query = searchQuery.toLowerCase();
    return products.filter(product =>
      product.name.toLowerCase().includes(query) ||
      product.sku_code?.toLowerCase().includes(query)
    );
  }, [products, searchQuery]);

  // Handle "Select Low Stock"
  const handleSelectLowStock = () => {
    const lowStockIds = lowStockProducts.map(p => p.id || p.item_id);
    setSelectedProductIds(prev => {
      const combined = new Set([...prev, ...lowStockIds]);
      return Array.from(combined);
    });

    // Auto-fill with suggested production quantities
    setQuantities(prev => {
      const next = { ...prev };
      lowStockIds.forEach(id => {
        if (!next[id]) {
          const product = products.find(p => (p.id || p.item_id) === id);
          next[id] = calculateSuggestedProductionQty(product);
        }
      });
      return next;
    });

    toast.success(`Selected ${lowStockIds.length} low stock products with suggested quantities`);
  };

  const toggleProduct = (productId) => {
    setSelectedProductIds(prev => {
      const isSelected = prev.includes(productId);
      if (isSelected) {
        // Deselect
        const next = prev.filter(id => id !== productId);
        // Clean up quantity
        const nextQuantities = { ...quantities };
        delete nextQuantities[productId];
        setQuantities(nextQuantities);
        return next;
      } else {
        // Select - auto-fill with suggested production quantity
        const product = products.find(p => (p.id || p.item_id) === productId);
        const suggestedQty = calculateSuggestedProductionQty(product);
        setQuantities(prevQtys => ({ ...prevQtys, [productId]: suggestedQty }));

        // Show toast if auto-filled with calculated value
        if (suggestedQty > 1) {
          toast.info('Quantity Suggested', {
            description: `Set to ${suggestedQty} to reach healthy stock level`,
            duration: 2000,
          });
        }

        return [...prev, productId];
      }
    });
  };

  const handleQuantityChange = (productId, qty) => {
    setQuantities(prev => ({
      ...prev,
      [productId]: qty < 1 ? 1 : qty
    }));
  };

  // Calculate ingredients for ALL selected products (or single if editing)
  const allIngredientRequirements = useMemo(() => {
    let reqs = [];

    if (isEditing) {
      const product = products.find(p => (p.id || p.item_id) === singleSelectedProduct);
      if (product && product.ingredients) {
        product.ingredients.forEach(ing => {
          reqs.push({
            ...ing,
            quantity_required: ing.quantity * singleQuantity,
            jo_product: product.name
          });
        });
      }
    } else {
      selectedProductIds.forEach(pid => {
        const product = products.find(p => (p.id || p.item_id) === pid);
        const qty = quantities[pid] || 1;
        if (product && product.ingredients) {
          product.ingredients.forEach(ing => {
            reqs.push({
              ...ing,
              quantity_required: ing.quantity * qty,
              jo_product: product.name
            });
          });
        }
      });
    }

    // Aggregate by item_id
    const aggregated = {};
    reqs.forEach(req => {
      if (!aggregated[req.item_id]) {
        const item = items.find(i => i.id === req.item_id);
        aggregated[req.item_id] = {
          item_id: req.item_id,
          item_name: req.item_name,
          quantity_required: 0,
          current_stock: item?.current_stock || 0,
          unit: item?.unit_of_measure || 'units',
          affected_products: new Set()
        };
      }
      aggregated[req.item_id].quantity_required += req.quantity_required;
      aggregated[req.item_id].affected_products.add(req.jo_product);
    });

    return Object.values(aggregated).map(item => ({
      ...item,
      stock_after: item.current_stock - item.quantity_required,
      isInsufficient: item.current_stock < item.quantity_required,
      affected_products: Array.from(item.affected_products)
    }));

  }, [isEditing, singleSelectedProduct, singleQuantity, selectedProductIds, quantities, products, items]);

  const hasInsufficientStock = allIngredientRequirements.some(ing => ing.isInsufficient);

  const handleSubmit = (isDraft = false) => {
    if (isEditing) {
      // Single Update Mode
      if (!singleSelectedProduct) return;

      const product = products.find(p => (p.id || p.item_id) === singleSelectedProduct);
      const ingredients = product?.ingredients?.map(ing => {
        const item = items.find(i => i.id === ing.item_id);
        const reqQty = ing.quantity * singleQuantity;
        return {
          item_id: ing.item_id,
          quantity_required: reqQty,
          stock_before: item?.current_stock || 0,
          stock_after: (item?.current_stock || 0) - reqQty,
          isInsufficient: (item?.current_stock || 0) < reqQty
        };
      }) || [];

      const joData = {
        product_id: singleSelectedProduct,
        quantity_to_produce: singleQuantity,
        ingredients,
        status: isDraft ? 'draft' : (jobOrder.status || 'in_progress')
      };

      if (isDraft && onSaveDraft) onSaveDraft(joData);
      else onSubmit(joData);

    } else {
      // Bulk Create Mode
      if (selectedProductIds.length === 0) {
        toast.error("Please select at least one product");
        return;
      }

      if (!isDraft && hasInsufficientStock) {
        toast.error("Insufficient stock for some ingredients. Please save as draft or restock.");
        return;
      }

      const newJobOrders = selectedProductIds.map(pid => {
        const product = products.find(p => (p.id || p.item_id) === pid);
        const qty = quantities[pid] || 1;

        const ingredients = product?.ingredients?.map(ing => {
          const item = items.find(i => i.id === ing.item_id);
          const reqQty = ing.quantity * qty;
          return {
            item_id: ing.item_id,
            quantity_required: reqQty,
            stock_before: item?.current_stock || 0,
            stock_after: (item?.current_stock || 0) - reqQty,
            isInsufficient: (item?.current_stock || 0) < reqQty
          };
        }) || [];

        return {
          product_id: pid,
          quantity_to_produce: qty,
          ingredients,
          status: isDraft ? 'draft' : 'in_progress'
        };
      });

      if (isDraft && onSaveDraft) {
        // Note: consumer needs to handle array for bulk drafts if we want that, 
        // or we loop here. For now let's assume one-by-one or array header support.
        // But usually 'Safe Draft' is a single action. 
        // Let's pass the array and let parent handle it.
        onSaveDraft(newJobOrders);
      } else {
        onSubmit(newJobOrders);
      }
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEditing ? 'Edit Job Order' : 'Create Job Orders'}
            {isEditingDraft && <Badge variant="outline">Draft</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">

          {/* Header Controls for Bulk Mode */}
          {!isEditing && (
            <div className="flex items-center justify-between pb-4 border-b">
              <div className="space-y-1">
                <h3 className="font-medium">Select Products</h3>
                <p className="text-sm text-slate-500">
                  {selectedProductIds.length} products selected
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectLowStock}
                className="text-teal-600 border-teal-200 hover:bg-teal-50"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Select Low Stock ({lowStockProducts.length})
              </Button>
            </div>
          )}

          {/* Search Input */}
          {!isEditing && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search products by name or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          )}

          {/* Product List / Selection */}
          {!isEditing ? (
            <div className="grid gap-3 max-h-[400px] overflow-y-auto">
              {filteredProducts.map(p => {
                const isSelected = selectedProductIds.includes(p.id || p.item_id);
                // Handle different ID keys if necessary. Usually p.id from products list.
                const pid = p.id || p.item_id;
                const minThreshold = p.min_threshold || 0;
                const isLowStock = (p.current_stock || 0) <= minThreshold;

                return (
                  <div
                    key={pid}
                    onClick={() => toggleProduct(pid)}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all",
                      isSelected ? "border-teal-500 bg-teal-50" : "border-slate-200 hover:border-slate-300"
                    )}
                  >
                    <Checkbox checked={isSelected} />

                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{p.name}</span>
                        {isLowStock && (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Low Stock
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                        <span className={cn(isLowStock && "text-red-600 font-medium")}>
                          Stock: {formatNumber(p.current_stock || 0)}
                        </span>
                        <span className="text-slate-400">|</span>
                        <span>Min: {formatNumber(minThreshold)}</span>
                        <span className="text-slate-400">|</span>
                        <span className="text-teal-600 font-medium">
                          Suggested: {calculateSuggestedProductionQty(p)}
                        </span>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <Label className="text-xs">Qty:</Label>
                        <Input
                          type="number"
                          min={1}
                          className="w-24 h-8"
                          value={quantities[pid] || 1}
                          onChange={(e) => handleQuantityChange(pid, parseInt(e.target.value) || 0)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            // Edit Mode - Single Product View
            <div className="p-4 border rounded-xl bg-slate-50">
              <div className="flex justify-between items-center mb-4">
                <Label className="text-base font-medium">{products.find(p => (p.id || p.item_id) === singleSelectedProduct)?.name}</Label>
                <div className="flex items-center gap-2">
                  <Label>Quantity:</Label>
                  <Input
                    type="number"
                    min={1}
                    className="w-24"
                    value={singleQuantity}
                    onChange={(e) => setSingleQuantity(parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Ingredient Requirements Summary */}
          {(selectedProductIds.length > 0 || isEditing) && (
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-slate-900">Total Ingredients Required</h4>
                {hasInsufficientStock && (
                  <Badge variant="destructive">Insufficient Stock</Badge>
                )}
              </div>

              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {allIngredientRequirements.map(req => (
                  <div key={req.item_id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg text-sm border border-slate-100">
                    <div>
                      <div className="font-medium">{req.item_name}</div>
                      <div className="text-xs text-slate-500">
                        For: {req.affected_products.length > 3
                          ? `${req.affected_products.slice(0, 3).join(', ')} +${req.affected_products.length - 3} more`
                          : req.affected_products.join(', ')}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={cn("font-medium", req.isInsufficient ? "text-red-600" : "text-emerald-600")}>
                        {req.isInsufficient ? "Missing " : "Available "}
                        {formatNumber(req.isInsufficient ? Math.abs(req.stock_after) : req.stock_after)} {req.unit}
                      </div>
                      <div className="text-xs text-slate-500">
                        Req: {formatNumber(req.quantity_required)} / Stock: {formatNumber(req.current_stock)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        <DialogFooter className="flex justify-between items-center mt-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <div className="flex gap-2">
            {onSaveDraft && (
              <Button variant="outline" onClick={() => handleSubmit(true)}>
                Save as Draft
              </Button>
            )}
            <Button
              onClick={() => handleSubmit(false)}
              disabled={(!isEditing && selectedProductIds.length === 0) || hasInsufficientStock}
              className={cn("bg-teal-600 hover:bg-teal-700", (!isEditing && selectedProductIds.length === 0) && "opacity-50")}
            >
              {isEditing ? 'Update Job Order' : `Create ${selectedProductIds.length} Job Order${selectedProductIds.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}