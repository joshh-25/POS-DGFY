import React, { useMemo, useState } from 'react';
import { Input } from "@/components/ui/input";
import { toast } from 'sonner';
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Plus, Trash2, AlertTriangle, CheckCircle, Beaker, Package, Info, Search, Calculator } from 'lucide-react';
import { cn } from "../../../src/lib/utils.js";
import { formatNumber } from '../../../src/lib/numberUtils.js';
import { canBeProductIngredient } from '@/components/utils/categoryHelpers';

export default function RecipeFormulationStep({ data, updateData, items }) {
  const ingredients = data.ingredients || [];
  const batchSize = data.batch_size || 1;
  const [rawIngredientSearch, setRawIngredientSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');

  // Filter items - ingredients can include raw materials, and other products (WIP/Finished Goods)
  const availableIngredients = useMemo(() => {
    return (items || []).filter(item => canBeProductIngredient(item));
  }, [items]);

  const productComponentItems = useMemo(() => {
    return items?.filter(item => item.category === 'product' && item.status === 'active') || [];
  }, [items]);

  // Filtered lists based on search
  const filteredRawIngredients = useMemo(() => {
    if (!rawIngredientSearch) return availableIngredients;
    const search = rawIngredientSearch.toLowerCase();
    return availableIngredients.filter(item =>
      item.name?.toLowerCase().includes(search) ||
      item.sku_code?.toLowerCase().includes(search)
    );
  }, [availableIngredients, rawIngredientSearch]);

  const filteredProductComponents = useMemo(() => {
    if (!productSearch) return productComponentItems;
    const search = productSearch.toLowerCase();
    return productComponentItems.filter(item =>
      item.name?.toLowerCase().includes(search) ||
      item.sku_code?.toLowerCase().includes(search)
    );
  }, [productComponentItems, productSearch]);

  // Combined list for Select dropdowns
  const allIngredientItems = useMemo(() => {
    return [...availableIngredients, ...productComponentItems];
  }, [availableIngredients, productComponentItems]);

  // Auto-fix ingredients that have item_id but missing item_name (data corruption fix)
  React.useEffect(() => {
    if (ingredients.length > 0 && allIngredientItems.length > 0) {
      let needsUpdate = false;
      const fixed = ingredients.map(ing => {
        if (ing.item_id && !ing.item_name) {
          const item = allIngredientItems.find(i => i.item_id === ing.item_id);
          if (item) {
            needsUpdate = true;
            return { ...ing, item_name: item.name, is_product: item.category === 'product' };
          }
        }
        return ing;
      });

      if (needsUpdate) {
        updateData({ ingredients: fixed });
      }
    }
  }, [ingredients, allIngredientItems]);

  const addIngredientById = (itemId) => {
    const item = allIngredientItems.find(i => i.item_id === parseInt(itemId));
    if (!item) return;

    // Check if already added
    if (ingredients.some(ing => ing.item_id === item.item_id)) {
      return; // Already exists
    }

    updateData({
      ingredients: [...ingredients, {
        item_id: item.item_id,
        item_name: item.name,
        quantity: 0,
        is_product: item.category === 'product',
        nesting_level: item.nesting_level || 0
      }]
    });
  };

  const removeIngredient = (index) => {
    updateData({
      ingredients: ingredients.filter((_, i) => i !== index)
    });
  };

  const updateIngredient = (index, field, value) => {
    const updated = [...ingredients];
    if (field === 'item_id') {
      const itemId = parseInt(value);

      // Check if already exists in another row
      if (ingredients.some((ing, i) => i !== index && ing.item_id === itemId)) {
        toast.error("This ingredient is already in the recipe");
        return;
      }

      const selectedItem = allIngredientItems.find(item => item.item_id === itemId);
      updated[index] = {
        ...updated[index],
        item_id: itemId,
        item_name: selectedItem?.name || '',
        is_product: selectedItem?.category === 'product',
        nesting_level: selectedItem?.nesting_level || 0
      };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    updateData({ ingredients: updated });
  };

  const totalIngredientCost = useMemo(() => {
    return ingredients.reduce((sum, ing) => {
      const item = allIngredientItems.find(i => i.item_id === ing.item_id);
      return sum + ((item?.cost_per_unit || 0) * ing.quantity);
    }, 0);
  }, [ingredients, allIngredientItems]);

  const canProduceUnits = useMemo(() => {
    if (ingredients.length === 0) return 0;
    return Math.min(
      ...ingredients.map(ing => {
        const item = allIngredientItems.find(i => i.item_id === ing.item_id);
        if (!item || ing.quantity === 0) return 0;
        return Math.floor(item.current_stock / ing.quantity);
      })
    );
  }, [ingredients, allIngredientItems]);

  // Per-Batch Cost (for ONE batch unit)
  const perBatchCosts = useMemo(() => {
    return ingredients.map(ing => {
      const item = allIngredientItems.find(i => i.item_id === ing.item_id);
      return {
        item_name: ing.item_name,
        quantity: ing.quantity,
        unit: item?.unit_of_measure || 'units',
        cost_per_unit: item?.cost_per_unit || 0,
        total_cost: (item?.cost_per_unit || 0) * ing.quantity,
        is_product: ing.is_product
      };
    });
  }, [ingredients, allIngredientItems]);

  // Per-Ingredient Cost (total for all batches)
  const perIngredientCosts = useMemo(() => {
    return ingredients.map(ing => {
      const item = allIngredientItems.find(i => i.item_id === ing.item_id);
      return {
        item_name: ing.item_name,
        quantity_per_batch: ing.quantity,
        total_quantity: ing.quantity,
        unit: item?.unit_of_measure || 'units',
        cost_per_unit: item?.cost_per_unit || 0,
        total_cost: (item?.cost_per_unit || 0) * ing.quantity,
        is_product: ing.is_product
      };
    });
  }, [ingredients, allIngredientItems]);

  // Render ingredient item for selection
  const renderIngredientItem = (item, type) => (
    <div
      key={item.item_id}
      className={cn(
        "flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-slate-50 transition-colors",
        ingredients.some(ing => ing.item_id === item.item_id) && "bg-slate-100 border-slate-300"
      )}
      onClick={() => addIngredientById(item.item_id)}
    >
      <div className="flex items-center gap-3">
        {type === 'raw' ? (
          <Beaker className="w-5 h-5 text-emerald-600" />
        ) : (
          <Package className="w-5 h-5 text-blue-600" />
        )}
        <div>
          <p className="font-medium text-slate-900">{item.name}</p>
          <p className="text-sm text-slate-500">{item.sku_code} • {item.current_stock} {item.unit_of_measure}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {type === 'product' && item.nesting_level !== undefined && (
          <Badge variant="outline" className="bg-blue-50 text-blue-700">
            Level {item.nesting_level}
          </Badge>
        )}
        {ingredients.some(ing => ing.item_id === item.item_id) ? (
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">Added</Badge>
        ) : (
          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); addIngredientById(item.item_id); }}>
            <Plus className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
        <h3 className="font-semibold text-teal-900 mb-1">Recipe Formulation & Ingredient Ratios</h3>
        <p className="text-sm text-teal-700">Define the ingredients and their quantities per batch. You can use both raw ingredients and other products as components.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Batch Size (units produced per batch{data.unit_of_measure ? ` in ${data.unit_of_measure}` : ''})</Label>
          <Input
            type="number"
            min="1"
            step="1"
            value={batchSize}
            onChange={(e) => {
              const value = e.target.value;
              if (value === '') {
                updateData({ batch_size: '' });
              } else {
                const numValue = parseInt(value);
                if (!isNaN(numValue) && numValue >= 1) {
                  updateData({ batch_size: numValue });
                }
              }
            }}
            onBlur={() => {
              if (!batchSize || batchSize < 1) {
                updateData({ batch_size: 1 });
              }
            }}
            placeholder="Enter batch size"
          />
        </div>
        <div className="bg-slate-50 rounded-lg p-4">
          <p className="text-sm text-slate-600 mb-1">Production Capacity</p>
          <p className="text-2xl font-bold text-slate-900">{canProduceUnits} batches</p>
          <p className="text-xs text-slate-500">Can produce with current stock</p>
        </div>
      </div>

      {/* Ingredient Selection Accordion */}
      <Accordion type="single" collapsible defaultValue="ingredient-selection" className="w-full">
        <AccordionItem value="ingredient-selection" className="border border-slate-200 rounded-lg px-4 data-[state=closed]:bg-slate-50/50 transition-colors">
          <AccordionTrigger className="hover:no-underline py-3">
            <Label className="cursor-pointer text-base font-semibold text-slate-700">Select Ingredients *</Label>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 pt-1">
              <Tabs defaultValue="raw-ingredients" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="raw-ingredients" className="flex items-center gap-2">
                    <Beaker className="w-4 h-4" />
                    Raw Ingredients ({availableIngredients.length})
                  </TabsTrigger>
                  <TabsTrigger value="product-components" className="flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Product Components ({productComponentItems.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="raw-ingredients" className="space-y-3 mt-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      type="search"
                      placeholder="Search raw ingredients..."
                      className="pl-10"
                      value={rawIngredientSearch}
                      onChange={(e) => setRawIngredientSearch(e.target.value)}
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {filteredRawIngredients.length === 0 ? (
                      <p className="text-center text-slate-500 py-4">No raw ingredients found</p>
                    ) : (
                      filteredRawIngredients.map(item => renderIngredientItem(item, 'raw'))
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="product-components" className="space-y-3 mt-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
                    <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-800">
                      <p className="font-medium">Nested Products</p>
                      <p>You can use other products as ingredients. Maximum nesting depth is 3 levels. Circular dependencies are automatically prevented.</p>
                    </div>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      type="search"
                      placeholder="Search product components..."
                      className="pl-10"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {filteredProductComponents.length === 0 ? (
                      <p className="text-center text-slate-500 py-4">No product components found</p>
                    ) : (
                      filteredProductComponents.map(item => renderIngredientItem(item, 'product'))
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Selected Ingredients List */}
      {ingredients.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Selected Ingredients ({ingredients.length})</Label>
          </div>
          <div className="space-y-3">
            {ingredients.map((ing, index) => {
              const item = allIngredientItems.find(i => i.item_id === ing.item_id);
              const totalNeeded = ing.quantity;
              const hasEnough = item && item.current_stock >= totalNeeded;

              return (
                <div key={index} className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <div className="flex items-center gap-2">
                        {ing.is_product ? (
                          <Package className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Beaker className="w-4 h-4 text-emerald-600" />
                        )}
                        <Label className="text-xs">
                          {ing.is_product ? 'Product Component' : 'Raw Ingredient'}
                        </Label>
                        {ing.is_product && ing.nesting_level !== undefined && (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 text-xs">
                            Level {ing.nesting_level}
                          </Badge>
                        )}
                      </div>
                      <Select
                        value={ing.item_id ? String(ing.item_id) : ''}
                        onValueChange={(val) => updateIngredient(index, 'item_id', val)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select ingredient">
                            {ing.item_id ? (
                              item ?
                                `${item.name} (${item.current_stock} ${item.unit_of_measure} available)` :
                                (ing.item_name || ing.item_id)
                            ) : null}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {allIngredientItems.map(item => (
                            <SelectItem key={item.item_id} value={String(item.item_id)}>
                              <div className="flex items-center gap-2">
                                {item.category === 'product' ? (
                                  <Package className="w-3 h-3 text-blue-600" />
                                ) : (
                                  <Beaker className="w-3 h-3 text-emerald-600" />
                                )}
                                {item.name} ({item.current_stock} {item.unit_of_measure})
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Quantity per batch</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={ing.quantity}
                          onChange={(e) => {
                            if (e.target.value === '') {
                              updateIngredient(index, 'quantity', '');
                            } else {
                              const raw = parseFloat(e.target.value);
                              updateIngredient(index, 'quantity', isNaN(raw) ? 0 : parseFloat(raw.toFixed(6)));
                            }
                          }}
                        />
                        <Button variant="ghost" size="sm" onClick={() => removeIngredient(index)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {item && (
                    <div className="flex items-center justify-between text-sm bg-slate-50 p-2 rounded">
                      <div className="flex items-center gap-2">
                        {hasEnough ? (
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                        )}
                        <span className={cn(hasEnough ? 'text-emerald-700' : 'text-amber-700')}>
                          Need: {totalNeeded} {item.unit_of_measure} • Available: {item.current_stock} {item.unit_of_measure}
                        </span>
                      </div>
                      <Badge variant="outline" className="bg-white">
                        ₱{formatNumber(item.cost_per_unit * totalNeeded, 2)}
                      </Badge>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Enhanced Cost Breakdown */}
      {ingredients.length > 0 && (
        <div className="space-y-4">
          <Tabs defaultValue="per-batch" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="per-batch">Per Batch View</TabsTrigger>
              <TabsTrigger value="per-ingredient">Per Ingredient View</TabsTrigger>
            </TabsList>

            {/* Per-Batch Tab */}
            <TabsContent value="per-batch" className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h4 className="font-medium text-blue-900 mb-3">
                  Cost Breakdown for 1 Batch
                </h4>
                {perBatchCosts.map((cost, idx) => (
                  <div key={idx} className="flex justify-between items-center py-2 border-b border-blue-100 last:border-0">
                    <div className="flex items-center gap-2">
                      {cost.is_product ? (
                        <Package className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Beaker className="w-4 h-4 text-emerald-600" />
                      )}
                      <div>
                        <p className="font-medium text-slate-900">{cost.item_name}</p>
                        <p className="text-sm text-slate-600">
                          {formatNumber(cost.quantity, cost.quantity > 0 && cost.quantity < 0.01 ? 8 : 2)} {cost.unit} × ₱{formatNumber(cost.cost_per_unit, 2)}/{cost.unit}
                        </p>
                      </div>
                    </div>
                    <p className="font-semibold text-slate-900">₱{formatNumber(cost.total_cost, 2)}</p>
                  </div>
                ))}
                <div className="pt-3 mt-3 border-t border-blue-200">
                  <div className="flex justify-between items-center">
                    <p className="font-bold text-blue-900">Total Per Batch:</p>
                    <p className="font-bold text-blue-900 text-lg">
                      ₱{formatNumber(perBatchCosts.reduce((sum, c) => sum + c.total_cost, 0), 2)}
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Per-Ingredient Tab */}
            <TabsContent value="per-ingredient" className="space-y-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <h4 className="font-medium text-emerald-900 mb-3">
                  Total Ingredient Costs
                </h4>
                {perIngredientCosts.map((cost, idx) => (
                  <div key={idx} className="flex justify-between items-start py-2 border-b border-emerald-100 last:border-0">
                    <div className="flex items-start gap-2">
                      {cost.is_product ? (
                        <Package className="w-4 h-4 text-blue-600 mt-1" />
                      ) : (
                        <Beaker className="w-4 h-4 text-emerald-600 mt-1" />
                      )}
                      <div>
                        <p className="font-medium text-slate-900">{cost.item_name}</p>
                        <p className="text-sm text-slate-600">
                          {formatNumber(cost.quantity_per_batch, cost.quantity_per_batch > 0 && cost.quantity_per_batch < 0.01 ? 8 : 2)} {cost.unit}
                        </p>
                        <p className="text-sm text-slate-600">
                          {formatNumber(cost.total_quantity, cost.total_quantity > 0 && cost.total_quantity < 0.01 ? 8 : 2)} {cost.unit} × ₱{formatNumber(cost.cost_per_unit, 2)}/{cost.unit}
                        </p>
                      </div>
                    </div>
                    <p className="font-semibold text-slate-900">₱{formatNumber(cost.total_cost, 2)}</p>
                  </div>
                ))}
                <div className="pt-3 mt-3 border-t border-emerald-200">
                  <div className="flex justify-between items-center">
                    <p className="font-bold text-emerald-900">Total All Batches:</p>
                    <p className="font-bold text-emerald-900 text-lg">
                      ₱{formatNumber(totalIngredientCost, 2)}
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}