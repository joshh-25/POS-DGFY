import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, RefreshCcw, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ServiceOptionGroupManager from '@/src/features/services/components/ServiceOptionGroupManager.jsx';
import { fetchPosCatalog } from '../services/posService.js';
import { isServiceCatalogItem } from '../utils/posCatalogAvailability.js';

const serviceSort = (left, right) => String(left?.name || '').localeCompare(String(right?.name || ''));

export default function PosServiceOptionsWorkspace({
  isOnline = true,
  sectionId = 'pos-service-options',
  canManageServiceOptions = false
}) {
  const [services, setServices] = useState([]);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadServices = useCallback(async () => {
    if (!isOnline || !canManageServiceOptions) return;
    setLoading(true);
    setError('');
    try {
      const catalog = await fetchPosCatalog({ limit: 500 });
      const serviceItems = (Array.isArray(catalog) ? catalog : [])
        .filter((item) => isServiceCatalogItem(item))
        .sort(serviceSort);
      setServices(serviceItems);
      setSelectedServiceId((current) => (
        serviceItems.some((item) => String(item.item_id) === String(current))
          ? current
          : String(serviceItems[0]?.item_id || '')
      ));
    } catch (loadError) {
      setServices([]);
      setSelectedServiceId('');
      setError(loadError?.response?.data?.message || 'Unable to load POS services.');
    } finally {
      setLoading(false);
    }
  }, [canManageServiceOptions, isOnline]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  const selectedService = useMemo(
    () => services.find((item) => String(item.item_id) === String(selectedServiceId)) || null,
    [selectedServiceId, services]
  );

  if (!canManageServiceOptions) {
    return null;
  }

  if (!isOnline) {
    return (
      <div id={sectionId} className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <p className="font-black">Service add-on management is available online only.</p>
        <p className="mt-1">Reconnect to manage reusable options and assign them to POS services.</p>
      </div>
    );
  }

  return (
    <div id={sectionId} className="space-y-4">
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-emerald-50/60 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-100 text-[#1A4E8D]">
              <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-[#0F172A]">Service add-ons</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                Create reusable variations and add-ons, then assign them to a service sold from this POS.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={loadServices}
            disabled={loading}
            className="shrink-0 rounded-xl"
          >
            <RefreshCcw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh services
          </Button>
        </div>

        <div className="mt-5 max-w-xl space-y-2">
          <label htmlFor="pos-service-options-service" className="text-xs font-black uppercase tracking-wide text-slate-600">
            Service to configure
          </label>
          {loading ? (
            <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-500">
              Loading POS services…
            </div>
          ) : services.length > 0 ? (
            <select
              id="pos-service-options-service"
              value={selectedServiceId}
              onChange={(event) => setSelectedServiceId(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0F172A] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              {services.map((service) => (
                <option key={service.item_id} value={service.item_id}>{service.name}</option>
              ))}
            </select>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-4 text-sm text-slate-600">
              No POS-visible service items found. Create or enable a service first.
            </div>
          )}
          <p className="text-xs leading-5 text-slate-500">
            Assignments are saved to the selected service and are immediately available when that service is added to a POS sale.
          </p>
        </div>
      </div>

      {error ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {error}
        </div>
      ) : null}

      {selectedService ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <ServiceOptionGroupManager selectedItem={selectedService} />
        </div>
      ) : !loading && services.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
          <Layers className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
          <p className="mt-2 font-semibold">Select a service to manage its add-ons.</p>
        </div>
      ) : null}
    </div>
  );
}
