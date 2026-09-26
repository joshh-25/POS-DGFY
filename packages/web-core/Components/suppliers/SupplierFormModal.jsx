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
import { Loader2, Plus, Trash2, X } from 'lucide-react';
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
  const [submitting, setSubmitting] = useState(false);
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
    if (submitting) return;
    if (isDirty && !supplier) {
      setShowConfirmation(true);
    } else {
      onClose();
    }
  };

  const handleSaveDraft = async () => {
    if (submitting || typeof onSaveDraft !== 'function') return false;

    const draftData = {
      ...formData,
      status: 'draft'
    };

    setSubmitting(true);
    try {
      const result = await onSaveDraft(draftData);
      if (result === false) return false;
      setIsDirty(false);
      onClose();
      return true;
    } catch {
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinalize = () => {
    return handleSubmit(false);
  };

  const handleSubmit = async (isDraft = false) => {
    if (submitting) return false;

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

    const save = isDraft && onSaveDraft ? onSaveDraft : onSave;
    if (typeof save !== 'function') return false;

    setSubmitting(true);
    try {
      const result = await save(dataToSave);
      if (result === false) return false;
      setIsDirty(false);
      onClose();
      return true;
    } catch {
      return false;
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-3xl max-h-[92vh] flex flex-col overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
          <DialogHeader className="shrink-0 space-y-0 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-600">Supplier management</p>
                <DialogTitle className="mt-1 flex min-w-0 items-center gap-2 text-xl text-slate-950 sm:text-2xl">
                  <span className="truncate">{supplier ? 'Edit Supplier' : 'Add New Supplier'}</span>
                  {isEditingDraft && (
                    <Badge variant="outline" className="shrink-0 border-slate-200 bg-slate-100 text-xs text-slate-700">
                      Draft
                    </Badge>
                  )}
                </DialogTitle>
                <p className="mt-1 text-sm text-slate-500">
                  {supplier ? 'Update supplier details and terms.' : 'Add a supplier to your catalog.'}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={handleClose}
                disabled={submitting}
                aria-label="Close supplier form"
                title="Close"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6" aria-busy={submitting}>
            <div className="space-y-8">
              {/* Supplier details */}
              <section className="space-y-4" aria-labelledby="supplier-details-heading">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-700">01</span>
                  <h3 id="supplier-details-heading" className="text-base font-semibold text-slate-900">Supplier details</h3>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="name" className="text-sm font-medium text-slate-700">Supplier name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => handleChange('name', e.target.value)}
                      placeholder="e.g., Premium Foods Co."
                      disabled={submitting}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status" className="text-sm font-medium text-slate-700">Status</Label>
                    <Select
                      value={formData.status || 'active'}
                      onValueChange={(v) => handleChange('status', v)}
                      disabled={submitting || (!supplier && !isEditingDraft)}
                    >
                      <SelectTrigger id="status" className={cn(
                        "h-11 w-full",
                        formData.status === 'inactive' ? "bg-slate-50 text-slate-500" : "bg-teal-50/50 text-teal-700"
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
              </section>

              {/* Contact and delivery */}
              <section className="space-y-4" aria-labelledby="supplier-contact-heading">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">02</span>
                  <h3 id="supplier-contact-heading" className="text-base font-semibold text-slate-900">Contact and delivery</h3>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="contact" className="text-sm font-medium text-slate-700">Contact person</Label>
                    <Input
                      id="contact"
                      value={formData.contact_person}
                      onChange={(e) => handleChange('contact_person', e.target.value)}
                      placeholder="e.g., John Smith"
                      disabled={submitting}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium text-slate-700">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                      placeholder="email@company.com"
                      disabled={submitting}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-medium text-slate-700">Phone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => handleChange('phone', e.target.value)}
                      placeholder="+1 555-0100"
                      disabled={submitting}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-3">
                    <Label htmlFor="address" className="text-sm font-medium text-slate-700">Address</Label>
                    <Textarea
                      id="address"
                      value={formData.address}
                      onChange={(e) => handleChange('address', e.target.value)}
                      placeholder="Full address..."
                      rows={2}
                      disabled={submitting}
                      className="min-h-24 resize-y"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-3">
                    <Label htmlFor="notes" className="text-sm font-medium text-slate-700">Notes <span className="font-normal text-slate-400">(optional)</span></Label>
                    <Textarea
                      id="notes"
                      value={formData.notes || ''}
                      onChange={(e) => handleChange('notes', e.target.value)}
                      placeholder="Internal notes about this supplier..."
                      rows={2}
                      disabled={submitting}
                      className="min-h-24 resize-y"
                    />
                  </div>
                </div>
              </section>

              {/* Performance */}
              <section className="space-y-4" aria-labelledby="supplier-performance-heading">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">03</span>
                  <h3 id="supplier-performance-heading" className="text-base font-semibold text-slate-900">Performance</h3>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="quality_rating" className="text-sm font-medium text-slate-700">Quality rating <span className="font-normal text-slate-400">(0–5)</span></Label>
                    <Input
                      id="quality_rating"
                      type="number"
                      min="0"
                      max="5"
                      step="0.1"
                      value={formData.quality_rating}
                      onChange={(e) => handleChange('quality_rating', e.target.value)}
                      placeholder="5.0"
                      disabled={submitting}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="avg_delivery_days" className="text-sm font-medium text-slate-700">Average delivery days</Label>
                    <Input
                      id="avg_delivery_days"
                      type="number"
                      min="0"
                      value={formData.avg_delivery_days}
                      onChange={(e) => handleChange('avg_delivery_days', e.target.value)}
                      placeholder="5"
                      disabled={submitting}
                      className="h-11"
                    />
                  </div>
                </div>
              </section>

              {/* Items supplied */}
              <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5" aria-labelledby="supplier-items-heading">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 id="supplier-items-heading" className="text-base font-semibold text-slate-900">Items supplied</h3>
                    <p className="mt-1 text-sm text-slate-500">Set item-specific pricing and minimum order quantities.</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addItem} disabled={submitting} className="w-full bg-white sm:w-auto">
                    <Plus className="mr-1 h-4 w-4" /> Add item
                  </Button>
                </div>
                {formData.items_supplied.length === 0 ? (
                  <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-center">
                    <p className="text-sm font-medium text-slate-600">No items assigned yet</p>
                    <p className="mt-1 text-xs text-slate-400">Add the products this supplier provides.</p>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {formData.items_supplied.map((item, idx) => (
                      <div key={idx} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                          <div className="min-w-0 space-y-2">
                            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Item to supply</Label>
                            <Select
                              value={item.item_id}
                              onValueChange={(v) => updateItem(idx, 'item_id', v)}
                              disabled={submitting}
                            >
                              <SelectTrigger className="h-11 w-full bg-white">
                                <SelectValue placeholder="Select an item..." />
                              </SelectTrigger>
                              <SelectContent className="max-h-64 min-w-[300px] overflow-y-auto">
                                <div className="sticky top-0 z-10 mb-1 border-b border-slate-100 bg-white p-2">
                                  <Input
                                    placeholder="Search items by name or SKU..."
                                    value={activeItemIndex === idx ? itemSearch : ''}
                                    onChange={(e) => {
                                      setItemSearch(e.target.value);
                                      setActiveItemIndex(idx);
                                    }}
                                    className="h-8 text-xs"
                                    onClick={(e) => e.stopPropagation()}
                                    disabled={submitting}
                                  />
                                </div>
                                {loadingItems ? (
                                  <SelectItem disabled value="loading">Loading items...</SelectItem>
                                ) : filteredItems.length === 0 ? (
                                  <div className="p-4 text-center text-sm text-slate-500">No matching items found</div>
                                ) : filteredItems.map(it => (
                                  <SelectItem key={it.item_id || it.id} value={it.item_id || it.id}>
                                    <div className="flex flex-col py-0.5">
                                      <span className="font-medium">{it.name}</span>
                                      {it.sku && <span className="font-mono text-[10px] text-slate-400">{it.sku}</span>}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            onClick={() => removeItem(idx)}
                            disabled={submitting}
                            className="h-10 w-10 justify-self-start text-slate-400 hover:bg-red-50 hover:text-red-500 sm:justify-self-end"
                            aria-label={`Remove item ${idx + 1}`}
                            title="Remove item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Minimum order quantity</Label>
                            <Input
                              type="number"
                              className="h-11 bg-white"
                              value={item.moq}
                              onChange={(e) => updateItem(idx, 'moq', e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                              placeholder="1"
                              disabled={submitting}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Price per unit</Label>
                            <div className="relative">
                              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₱</span>
                              <Input
                                type="number"
                                step="0.01"
                                className="h-11 bg-white pl-7"
                                value={item.price_per_unit}
                                onChange={(e) => updateItem(idx, 'price_per_unit', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                                placeholder="0.00"
                                disabled={submitting}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Bulk discounts */}
              <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="supplier-discounts-heading">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 id="supplier-discounts-heading" className="text-base font-semibold text-slate-900">Bulk discounts</h3>
                    <p className="mt-1 text-sm text-slate-500">Optional price breaks for larger orders.</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addDiscount} disabled={submitting} className="w-full sm:w-auto">
                    <Plus className="mr-1 h-4 w-4" /> Add tier
                  </Button>
                </div>
                {formData.bulk_discounts.length === 0 ? (
                  <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-5 text-center">
                    <p className="text-sm font-medium text-slate-600">No discount tiers added</p>
                    <p className="mt-1 text-xs text-slate-400">Add a tier when this supplier offers volume pricing.</p>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {formData.bulk_discounts.map((tier, idx) => (
                      <div key={idx} className="grid gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end sm:p-4">
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Minimum quantity</Label>
                          <Input
                            type="number"
                            className="h-11 bg-white"
                            value={tier.min_quantity}
                            onChange={(e) => updateDiscount(idx, 'min_quantity', e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                            disabled={submitting}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Discount</Label>
                          <div className="relative">
                            <Input
                              type="number"
                              step="0.5"
                              className="h-11 bg-white pr-8"
                              value={tier.discount_percent}
                              onChange={(e) => updateDiscount(idx, 'discount_percent', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                              disabled={submitting}
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeDiscount(idx)}
                          disabled={submitting}
                          className="h-10 w-10 justify-self-start text-slate-400 hover:bg-red-50 hover:text-red-500 sm:justify-self-end"
                          aria-label={`Remove discount tier ${idx + 1}`}
                          title="Remove discount tier"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>

          <DialogFooter className="shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-end sm:px-6 sm:py-3">
            <Button type="button" variant="outline" onClick={handleClose} disabled={submitting} className="w-full sm:w-auto">Cancel</Button>
            {!supplier && onSaveDraft && (
              <Button type="button" variant="outline" onClick={() => handleSubmit(true)} disabled={submitting} className="w-full sm:w-auto">
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {submitting ? 'Saving…' : 'Save as Draft'}
              </Button>
            )}
            {isEditingDraft ? (
              <Button type="button" onClick={handleFinalize} disabled={submitting} className="w-full bg-teal-600 hover:bg-teal-700 sm:w-auto sm:min-w-[9rem]">
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {submitting ? 'Saving…' : 'Finalize Supplier'}
              </Button>
            ) : (
              <Button type="button" onClick={() => handleSubmit(false)} disabled={submitting} className="w-full bg-teal-600 hover:bg-teal-700 sm:w-auto sm:min-w-[9rem]">
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {submitting ? 'Saving…' : (supplier ? 'Update Supplier' : 'Add Supplier')}
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
