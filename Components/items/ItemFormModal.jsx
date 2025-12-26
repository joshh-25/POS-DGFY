import React, { useState, useEffect } from 'react';
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Package } from 'lucide-react';
import { Switch } from "@/components/ui/switch";
import { dummyItems } from '@/components/data/dummyData';

export default function ItemFormModal({ item, open, onClose, onSave }) {
  const [formData, setFormData] = useState({
    sku_code: '',
    name: '',
    category: 'ingredient',
    description: '',
    unit_of_measure: 'kg',
    cost_per_unit: 0,
    max_capacity: 0,
    current_stock: 0,
    fifo_enabled: false,
    ingredients: [],
    packaging_specs: {
      height: '',
      width: '',
      thickness: '',
      material: '',
      design: '',
      contents: ''
    }
  });

  useEffect(() => {
    if (item) {
      setFormData({
        ...item,
        ingredients: item.ingredients || [],
        packaging_specs: item.packaging_specs || {
          height: '',
          width: '',
          thickness: '',
          material: '',
          design: '',
          contents: ''
        }
      });
    } else {
      setFormData({
        sku_code: '',
        name: '',
        category: 'ingredient',
        description: '',
        unit_of_measure: 'kg',
        cost_per_unit: 0,
        max_capacity: 0,
        current_stock: 0,
        fifo_enabled: false,
        ingredients: [],
        packaging_specs: {
          height: '',
          width: '',
          thickness: '',
          material: '',
          design: '',
          contents: ''
        }
      });
    }
  }, [item, open]);

  const handleChange = (field, value) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      if (field === 'max_capacity') {
        updated.min_threshold = Math.round(value * 0.4);
        updated.purchase_allowance = Math.round(value * 0.2);
      }
      return updated;
    });
  };

  const handlePackagingChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      packaging_specs: { ...prev.packaging_specs, [field]: value }
    }));
  };

  const addIngredient = () => {
    setFormData(prev => ({
      ...prev,
      ingredients: [...prev.ingredients, { item_id: '', item_name: '', quantity: 0 }]
    }));
  };

  const removeIngredient = (index) => {
    setFormData(prev => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== index)
    }));
  };

  const updateIngredient = (index, field, value) => {
    setFormData(prev => {
      const ingredients = [...prev.ingredients];
      ingredients[index] = { ...ingredients[index], [field]: value };
      if (field === 'item_id') {
        const selectedItem = dummyItems.find(i => i.id === value);
        if (selectedItem) {
          ingredients[index].item_name = selectedItem.name;
        }
      }
      return { ...prev, ingredients };
    });
  };

  const handleSubmit = () => {
    onSave(formData);
    onClose();
  };

  const ingredientOptions = dummyItems.filter(i => i.category === 'ingredient');

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {item ? 'Edit Item' : 'Create New Item'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sku">SKU Code</Label>
              <Input
                id="sku"
                value={formData.sku_code}
                onChange={(e) => handleChange('sku_code', e.target.value)}
                placeholder="e.g., ING-SUG-001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Item Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="e.g., Sugar"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={formData.category} onValueChange={(v) => handleChange('category', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ingredient">Ingredient</SelectItem>
                  <SelectItem value="product">Product</SelectItem>
                  <SelectItem value="packaging">Packaging</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Unit of Measure</Label>
              <Select value={formData.unit_of_measure} onValueChange={(v) => handleChange('unit_of_measure', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">Kilograms (kg)</SelectItem>
                  <SelectItem value="g">Grams (g)</SelectItem>
                  <SelectItem value="units">Units</SelectItem>
                  <SelectItem value="liters">Liters</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Item description..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cost">Cost per Unit ($)</Label>
              <Input
                id="cost"
                type="number"
                step="0.01"
                value={formData.cost_per_unit}
                onChange={(e) => handleChange('cost_per_unit', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="capacity">Max Capacity</Label>
              <Input
                id="capacity"
                type="number"
                value={formData.max_capacity}
                onChange={(e) => handleChange('max_capacity', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stock">Current Stock</Label>
              <Input
                id="stock"
                type="number"
                value={formData.current_stock}
                onChange={(e) => handleChange('current_stock', parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Auto-calculated fields */}
          <div className="grid grid-cols-2 gap-4 bg-slate-50 rounded-lg p-4">
            <div>
              <p className="text-sm text-slate-500">Min Threshold (40% of capacity)</p>
              <p className="font-semibold text-slate-900">{formData.min_threshold || Math.round(formData.max_capacity * 0.4)} {formData.unit_of_measure}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Purchase Allowance (20% of capacity)</p>
              <p className="font-semibold text-slate-900">{formData.purchase_allowance || Math.round(formData.max_capacity * 0.2)} {formData.unit_of_measure}</p>
            </div>
          </div>

          {/* FIFO Tracking Option */}
          {(formData.category === 'ingredient' || formData.category === 'packaging') && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Package className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="fifo-toggle" className="font-semibold text-slate-900 cursor-pointer">
                        Enable FIFO Batch Tracking
                      </Label>
                    </div>
                    <p className="text-sm text-slate-600">
                      Track inventory in batches with automatic First-In-First-Out consumption. 
                      Ideal for items with expiry dates or varying costs per purchase.
                    </p>
                  </div>
                </div>
                <Switch
                  id="fifo-toggle"
                  checked={formData.fifo_enabled || false}
                  onCheckedChange={(checked) => handleChange('fifo_enabled', checked)}
                />
              </div>
            </div>
          )}

          {/* Product Ingredients */}
          {formData.category === 'product' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Ingredients (Product Matrix)</Label>
                <Button variant="outline" size="sm" onClick={addIngredient}>
                  <Plus className="w-4 h-4 mr-1" /> Add Ingredient
                </Button>
              </div>
              {formData.ingredients.map((ing, idx) => (
                <div key={idx} className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
                  <Select 
                    value={ing.item_id} 
                    onValueChange={(v) => updateIngredient(idx, 'item_id', v)}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select ingredient" />
                    </SelectTrigger>
                    <SelectContent>
                      {ingredientOptions.map(item => (
                        <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    step="0.001"
                    className="w-32"
                    placeholder="Qty"
                    value={ing.quantity}
                    onChange={(e) => updateIngredient(idx, 'quantity', parseFloat(e.target.value) || 0)}
                  />
                  <span className="text-sm text-slate-500">kg</span>
                  <Button variant="ghost" size="icon" onClick={() => removeIngredient(idx)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Packaging Specs */}
          {formData.category === 'packaging' && (
            <div className="space-y-4">
              <Label>Packaging Specifications</Label>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="height">Height</Label>
                  <Input
                    id="height"
                    value={formData.packaging_specs.height}
                    onChange={(e) => handlePackagingChange('height', e.target.value)}
                    placeholder="e.g., 6 inches"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="width">Width</Label>
                  <Input
                    id="width"
                    value={formData.packaging_specs.width}
                    onChange={(e) => handlePackagingChange('width', e.target.value)}
                    placeholder="e.g., 2 inches"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="thickness">Thickness</Label>
                  <Input
                    id="thickness"
                    value={formData.packaging_specs.thickness}
                    onChange={(e) => handlePackagingChange('thickness', e.target.value)}
                    placeholder="e.g., 3mm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="material">Material</Label>
                  <Input
                    id="material"
                    value={formData.packaging_specs.material}
                    onChange={(e) => handlePackagingChange('material', e.target.value)}
                    placeholder="e.g., Borosilicate Glass"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="design">Design</Label>
                  <Input
                    id="design"
                    value={formData.packaging_specs.design}
                    onChange={(e) => handlePackagingChange('design', e.target.value)}
                    placeholder="e.g., Clear with embossed logo"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contents">Contents Description</Label>
                <Textarea
                  id="contents"
                  value={formData.packaging_specs.contents}
                  onChange={(e) => handlePackagingChange('contents', e.target.value)}
                  placeholder="What this packaging can hold..."
                  rows={2}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-8">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} className="bg-teal-600 hover:bg-teal-700">
            {item ? 'Update Item' : 'Create Item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}