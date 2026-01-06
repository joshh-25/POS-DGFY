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
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import { Badge } from "@/components/ui/badge";

export default function ItemFormModal({ item, open, onClose, onSave, onSaveDraft }) {
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
    product_folder: '',
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

  const [initialFormData, setInitialFormData] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const isEditingDraft = item?.status === 'draft';

  useEffect(() => {
    if (item && open) {
      const initialData = {
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
          // Parse packaging_specs if it's a string (from database)
          let packagingSpecs = item.packaging_specs;
          if (packagingSpecs && typeof packagingSpecs === 'string') {
            try {
              packagingSpecs = JSON.parse(packagingSpecs);
            } catch (e) {
              console.error('Failed to parse packaging_specs:', e);
              packagingSpecs = null;
            }
          }

          // Ensure packaging_specs is always an object, not an array
          if (!packagingSpecs) {
            return {
              height: '',
              width: '',
              thickness: '',
              material: '',
              design: '',
              contents: ''
            };
          }

          if (Array.isArray(packagingSpecs)) {
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
            height: packagingSpecs?.height || '',
            width: packagingSpecs?.width || '',
            thickness: packagingSpecs?.thickness || '',
            material: packagingSpecs?.material || '',
            design: packagingSpecs?.design || '',
            contents: packagingSpecs?.contents || ''
          };
        })(),
        product_folder: item.product_folder || ''
      };
      setFormData(initialData);
      setInitialFormData(initialData);
      setIsDirty(false);
    } else if (!item && open) {
      const initialData = {
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
        product_folder: '',
        ingredients: [],
        packaging_specs: {
          height: '',
          width: '',
          thickness: '',
          material: '',
          design: '',
          contents: ''
        }
      };
      setFormData(initialData);
      setInitialFormData(initialData);
      setIsDirty(false);
    }
  }, [item, open]);

  // Track dirty state
  useEffect(() => {
    if (initialFormData && !item) {
      const hasChanged = JSON.stringify(formData) !== JSON.stringify(initialFormData);
      setIsDirty(hasChanged);
    }
  }, [formData, initialFormData, item]);

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

  const handleClose = () => {
    if (isDirty && !item) {
      setShowConfirmation(true);
    } else {
      onClose();
    }
  };

  const handleSaveDraft = () => {
    const draftData = {
      ...formData,
      status: 'draft'
    };
    if (onSaveDraft) {
      onSaveDraft(draftData);
    }
    setIsDirty(false);
    onClose();
  };

  const handleFinalize = () => {
    // For editing drafts, finalize means saving with full validation
    handleSubmit(false);
  };

  const handleSubmit = (isDraft = false) => {
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

    // Validate max_capacity is positive before submitting (skip validation for drafts)
    if (!isDraft && (!cleanedData.max_capacity || cleanedData.max_capacity <= 0)) {
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
      max_capacity: Number(cleanedData.max_capacity) || null, // Allow null for drafts
      min_threshold: toNumberOrNull(cleanedData.min_threshold),
      purchase_allowance: toNumberOrNull(cleanedData.purchase_allowance),
      fifo_enabled: cleanedData.fifo_enabled || false,
      product_folder: cleanedData.product_folder || null,
      batch_size: toNumberOrNull(cleanedData.batch_size),
      yield_percentage: toNumberOrNull(cleanedData.yield_percentage),
      processing_loss: toNumberOrNull(cleanedData.processing_loss),
      production_notes: cleanedData.production_notes || null,
      status: isDraft ? 'draft' : (item?.status || 'active'),
      ...(cleanedData.category === 'packaging' ? {
        packaging_specs: cleanedData.packaging_specs ? (() => {

          // Ensure packaging_specs is an object, not an array
          if (Array.isArray(cleanedData.packaging_specs)) {
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

          return cleanSpecs;
        })() : null
      } : {})
    };

    if (isDraft && onSaveDraft) {
      onSaveDraft(validFields);
    } else {
      onSave(validFields);
    }
    setIsDirty(false);
    onClose();
  };

  const ingredientOptions = dummyItems.filter(i => i.category === 'ingredient');

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {item ? 'Edit Item' : 'Create New Item'}
              {isEditingDraft && (
                <Badge variant="outline" className="bg-slate-100 text-slate-700">
                  Draft
                </Badge>
              )}
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

          <DialogFooter className="pt-8 flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            {!item && onSaveDraft && (
              <Button variant="outline" onClick={() => handleSubmit(true)}>
                Save as Draft
              </Button>
            )}
            {isEditingDraft ? (
              <Button onClick={handleFinalize} className="bg-teal-600 hover:bg-teal-700">
                Finalize Item
              </Button>
            ) : (
              <Button onClick={() => handleSubmit(false)} className="bg-teal-600 hover:bg-teal-700">
                {item ? 'Update Item' : 'Create Item'}
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