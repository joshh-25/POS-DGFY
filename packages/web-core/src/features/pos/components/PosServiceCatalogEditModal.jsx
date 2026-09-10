import React, { useEffect, useState } from 'react';
import { CalendarDays, X } from 'lucide-react';
import ServiceCatalogForm from '../../services/components/ServiceCatalogForm.jsx';
import { buildServiceCatalogPayload, createServiceCatalogFormValues } from '../../services/catalog/serviceCatalogFormModel.js';
import { listServicesCatalog, updateServiceCatalogEntry } from '../../services/api/servicesApi.js';
import { posToast as toast } from '../../../utils/iminRuntimeFeedback.js';
import { acquireModalScrollLock } from '@/components/ui/dialog';

export default function PosServiceCatalogEditModal({
  serviceItem,
  open,
  isOnline = true,
  onClose = () => {},
  onUpdated = async () => {}
}) {
  const [values, setValues] = useState(createServiceCatalogFormValues);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !serviceItem) return undefined;
    return acquireModalScrollLock();
  }, [open, serviceItem]);

  useEffect(() => {
    if (!open || !serviceItem?.item_id) return undefined;
    if (!isOnline) {
      setValues(createServiceCatalogFormValues(serviceItem));
      setLoading(false);
      setError('');
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    listServicesCatalog({ limit: 500 })
      .then((payload) => {
        if (cancelled) return;
        const service = (Array.isArray(payload?.services) ? payload.services : [])
          .find((entry) => Number(entry?.item_id) === Number(serviceItem.item_id));
        if (!service) throw new Error('This service is no longer available in the Services catalog.');
        setValues(createServiceCatalogFormValues(service));
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError?.response?.data?.message || loadError?.message || 'Unable to load service details.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOnline, open, serviceItem]);

  if (!open || !serviceItem) return null;

  const busy = loading || saving;
  const closeModal = () => {
    if (!busy) onClose();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busy || error) return;
    if (!isOnline) {
      toast.error('Service catalog maintenance is available online only.');
      return;
    }

    setSaving(true);
    try {
      const updatedService = await updateServiceCatalogEntry(
        serviceItem.item_id,
        buildServiceCatalogPayload(values, { includeStatus: true })
      );
      await onUpdated(updatedService);
      toast.success(`${values.name.trim()} was updated.`);
      onClose();
    } catch (updateError) {
      toast.error(updateError?.response?.data?.message || updateError?.message || 'Unable to update service.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pos-mobile-no-focus-zoom fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6" role="dialog" aria-modal="true" aria-labelledby="pos-service-edit-title" onClick={closeModal}>
      <div className="pos-items-modal-panel pos-items-modal-panel--auto flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between gap-4 bg-[#0F172A] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-600 text-white"><CalendarDays className="h-5 w-5" aria-hidden="true" /></div>
            <div>
              <h2 id="pos-service-edit-title" className="text-base font-extrabold text-white sm:text-lg">Edit Service</h2>
              <p className="mt-0.5 text-xs text-slate-300">Update service details without product stock or margin rules.</p>
            </div>
          </div>
          <button type="button" onClick={closeModal} disabled={busy} aria-label="Close Edit Service" className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-50"><X className="h-5 w-5" /></button>
        </div>

        <div className="pos-items-modal-scroll-region flex-1 p-4 sm:p-6">
          {!isOnline ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-bold">Service editing is available online only.</p>
              <p className="mt-1">Reconnect to load and save authoritative service details.</p>
            </div>
          ) : null}
          {error ? (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</div>
          ) : loading ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">Loading service details…</div>
          ) : (
            <ServiceCatalogForm
              values={values}
              onChange={setValues}
              onSubmit={handleSubmit}
              saving={saving}
              disabled={!isOnline || Boolean(error)}
              title="Service details"
              submitLabel="Save Service"
              showStatus
              idPrefix="pos-service-edit"
              className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
            />
          )}
        </div>
      </div>
    </div>
  );
}
