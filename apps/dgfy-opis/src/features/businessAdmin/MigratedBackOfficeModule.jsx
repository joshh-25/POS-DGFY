import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { MERCHANT_BACKOFFICE_MODULE_META } from './businessAdminManifest.js';

export { MERCHANT_BACKOFFICE_MODULE_META } from './businessAdminManifest.js';

const ModuleLoading = () => (
  <div className="flex min-h-[280px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
    <Loader2 className="h-4 w-4 animate-spin" /> Loading workspace...
  </div>
);

export default function MigratedBackOfficeModule({ section }) {
  const definition = MERCHANT_BACKOFFICE_MODULE_META[section];
  if (!definition) return null;
  const Module = definition.component;
  const isCatalog = section === 'catalog';
  const isFnb = section === 'fnb';
  const isSales = section === 'sales';
  const isReports = section === 'reports';

  return (
    <section className="business-admin-migrated-module" data-backoffice-module={section}>
      {!isCatalog && !isFnb && !isSales && !isReports ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-teal-700">POS Back Office</p>
            <p className="mt-1 text-xs text-slate-500">Canonical merchant workspace</p>
          </div>
        </div>
      ) : null}
      <Suspense fallback={<ModuleLoading />}>
        {isCatalog ? <Module embedded editorLabel="Item Editor" itemEditorMode /> : isFnb || isSales ? <Module embedded /> : <Module />}
      </Suspense>
    </section>
  );
}
