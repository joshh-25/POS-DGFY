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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from "../../src/lib/utils.js";
import { formatNumber } from '../../src/lib/numberUtils.js';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';

export default function JOCreateModal({ open, onClose, onSubmit, onSaveDraft, products, items, jobOrder }) {
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [initialFormData, setInitialFormData] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const isEditingDraft = jobOrder?.status === 'draft';

  useEffect(() => {
    if (jobOrder && open) {
      const initialData = {
        selectedProduct: jobOrder.product_id || '',
        quantity: jobOrder.quantity_to_produce || 1
      };
      setSelectedProduct(initialData.selectedProduct);
      setQuantity(initialData.quantity);
      setInitialFormData(initialData);
      setIsDirty(false);
    } else if (!jobOrder && open) {
      const initialData = { selectedProduct: '', quantity: 1 };
      setSelectedProduct('');
      setQuantity(1);
      setInitialFormData(initialData);
      setIsDirty(false);
    }
  }, [jobOrder, open]);

  // Track dirty state
  useEffect(() => {
    if (initialFormData && !jobOrder) {
      const currentData = { selectedProduct, quantity };
      const hasChanged = JSON.stringify(currentData) !== JSON.stringify(initialFormData);
      setIsDirty(hasChanged);
    }
  }, [selectedProduct, quantity, initialFormData, jobOrder]);

  const product = products.find(p => p.id === selectedProduct);

  const ingredientRequirements = useMemo(() => {
    if (!product || !product.ingredients) return [];
    
    return product.ingredients.map(ing => {
      const item = items.find(i => i.id === ing.item_id);
      const requiredQty = ing.quantity * quantity;
      const currentStock = item?.current_stock || 0;
      const stockAfter = currentStock - requiredQty;
      const isInsufficient = stockAfter < 0;
      
      return {
        item_id: ing.item_id,
        item_name: ing.item_name,
        quantity_required: requiredQty,
        stock_before: currentStock,
        stock_after: stockAfter,
        isInsufficient,
        unit: item?.unit_of_measure || 'units'
      };
    });
  }, [product, quantity, items]);

  const hasInsufficientStock = ingredientRequirements.some(ing => ing.isInsufficient);

  const handleClose = () => {
    if (isDirty && !jobOrder) {
      setShowConfirmation(true);
    } else {
      onClose();
    }
  };

  const handleSaveDraft = () => {
    const draftData = {
      product_id: selectedProduct,
      quantity_to_produce: quantity || 1,
      ingredients: ingredientRequirements,
      status: 'draft'
    };
    if (onSaveDraft) {
      onSaveDraft(draftData);
    }
    setIsDirty(false);
    onClose();
  };

  const handleFinalize = () => {
    handleSubmit(false);
  };

  const handleSubmit = (isDraft = false) => {
    if (!product && !isDraft) return;

    const joData = {
      product_id: selectedProduct || product?.id,
      product_name: product?.name,
      quantity_to_produce: quantity || 1,
      ingredients: ingredientRequirements,
      status: isDraft ? 'draft' : (jobOrder?.status || 'in_progress')
    };

    if (isDraft && onSaveDraft) {
      onSaveDraft(joData);
    } else {
      onSubmit(joData);
    }
    setIsDirty(false);
    onClose();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {jobOrder ? 'Edit Job Order' : 'Create Job Order'}
              {isEditingDraft && (
                <Badge variant="outline" className="bg-slate-100 text-slate-700">
                  Draft
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Product Selection */}
          <div className="space-y-2">
            <Label>Product to Produce</Label>
            <Select value={selectedProduct} onValueChange={setSelectedProduct}>
              <SelectTrigger>
                <SelectValue placeholder="Select a product" />
              </SelectTrigger>
              <SelectContent>
                {products.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label>Quantity to Produce</Label>
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value === '' ? '' : parseInt(e.target.value) || 1)}
            />
          </div>

          {/* Ingredients Required */}
          {product && ingredientRequirements.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Required Ingredients</Label>
                {hasInsufficientStock && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Insufficient Stock
                  </Badge>
                )}
              </div>
              
              <div className="space-y-3">
                {ingredientRequirements.map((ing, idx) => (
                  <div 
                    key={idx}
                    className={cn(
                      "p-4 rounded-xl border",
                      ing.isInsufficient 
                        ? "bg-red-50 border-red-200" 
                        : "bg-slate-50 border-slate-200"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-slate-900">{ing.item_name}</span>
                      <Badge variant="outline" className={cn(
                        ing.isInsufficient 
                          ? "bg-red-100 text-red-700 border-red-200"
                          : "bg-emerald-100 text-emerald-700 border-emerald-200"
                      )}>
                        {ing.isInsufficient ? (
                          <><AlertTriangle className="w-3 h-3 mr-1" /> Insufficient</>
                        ) : (
                          <><CheckCircle className="w-3 h-3 mr-1" /> Available</>
                        )}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-slate-500">Required</p>
                        <p className="font-medium text-slate-900">
                          {formatNumber(ing.quantity_required, 3)} {ing.unit}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Current Stock</p>
                        <p className="font-medium text-slate-900">
                          {ing.stock_before} {ing.unit}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">After Production</p>
                        <p className={cn(
                          "font-medium",
                          ing.isInsufficient ? "text-red-600" : "text-emerald-600"
                        )}>
                          {formatNumber(ing.stock_after, 3)} {ing.unit}
                        </p>
                      </div>
                    </div>
                    {ing.isInsufficient && (
                      <p className="text-xs text-red-600 mt-2">
                        Need {formatNumber(Math.abs(ing.stock_after), 3)} {ing.unit} more to complete this order
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

          <DialogFooter className="pt-8 flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            {!jobOrder && onSaveDraft && (
              <Button variant="outline" onClick={() => handleSubmit(true)}>
                Save as Draft
              </Button>
            )}
            {isEditingDraft ? (
              <Button onClick={handleFinalize} disabled={!product} className="bg-teal-600 hover:bg-teal-700">
                Finalize Job Order
              </Button>
            ) : (
              <Button
                onClick={() => handleSubmit(false)}
                disabled={!product}
                className="bg-teal-600 hover:bg-teal-700"
              >
                {jobOrder ? 'Update Job Order' : 'Create Job Order'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={showConfirmation}
        onOpenChange={setShowConfirmation}
        title="Save Draft?"
        message="You have unsaved changes. Would you like to save them as a draft?"
        onSaveDraft={handleSaveDraft}
        onDiscard={() => {
          setIsDirty(false);
          onClose();
        }}
        onContinueEditing={() => setShowConfirmation(false)}
      />
    </>
  );
}