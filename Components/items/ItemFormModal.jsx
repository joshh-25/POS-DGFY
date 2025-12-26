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
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ItemFormModal.jsx:46',message:'useEffect triggered',data:{hasItem:!!item,itemId:item?.item_id || item?.id,open},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    if (item && open) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ItemFormModal.jsx:50',message:'Setting form data from item',data:{itemFields:Object.keys(item),itemValues:{sku_code:item.sku_code,name:item.name,cost_per_unit:item.cost_per_unit,max_capacity:item.max_capacity}},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      setFormData({
        sku_code: item.sku_code || '',
        name: item.name || '',
        category: item.category || 'ingredient',
        description: item.description || '',
        unit_of_measure: item.unit_of_measure || 'kg',
        cost_per_unit: item.cost_per_unit ?? 0,
        max_capacity: item.max_capacity ?? 0,
        current_stock: item.current_stock ?? 0,
        min_threshold: item.min_threshold ?? 0,
        purchase_allowance: item.purchase_allowance ?? 0,
        fifo_enabled: item.fifo_enabled || false,
        ingredients: item.ingredients || [],
        packaging_specs: (() => {
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ItemFormModal.jsx:69',message:'Initializing packaging_specs from item',data:{packaging_specs:item.packaging_specs,isArray:Array.isArray(item.packaging_specs),type:typeof item.packaging_specs},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          
          // Ensure packaging_specs is always an object, not an array
          if (!item.packaging_specs) {
            return {
              height: '',
              width: '',
              thickness: '',
              material: '',
              design: '',
              contents: ''
            };
          }
          
          if (Array.isArray(item.packaging_specs)) {
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ItemFormModal.jsx:85',message:'packaging_specs is array, converting to object',data:{original:item.packaging_specs},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            return {
              height: '',
              width: '',
              thickness: '',
              material: '',
              design: '',
              contents: ''
            };
          }
          
          // Return as object with defaults for missing properties
          return {
            height: item.packaging_specs?.height || '',
            width: item.packaging_specs?.width || '',
            thickness: item.packaging_specs?.thickness || '',
            material: item.packaging_specs?.material || '',
            design: item.packaging_specs?.design || '',
            contents: item.packaging_specs?.contents || ''
          };
        })()
      });
    } else if (!item && open) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ItemFormModal.jsx:75',message:'Resetting form data for new item',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      setFormData({
        sku_code: '',
        name: '',
        category: 'ingredient',
        description: '',
        unit_of_measure: 'kg',
        cost_per_unit: 0,
        max_capacity: 0,
        current_stock: 0,
        min_threshold: 0,
        purchase_allowance: 0,
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
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ItemFormModal.jsx:130',message:'handleSubmit called - formData before cleaning',data:{formData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    // Convert empty strings to 0 for number fields, but validate max_capacity is positive
    const cleanedData = {
      ...formData,
      cost_per_unit: formData.cost_per_unit === '' ? 0 : (typeof formData.cost_per_unit === 'string' ? parseFloat(formData.cost_per_unit) || 0 : formData.cost_per_unit),
      max_capacity: formData.max_capacity === '' ? 0 : (typeof formData.max_capacity === 'string' ? parseFloat(formData.max_capacity) || 0 : formData.max_capacity),
      current_stock: formData.current_stock === '' ? 0 : (typeof formData.current_stock === 'string' ? parseFloat(formData.current_stock) || 0 : formData.current_stock),
      ingredients: formData.ingredients.map(ing => ({
        ...ing,
        quantity: ing.quantity === '' ? 0 : (typeof ing.quantity === 'string' ? parseFloat(ing.quantity) || 0 : ing.quantity)
      }))
    };
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ItemFormModal.jsx:144',message:'cleanedData after conversion',data:{cleanedData,max_capacity_type:typeof cleanedData.max_capacity,max_capacity_value:cleanedData.max_capacity},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    // Validate max_capacity is positive before submitting
    if (!cleanedData.max_capacity || cleanedData.max_capacity <= 0) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ItemFormModal.jsx:152',message:'Validation failed - max_capacity must be positive',data:{max_capacity:cleanedData.max_capacity},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      alert('Max Capacity must be a positive number greater than 0');
      return;
    }
    
    // Filter out fields that aren't in the backend schema
    // Only send fields that the backend validator expects
    // Note: current_stock is not in the create schema - backend sets it automatically
    // Convert number fields to proper numbers or null (not empty strings, undefined, or NaN)
    const toNumberOrNull = (value) => {
      if (value === '' || value === undefined || value === null) return null;
      const num = Number(value);
      return isNaN(num) ? null : num;
    };
    
    const validFields = {
      sku_code: cleanedData.sku_code || '',
      name: cleanedData.name || '',
      category: cleanedData.category || 'ingredient',
      description: cleanedData.description || '',
      unit_of_measure: cleanedData.unit_of_measure || 'kg',
      cost_per_unit: toNumberOrNull(cleanedData.cost_per_unit),
      max_capacity: Number(cleanedData.max_capacity), // Already validated to be positive above
      min_threshold: toNumberOrNull(cleanedData.min_threshold),
      purchase_allowance: toNumberOrNull(cleanedData.purchase_allowance),
      fifo_enabled: cleanedData.fifo_enabled || false,
      product_folder: cleanedData.product_folder || null,
      batch_size: toNumberOrNull(cleanedData.batch_size),
      yield_percentage: toNumberOrNull(cleanedData.yield_percentage),
      processing_loss: toNumberOrNull(cleanedData.processing_loss),
      production_notes: cleanedData.production_notes || null,
      ...(cleanedData.category === 'packaging' ? {
        packaging_specs: cleanedData.packaging_specs ? (() => {
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ItemFormModal.jsx:208',message:'Processing packaging_specs',data:{packaging_specs:cleanedData.packaging_specs,isArray:Array.isArray(cleanedData.packaging_specs),type:typeof cleanedData.packaging_specs},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          
          // Ensure packaging_specs is an object, not an array
          if (Array.isArray(cleanedData.packaging_specs)) {
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ItemFormModal.jsx:213',message:'packaging_specs is array, converting to object',data:{original:cleanedData.packaging_specs},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            return {
              height: '',
              width: '',
              thickness: '',
              material: '',
              design: '',
              contents: ''
            };
          }
          
          // Ensure it's a proper object with the expected structure
          // Create a new clean object with only the expected properties (no numeric keys)
          const cleanSpecs = {
            height: cleanedData.packaging_specs?.height || '',
            width: cleanedData.packaging_specs?.width || '',
            thickness: cleanedData.packaging_specs?.thickness || '',
            material: cleanedData.packaging_specs?.material || '',
            design: cleanedData.packaging_specs?.design || '',
            contents: cleanedData.packaging_specs?.contents || ''
          };
          
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ItemFormModal.jsx:270',message:'Final packaging_specs object',data:{cleanSpecs,isArray:Array.isArray(cleanSpecs),keys:Object.keys(cleanSpecs)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          
          return cleanSpecs;
        })() : null
      } : {})
    };
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ItemFormModal.jsx:195',message:'Sending validFields to backend',data:{validFields,fieldTypes:Object.keys(validFields).reduce((acc,key)=>{acc[key]=typeof validFields[key];return acc;},{})},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    onSave(validFields);
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
                value={formData.sku_code || ''}
                onChange={(e) => handleChange('sku_code', e.target.value)}
                placeholder="e.g., ING-SUG-001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Item Name</Label>
              <Input
                id="name"
                value={formData.name || ''}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="e.g., Sugar"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={formData.category || 'ingredient'} onValueChange={(v) => handleChange('category', v)}>
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
              <Select value={formData.unit_of_measure || 'kg'} onValueChange={(v) => handleChange('unit_of_measure', v)}>
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
              value={formData.description || ''}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Item description..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cost">Cost per Unit (₱)</Label>
              <Input
                id="cost"
                type="number"
                step="0.01"
                value={formData.cost_per_unit ?? ''}
                onChange={(e) => handleChange('cost_per_unit', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="capacity">Max Capacity</Label>
              <Input
                id="capacity"
                type="number"
                value={formData.max_capacity ?? ''}
                onChange={(e) => handleChange('max_capacity', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stock">Current Stock</Label>
              <Input
                id="stock"
                type="number"
                value={formData.current_stock ?? ''}
                onChange={(e) => handleChange('current_stock', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
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
                    value={ing.quantity ?? ''}
                    onChange={(e) => updateIngredient(idx, 'quantity', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
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
                    value={formData.packaging_specs?.height || ''}
                    onChange={(e) => handlePackagingChange('height', e.target.value)}
                    placeholder="e.g., 6 inches"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="width">Width</Label>
                  <Input
                    id="width"
                    value={formData.packaging_specs?.width || ''}
                    onChange={(e) => handlePackagingChange('width', e.target.value)}
                    placeholder="e.g., 2 inches"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="thickness">Thickness</Label>
                  <Input
                    id="thickness"
                    value={formData.packaging_specs?.thickness || ''}
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
                    value={formData.packaging_specs?.material || ''}
                    onChange={(e) => handlePackagingChange('material', e.target.value)}
                    placeholder="e.g., Borosilicate Glass"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="design">Design</Label>
                  <Input
                    id="design"
                    value={formData.packaging_specs?.design || ''}
                    onChange={(e) => handlePackagingChange('design', e.target.value)}
                    placeholder="e.g., Clear with embossed logo"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contents">Contents Description</Label>
                <Textarea
                  id="contents"
                  value={formData.packaging_specs?.contents || ''}
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