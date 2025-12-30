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
import { Plus, Trash2 } from 'lucide-react';
import { dummyItems } from '@/components/data/dummyData';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import { Badge } from "@/components/ui/badge";

export default function SupplierFormModal({ supplier, open, onClose, onSave, onSaveDraft }) {
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
      const initialData = {
        name: '',
        contact_person: '',
        email: '',
        phone: '',
        address: '',
        items_supplied: [],
        bulk_discounts: [],
        quality_rating: 5.0,
        avg_delivery_days: 5
      };
      setFormData(initialData);
      setInitialFormData(initialData);
      setIsDirty(false);
    }
  }, [supplier, open]);

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
      items[index] = { ...items[index], [field]: value };
      if (field === 'item_id') {
        const selectedItem = dummyItems.find(i => i.id === value);
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
      discounts[index] = { ...discounts[index], [field]: value };
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
    const dataToSave = {
      ...formData,
      status: isDraft ? 'draft' : (supplier?.status || 'active')
    };

    if (isDraft && onSaveDraft) {
      onSaveDraft(dataToSave);
    } else {
      onSave(dataToSave);
    }
    setIsDirty(false);
    onClose();
  };

  const availableItems = dummyItems.filter(i => i.category !== 'product');

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
          <div className="grid grid-cols-2 gap-4">
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
              <Label htmlFor="contact">Contact Person</Label>
              <Input
                id="contact"
                value={formData.contact_person}
                onChange={(e) => handleChange('contact_person', e.target.value)}
                placeholder="e.g., John Smith"
              />
            </div>
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

          {/* Items Supplied */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Items Supplied</Label>
              <Button variant="outline" size="sm" onClick={addItem}>
                <Plus className="w-4 h-4 mr-1" /> Add Item
              </Button>
            </div>
            {formData.items_supplied.map((item, idx) => (
              <div key={idx} className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
                <Select 
                  value={item.item_id} 
                  onValueChange={(v) => updateItem(idx, 'item_id', v)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select item" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableItems.map(it => (
                      <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-slate-500">MOQ:</Label>
                  <Input
                    type="number"
                    className="w-20"
                    value={item.moq}
                    onChange={(e) => updateItem(idx, 'moq', e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-slate-500">Price:</Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="w-24"
                    value={item.price_per_unit}
                    onChange={(e) => updateItem(idx, 'price_per_unit', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                  />
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
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