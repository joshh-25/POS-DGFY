import React, { useEffect } from 'react';
import { buildSkupervisorPath } from '../../../../src/features/pos/utils/skupervisorHandoff.js';

export default function SkupervisorSalesRedirect() {
  useEffect(() => {
    const query = typeof window === 'undefined' ? '' : window.location.search;
    window.location.replace(buildSkupervisorPath('/sales', query));
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-[#1A4E8D]">DGFY POS</p>
        <h1 className="mt-2 text-2xl font-black text-slate-950">Opening SKUpervisor</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sales reports are handled in the SKUpervisor app context.
        </p>
      </section>
    </main>
  );
}
