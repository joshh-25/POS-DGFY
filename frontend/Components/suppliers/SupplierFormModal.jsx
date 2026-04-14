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
import { cn } from "@/lib/utils";
import { Plus, Trash2 } from 'lucide-react';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import { Badge } from "@/components/ui/badge";
import { useItems } from '@/hooks/useItems.js';
import { canBeSupplierItem } from '@/components/utils/categoryHelpers';
import { useWorkflowMode } from '@/src/features/settings/WorkflowModeContext.jsx';

/**
 * SupplierFormModal - Create or edit suppliers
 * @param {object} supplier - Existing supplier data for editing (null for new)
 * @param {boolean} open - Dialog open state
 * @param {function} onClose - Close handler
 * @param {function} onSave - Save handler
 * @param {function} onSaveDraft - Save as draft handler
 * @param {object} preAddedItem - Item to pre-add to items_supplied (for quick supplier creation)
 */
export default function SupplierFormModal({ supplier, open, onClose, onSave, onSaveDraft, preAddedItem }) {
  const [formData, setFormData] = useState({
    name: '',
    contact_person: '',
    email: '',
    phone: '',
    address: '',
    items_supplied: [],
    bulk_discounts: [],
    quality_rating: 5.0,
    avg_delivery_days: 5
  });

  const [itemSearch, setItemSearch] = useState('');
  const [activeItemIndex, setActiveItemIndex] = useState(null);
  const { workflowMode } = useWorkflowMode();

  const { items: allItems, loading: loadingItems } = useItems({ status: 'active', limit: 1000 });
  const availableItems = (allItems || []).filter((item) => canBeSupplierItem(item, workflowMode));

  const filteredItems = (availableItems || []).filter(item =>
    item.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
    (item.sku && item.sku.toLowerCase().includes(itemSearch.toLowerCase()))
  );

  const [initialFormData, setInitialFormData] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const isEditingDraft = supplier?.status === 'draft';

  useEffect(() => {
    if (supplier && open) {
      const initialData = {
        ...supplier,
        items_supplied: supplier.items_supplied || [],
        bulk_discounts: supplier.bulk_discounts || []
      };
      setFormData(initialData);
      setInitialFormData(initialData);
      setIsDirty(false);
    } else if (!supplier && open) {
      // Build pre-added items array if preAddedItem is provided
      const preAddedItems = preAddedItem ? [{
        item_id: preAddedItem.item_id || preAddedItem.id,
        item_name: preAddedItem.name,
        moq: 1,
        price_per_unit: ''
      }] : [];

      const initialData = {
        name: '',
        contact_person: '',
        email: '',
        phone: '',
        address: '',
        items_supplied: preAddedItems,
        bulk_discounts: [],
        quality_rating: 5.0,
        avg_delivery_days: 5
      };
      setFormData(initialData);
      setInitialFormData(initialData);
      setIsDirty(false);
    }
  }, [supplier, open, preAddedItem]);

  // Track dirty state
  useEffect(() => {
    if (initialFormData && !supplier) {
      const hasChanged = JSON.stringify(formData) !== JSON.stringify(initialFormData);
      setIsDirty(hasChanged);
    }
  }, [formData, initialFormData, supplier]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items_supplied: [...prev.items_supplied, { item_id: '', item_name: '', moq: 1, price_per_unit: 0 }]
    }));
  };

  const removeItem = (index) => {
    setFormData(prev => ({
      ...prev,
      items_supplied: prev.items_supplied.filter((_, i) => i !== index)
    }));
  };

  const updateItem = (index, field, value) => {
    setFormData(prev => {
      const items = [...prev.items_supplied];

      let finalValue = value;
      if (field === 'item_id') {
        finalValue = value === '' ? '' : parseInt(value);
      } else if (field === 'moq' || field === 'price_per_unit') {
        finalValue = value === '' ? '' : (field === 'moq' ? parseInt(value) : parseFloat(value));
      }

      items[index] = { ...items[index], [field]: finalValue };

      if (field === 'item_id' && finalValue !== '') {
        const selectedItem = availableItems.find(i => (i.item_id || i.id || i.id) === finalValue);
        if (selectedItem) {
          items[index].item_name = selectedItem.name;
        }
      }
      return { ...prev, items_supplied: items };
    });
  };

  const addDiscount = () => {
    setFormData(prev => ({
      ...prev,
      bulk_discounts: [...prev.bulk_discounts, { min_quantity: 10, discount_percent: 5 }]
    }));
  };

  const removeDiscount = (index) => {
    setFormData(prev => ({
      ...prev,
      bulk_discounts: prev.bulk_discounts.filter((_, i) => i !== index)
    }));
  };

  const updateDiscount = (index, field, value) => {
    setFormData(prev => {
      const discounts = [...prev.bulk_discounts];
      let finalValue = value;
      if (value !== '') {
        finalValue = field === 'min_quantity' ? parseInt(value) : parseFloat(value);
      }
      discounts[index] = { ...discounts[index], [field]: finalValue };
      return { ...prev, bulk_discounts: discounts };
    });
  };

  const handleClose = () => {
    if (isDirty && !supplier) {
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
    handleSubmit(false);
  };

  const handleSubmit = (isDraft = false) => {
    // Clean up data before sending to backend
    const cleanedItems = formData.items_supplied
      .filter(item => item.item_id !== '' && !isNaN(parseInt(item.item_id)))
      .map(item => ({
        item_id: parseInt(item.item_id),
        moq: item.moq === '' ? 0 : parseFloat(item.moq) || 0,
        price_per_unit: item.price_per_unit === '' ? 0 : parseFloat(item.price_per_unit) || 0
      }));

    const cleanedDiscounts = formData.bulk_discounts
      .filter(d => d.min_quantity !== '' && d.discount_percent !== '')
      .map(d => ({
        min_quantity: parseFloat(d.min_quantity) || 0,
        discount_percent: parseFloat(d.discount_percent) || 0
      }));

    // Parse numeric fields
    const parsedRating = parseFloat(formData.quality_rating);
    const parsedDays = parseInt(formData.avg_delivery_days);

    // Strip metadata that backend doesn't want
    const {
      supplier_id,
      id,
      created_at,
      updated_at,
      created_by,
      updated_by,
      last_delivery_date,
      supplierItems,
      bulkDiscounts,
      ...coreData
    } = formData;

    const dataToSave = {
      ...coreData,
      items_supplied: cleanedItems,
      bulk_discounts: cleanedDiscounts,
      quality_rating: isNaN(parsedRating) ? null : parsedRating,
      avg_delivery_days: isNaN(parsedDays) ? null : parsedDays,
      status: isDraft ? 'draft' : (formData.status || 'active')
    };

    if (isDraft && onSaveDraft) {
      onSaveDraft(dataToSave);
    } else {
      onSave(dataToSave);
    }
    setIsDirty(false);
    onClose();
  };


  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {supplier ? 'Edit Supplier' : 'Add New Supplier'}
              {isEditingDraft && (
                <Badge variant="outline" className="bg-slate-100 text-slate-700">
                  Draft
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="space-y-2">
              <Label htmlFor="name">Supplier Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="e.g., Premium Foods Co."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status || 'active'}
                onValueChange={(v) => handleChange('status', v)}
                disabled={!supplier && !isEditingDraft} // Default to active for new, allow change if draft/edit
              >
                <SelectTrigger id="status" className={cn(
                  "w-full",
                  formData.status === 'inactive' ? "text-slate-500 bg-slate-50" : "text-teal-700 bg-teal-50/50"
                )}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  {isEditingDraft && <SelectItem value="draft">Draft</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact">Contact Person</Label>
              <Input
                id="contact"
                value={formData.contact_person}
                onChange={(e) => handleChange('contact_person', e.target.value)}
                placeholder="e.g., John Smith"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="email@company.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="+1 555-0100"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="Full address..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quality_rating">Quality Rating (0-5)</Label>
                <Input
                  id="quality_rating"
                  type="number"
                  min="0"
                  max="5"
                  step="0.1"
                  value={formData.quality_rating}
                  onChange={(e) => handleChange('quality_rating', e.target.value)}
                  placeholder="5.0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="avg_delivery_days">Avg. Delivery Days</Label>
                <Input
                  id="avg_delivery_days"
                  type="number"
                  min="0"
                  value={formData.avg_delivery_days}
                  onChange={(e) => handleChange('avg_delivery_days', e.target.value)}
                  placeholder="5"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes || ''}
                onChange={(e) => handleChange('notes', e.target.value)}
                placeholder="Internal notes about this supplier..."
                rows={2}
              />
            </div>

            {/* Items Supplied */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Items Supplied</Label>
                <Button variant="outline" size="sm" onClick={addItem}>
                  <Plus className="w-4 h-4 mr-1" /> Add Item
                </Button>
              </div>
              {formData.items_supplied.map((item, idx) => (
                <div key={idx} className="flex flex-col gap-3 bg-slate-50 border border-slate-100 rounded-lg p-4 transition-all hover:border-teal-100 hover:shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <Label className="text-xs font-semibold text-slate-500 mb-1.5 block uppercase tracking-wider">Item to Supply</Label>
                      <Select
                        value={item.item_id}
                        onValueChange={(v) => updateItem(idx, 'item_id', v)}
                      >
                        <SelectTrigger className="flex-1 bg-white border-slate-200">
                          <SelectValue placeholder="Select an item..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-64 overflow-y-auto min-w-[300px]">
                          <div className="sticky top-0 bg-white p-2 border-b border-slate-100 mb-1">
                            <Input
                              placeholder="Search items by name or SKU..."
                              value={activeItemIndex === idx ? itemSearch : ''}
                              onChange={(e) => {
                                setItemSearch(e.target.value);
                                setActiveItemIndex(idx);
                              }}
                              className="h-8 text-xs"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          {loadingItems ? (
                            <SelectItem disabled value="loading">Loading items...</SelectItem>
                          ) : filteredItems.length === 0 ? (
                            <div className="p-4 text-center text-sm text-slate-500 italic">No matching items found</div>
                          ) : filteredItems.map(it => (
                            <SelectItem key={it.item_id || it.id} value={it.item_id || it.id}>
                              <div className="flex flex-col py-0.5">
                                <span className="font-medium">{it.name}</span>
                                {it.sku && <span className="text-[10px] text-slate-400 font-mono">{it.sku}</span>}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="mt-6">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(idx)}
                        className="text-slate-400 hover:text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="w-5 h-5" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Minimum Order Qty (MOQ)</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          className="bg-white border-slate-200 pl-3"
                          value={item.moq}
                          onChange={(e) => updateItem(idx, 'moq', e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                          placeholder="1"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Price per Unit</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₱</span>
                        <Input
                          type="number"
                          step="0.01"
                          className="bg-white border-slate-200 pl-7"
                          value={item.price_per_unit}
                          onChange={(e) => updateItem(idx, 'price_per_unit', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Bulk Discounts */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Bulk Discount Tiers</Label>
                <Button variant="outline" size="sm" onClick={addDiscount}>
                  <Plus className="w-4 h-4 mr-1" /> Add Tier
                </Button>
              </div>
              {formData.bulk_discounts.map((tier, idx) => (
                <div key={idx} className="flex items-center gap-3 bg-emerald-50 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-slate-500">Min Qty:</Label>
                    <Input
                      type="number"
                      className="w-24"
                      value={tier.min_quantity}
                      onChange={(e) => updateDiscount(idx, 'min_quantity', e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-slate-500">Discount:</Label>
                    <Input
                      type="number"
                      step="0.5"
                      className="w-20"
                      value={tier.discount_percent}
                      onChange={(e) => updateDiscount(idx, 'discount_percent', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                    />
                    <span className="text-sm text-slate-500">%</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeDiscount(idx)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="pt-8 flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            {!supplier && onSaveDraft && (
              <Button variant="outline" onClick={() => handleSubmit(true)}>
                Save as Draft
              </Button>
            )}
            {isEditingDraft ? (
              <Button onClick={handleFinalize} className="bg-teal-600 hover:bg-teal-700">
                Finalize Supplier
              </Button>
            ) : (
              <Button onClick={() => handleSubmit(false)} className="bg-teal-600 hover:bg-teal-700">
                {supplier ? 'Update Supplier' : 'Add Supplier'}
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
