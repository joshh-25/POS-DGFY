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
import NumberStepper from "@/components/ui/number-stepper";
import { AlertTriangle, Search } from 'lucide-react';
import { cn } from "../../src/lib/utils.js";
import { formatNumber } from '../../src/lib/numberUtils.js';
import { toast } from 'sonner';
import { convertQuantity, areCompatible, normalizeUom } from '../../src/utils/uomConverter';
import { toUomAbbreviation } from '../../src/utils/uomDisplay';

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

const getDisplayUom = (uom) => toUomAbbreviation(uom, 'u');

export default function JOCreateModal({ open, onClose, onSubmit, onSaveDraft, products, items, jobOrder, initialProductId }) {
  // If editing an existing JO, we operate in single-mode
  const isEditing = !!jobOrder;
  const isEditingDraft = jobOrder?.status === 'draft';
  const initialProductIdNumber = !isEditing && initialProductId ? Number.parseInt(initialProductId, 10) : null;
  const hasInitialProduct = Number.isInteger(initialProductIdNumber) && initialProductIdNumber > 0;

  // Selection state for new JOs (Bulk Mode)
  const [selectedProductIds, setSelectedProductIds] = useState(() => (
    hasInitialProduct ? [initialProductIdNumber] : []
  ));
  const [quantities, setQuantities] = useState(() => (
    hasInitialProduct ? { [initialProductIdNumber]: 1 } : {}
  )); // { [productId]: quantity }

  // Selection state for editing (Single Mode)
  const [singleSelectedProduct] = useState(() => (isEditing ? jobOrder.product_id : ''));
  const [singleQuantity, setSingleQuantity] = useState(() => (isEditing ? jobOrder.quantity_to_produce : 1));

  const [searchQuery, setSearchQuery] = useState('');

  // Identify low stock products (only if threshold is set)
  const lowStockProducts = useMemo(() => {
    return products.filter(p => {
      // Only consider as low stock if min_threshold is set (not null)
      if (p.min_threshold === null || p.min_threshold === undefined) {
        return false;
      }
      return (p.current_stock || 0) <= p.min_threshold;
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

  const handleQuantityChange = (productId, rawValue) => {
    // Allow empty string to permit clearing the input
    if (rawValue === '') {
      setQuantities(prev => ({
        ...prev,
        [productId]: ''
      }));
      return;
    }

    const qty = parseInt(rawValue, 10);
    // Only update if it's a valid number
    if (!isNaN(qty)) {
      setQuantities(prev => ({
        ...prev,
        [productId]: qty
      }));
    }
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

    // Aggregate by item_id with UOM conversion support
    const aggregated = {};
    reqs.forEach(req => {
      if (!aggregated[req.item_id]) {
        const item = items.find(i => i.id === req.item_id);
        aggregated[req.item_id] = {
          item_id: req.item_id,
          item_name: req.item_name,
          quantity_required: 0,
          quantity_required_original: 0,
          recipe_uom: normalizeUom(req.unit_of_measure || item?.unit_of_measure),
          current_stock: item?.current_stock || 0,
          unit: normalizeUom(item?.unit_of_measure) || 'units',
          affected_products: new Set(),
          wasConverted: false
        };
      }

      // Convert recipe quantity to stock UOM if different but compatible
      const recipeUom = normalizeUom(req.unit_of_measure || aggregated[req.item_id].unit);
      const stockUom = aggregated[req.item_id].unit;
      let convertedQty = req.quantity_required;

      if (areCompatible(recipeUom, stockUom) && recipeUom !== stockUom) {
        const converted = convertQuantity(req.quantity_required, recipeUom, stockUom);
        if (converted !== null) {
          convertedQty = converted;
          aggregated[req.item_id].wasConverted = true;
          aggregated[req.item_id].recipe_uom = recipeUom;
        }
      }

      aggregated[req.item_id].quantity_required += convertedQty;
      aggregated[req.item_id].quantity_required_original += req.quantity_required;
      aggregated[req.item_id].affected_products.add(req.jo_product);
    });

    return Object.values(aggregated).map(item => ({
      ...item,
      stock_after: item.current_stock - item.quantity_required,
      isInsufficient: item.current_stock < item.quantity_required,
      affected_products: Array.from(item.affected_products),
      conversionNote: item.wasConverted ? `(from ${formatNumber(item.quantity_required_original, 2)} ${getDisplayUom(item.recipe_uom)})` : null
    }));

  }, [isEditing, singleSelectedProduct, singleQuantity, selectedProductIds, quantities, products, items]);

  const hasInsufficientStock = allIngredientRequirements.some(ing => ing.isInsufficient);

  const handleSubmit = (isDraft = false) => {
    if (isEditing) {
      // Single Update Mode
      if (!singleSelectedProduct) return;

      const product = products.find(p => (p.id || p.item_id) === singleSelectedProduct);
      if (!isDraft && (!product?.ingredients || product.ingredients.length === 0)) {
        toast.error(`Cannot create job order for ${product?.name || 'this product'}: recipe ingredients are missing.`);
        return;
      }
      const ingredients = product?.ingredients?.map(ing => {
        const item = items.find(i => i.id === ing.item_id);
        const reqQty = ing.quantity * singleQuantity;
        return {
          item_id: ing.item_id,
          quantity_required: reqQty,
          stock_before: item?.current_stock || 0,
          stock_after: (item?.current_stock || 0) - reqQty,
          isInsufficient: (item?.current_stock || 0) < reqQty,
          unit_of_measure: ing.unit_of_measure // Include UOM
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

      if (!isDraft) {
        const missingRecipeProducts = selectedProductIds
          .map((pid) => products.find((p) => (p.id || p.item_id) === pid))
          .filter((product) => !product?.ingredients || product.ingredients.length === 0);

        if (missingRecipeProducts.length > 0) {
          const names = missingRecipeProducts.map((p) => p?.name || 'Unknown Product').join(', ');
          toast.error(`Cannot create job order. Missing recipe ingredients for: ${names}`);
          return;
        }
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
            isInsufficient: (item?.current_stock || 0) < reqQty,
            unit_of_measure: ing.unit_of_measure // Include UOM
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto pb-8">
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
                const productUom = getDisplayUom(p.unit_of_measure);
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
                          Stock: {formatNumber(p.current_stock || 0)} {productUom}
                        </span>
                        <span className="text-slate-400">|</span>
                        <span>Min: {formatNumber(minThreshold)} {productUom}</span>
                        <span className="text-slate-400">|</span>
                        <span className="text-teal-600 font-medium">
                          Suggested: {calculateSuggestedProductionQty(p)} {productUom}
                        </span>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <Label className="text-xs">Qty:</Label>
                        <NumberStepper
                          value={quantities[pid] !== undefined ? quantities[pid] : 1}
                          onChange={(nextValue) => handleQuantityChange(pid, nextValue)}
                          min={0}
                          step={1}
                          allowEmpty
                          size="sm"
                          uomLabel={productUom}
                          controlsPosition="right-vertical"
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
                  <NumberStepper
                    value={singleQuantity}
                    onChange={(nextValue) => setSingleQuantity(nextValue)}
                    min={0}
                    step={1}
                    allowEmpty
                    size="sm"
                    uomLabel={getDisplayUom(products.find(p => (p.id || p.item_id) === singleSelectedProduct)?.unit_of_measure)}
                    controlsPosition="right-vertical"
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
                        {formatNumber(req.isInsufficient ? Math.abs(req.stock_after) : req.stock_after)} {getDisplayUom(req.unit)}
                      </div>
                      <div className="text-xs text-slate-500">
                        Req: {formatNumber(req.quantity_required, req.quantity_required > 0 && req.quantity_required < 0.01 ? 8 : 2)} {getDisplayUom(req.unit)}
                        {req.conversionNote && (
                          <span className="text-blue-500 ml-1">{req.conversionNote}</span>
                        )}
                        {' / Stock: '}{formatNumber(req.current_stock)} {getDisplayUom(req.unit)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        <DialogFooter className="flex justify-between items-center mt-6 pt-2">
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
