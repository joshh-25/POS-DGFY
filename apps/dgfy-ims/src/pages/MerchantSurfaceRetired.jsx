import React, { useEffect, useMemo } from 'react';
import { ArrowRight, Building2, Loader2 } from 'lucide-react';
import { buildBusinessBackOfficeHandoffUrl } from '../../../../packages/web-core/src/features/pos/utils/businessBackOfficeHandoff.js';

const normalizeTarget = (target) => {
  const value = String(target || '/backoffice/overview').trim();
  return value.startsWith('/') ? value : `/${value}`;
};

export default function MerchantSurfaceRetired({ target = '/backoffice/overview', title = 'Merchant workspace moved' }) {
  const normalizedTarget = normalizeTarget(target);
  const destination = useMemo(() => {
    if (typeof window === 'undefined') return '#';
    const current = new URLSearchParams(window.location.search);
    return buildBusinessBackOfficeHandoffUrl({
      tenantId: current.get('tenant_id') || '',
      handoffToken: current.get('handoff_token') || '',
      next: normalizedTarget
    });
  }, [normalizedTarget]);

  useEffect(() => {
    if (destination === '#') return undefined;
    const timer = window.setTimeout(() => {
      window.location.replace(destination);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [destination]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-[#1A4E8D]">
          <Building2 className="h-7 w-7" />
        </div>
        <p className="mt-5 text-xs font-black uppercase tracking-[0.16em] text-teal-700">DGFY POS Back Office</p>
        <h1 className="mt-2 text-2xl font-black text-slate-950">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          The legacy merchant workspace is retired. Your company tools now live in the POS Back Office,
          with the same tenant-scoped data and permissions.
        </p>
        <a
          href={destination}
          className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#1A4E8D] px-5 text-sm font-bold text-white hover:bg-[#143F73]"
        >
          <ArrowRight className="h-4 w-4" />
          Open POS Back Office
        </a>
        <p className="mt-4 inline-flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Redirecting…
        </p>
      </section>
    </main>
  );
}
