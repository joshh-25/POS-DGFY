import React, { useMemo } from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from "../../../src/lib/utils.js";
import { formatNumber } from '../../../src/lib/numberUtils.js';

export default function RecipeFormulationStep({ data, updateData, items }) {
  const ingredients = data.ingredients || [];
  const batchSize = data.batch_size || 1;

  const ingredientItems = useMemo(() => {
    return items?.filter(item => item.category === 'ingredient') || [];
  }, [items]);

  const addIngredient = () => {
    updateData({
      ingredients: [...ingredients, { item_id: '', item_name: '', quantity: 0 }]
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
      const selectedItem = ingredientItems.find(item => item.id === value);
      updated[index] = {
        ...updated[index],
        item_id: value,
        item_name: selectedItem?.name || ''
      };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    updateData({ ingredients: updated });
  };

  const totalIngredientCost = useMemo(() => {
    return ingredients.reduce((sum, ing) => {
      const item = ingredientItems.find(i => i.id === ing.item_id);
      return sum + ((item?.cost_per_unit || 0) * ing.quantity * batchSize);
    }, 0);
  }, [ingredients, ingredientItems, batchSize]);

  const canProduceUnits = useMemo(() => {
    if (ingredients.length === 0) return 0;
    return Math.min(
      ...ingredients.map(ing => {
        const item = ingredientItems.find(i => i.id === ing.item_id);
        if (!item || ing.quantity === 0) return 0;
        return Math.floor(item.current_stock / (ing.quantity * batchSize));
      })
    );
  }, [ingredients, ingredientItems, batchSize]);

  return (
    <div className="space-y-6">
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
        <h3 className="font-semibold text-teal-900 mb-1">Recipe Formulation & Ingredient Ratios</h3>
        <p className="text-sm text-teal-700">Define the ingredients and their quantities per batch.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Batch Size (units produced per batch)</Label>
          <Input
            type="number"
            min="1"
            value={batchSize}
            onChange={(e) => updateData({ batch_size: parseInt(e.target.value) || 1 })}
          />
        </div>
        <div className="bg-slate-50 rounded-lg p-4">
          <p className="text-sm text-slate-600 mb-1">Production Capacity</p>
          <p className="text-2xl font-bold text-slate-900">{canProduceUnits} batches</p>
          <p className="text-xs text-slate-500">Can produce with current stock</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Ingredients *</Label>
          <Button variant="outline" size="sm" onClick={addIngredient}>
            <Plus className="w-4 h-4 mr-2" /> Add Ingredient
          </Button>
        </div>

        {ingredients.length === 0 ? (
          <div className="text-center p-8 border-2 border-dashed border-slate-200 rounded-xl">
            <p className="text-slate-500">No ingredients added yet. Click "Add Ingredient" to start.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {ingredients.map((ing, index) => {
              const item = ingredientItems.find(i => i.id === ing.item_id);
              const totalNeeded = ing.quantity * batchSize;
              const hasEnough = item && item.current_stock >= totalNeeded;
              
              return (
                <div key={index} className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <Label className="text-xs">Ingredient</Label>
                      <Select 
                        value={ing.item_id} 
                        onValueChange={(val) => updateIngredient(index, 'item_id', val)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select ingredient" />
                        </SelectTrigger>
                        <SelectContent>
                          {ingredientItems.map(item => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name} ({item.current_stock} {item.unit_of_measure} available)
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
                          onChange={(e) => updateIngredient(index, 'quantity', parseFloat(e.target.value) || 0)}
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
        )}
      </div>

      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
        <div className="flex justify-between items-center">
          <div>
            <p className="font-medium text-teal-900">Total Ingredient Cost per Batch</p>
            <p className="text-sm text-teal-700">Based on current pricing</p>
          </div>
          <p className="text-2xl font-bold text-teal-900">₱{formatNumber(totalIngredientCost, 2)}</p>
        </div>
      </div>
    </div>
  );
}