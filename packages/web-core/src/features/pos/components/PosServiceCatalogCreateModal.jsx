import React, { useEffect, useState } from 'react';
import { CalendarPlus, X } from 'lucide-react';
import ServiceCatalogForm from '../../services/components/ServiceCatalogForm.jsx';
import {
  buildServiceCatalogPayload,
  createServiceCatalogFormValues
} from '../../services/catalog/serviceCatalogFormModel.js';
import { createServiceCatalogEntry } from '../../services/api/servicesApi.js';
import { posToast as toast } from '../../../utils/iminRuntimeFeedback.js';
import { acquireModalScrollLock } from '@/components/ui/dialog';

export default function PosServiceCatalogCreateModal({
  open,
  isOnline = true,
  onClose = () => {},
  onCreated = async () => {}
}) {
  const [values, setValues] = useState(createServiceCatalogFormValues);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setValues(createServiceCatalogFormValues());
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    return acquireModalScrollLock();
  }, [open]);

  if (!open) return null;

  const closeModal = () => {
    if (!saving) onClose();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!isOnline) {
      toast.error('Service catalog maintenance is available online only.');
      return;
    }

    setSaving(true);
    try {
      const createdService = await createServiceCatalogEntry(buildServiceCatalogPayload(values));
      await onCreated(createdService);
      toast.success(`${values.name.trim()} was added to the service catalog.`);
      onClose();
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Unable to create service.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="pos-mobile-no-focus-zoom fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pos-service-create-title"
      onClick={closeModal}
    >
      <div
        className="pos-items-modal-panel pos-items-modal-panel--auto flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 bg-[#0F172A] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-600 text-white">
              <CalendarPlus className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="pos-service-create-title" className="text-base font-extrabold text-white sm:text-lg">Add Service</h2>
              <p className="mt-0.5 text-xs text-slate-300">Create a stock-exempt service for POS and Storefront booking.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeModal}
            disabled={saving}
            aria-label="Close Add Service"
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="pos-items-modal-scroll-region flex-1 p-4 sm:p-6">
          {!isOnline ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-bold">Service creation is available online only.</p>
              <p className="mt-1">Reconnect before creating a service. It will not be added to the offline item-draft queue.</p>
            </div>
          ) : null}
          <ServiceCatalogForm
            values={values}
            onChange={setValues}
            onSubmit={handleSubmit}
            saving={saving}
            disabled={!isOnline}
            title="Service details"
            submitLabel="Create Service"
            idPrefix="pos-service-create"
            className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
          />
        </div>
      </div>
    </div>
  );
}
