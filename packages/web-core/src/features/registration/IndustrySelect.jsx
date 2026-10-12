import React, { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import DropdownSelect from '../../components/ui/DropdownSelect.jsx';
import { fetchRegistrationIndustries } from './registrationIndustryService.js';
import { resolveWhatYoullGet } from './whatYoullGet.js';

// A single hand-rolled modal, following the terms-modal pattern already
// proven on both signup pages (RegisterCompany.jsx's LegalAcknowledgementBox
// / StorefrontBusinessGrowPage.jsx's near-identical copy): backdrop closes
// on outside mousedown, role="dialog" + aria-modal + aria-labelledby, an
// Escape-key handler, and the close button gets focus on open. Deliberately
// not Components/ui/dialog.jsx, which has none of the above.
function IndustryInfoModal({ open, onClose, titleId, title, entries }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold text-[#132033]">{title}</h2>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Close
          </button>
        </div>
        <div className="mt-4 grid gap-4">
          {entries.map((entry) => {
            const modules = resolveWhatYoullGet(entry.template_key, entry.template_modules);
            return (
              <section key={entry.key} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <h3 className="text-sm font-semibold text-slate-800">{entry.label}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-600">{entry.summary}</p>
                {entry.niches?.length > 0 ? (
                  <p className="mt-1 text-xs text-slate-500">{entry.niches.join(', ')}</p>
                ) : null}
                {modules.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {modules.map((mod) => (
                      <li key={mod.key} className="text-xs text-slate-500">
                        <span className="font-medium text-slate-700">{mod.label}</span> — {mod.description}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * The MERCHANT-facing registration Industry selector (Phase 38 rework of
 * the Phase 33 card-based `IndustryPicker`). Restores the pre-Phase-33
 * dropdown UX merchants were used to - a keyboard-navigable styled
 * listbox of industry names - while keeping the richer catalog content available on demand:
 * an (i) button opens a modal listing every visible industry with full
 * detail, and once an industry is chosen a summary panel appears below the
 * dropdown with its own "What you'll get" modal.
 *
 * Deliberately drops everything `IndustryPicker` shows about engine
 * classification (native/transitional/external badges and notes) - that
 * distinction belongs on admin surfaces (`IndustryPicker`, still used by
 * TenantManager), never in front of a merchant.
 *
 * Same contract as `IndustryPicker`: `onSelect(entry)` receives the whole
 * described entry (`{ key, label, summary, niches, workflow_mode,
 * template_key, engine, engine_note, hidden }`), so callers that only read
 * `entry.key` need no changes.
 *
 * Industries flagged `hidden: true` (Phase 39's admin visibility toggle)
 * are filtered out of both the dropdown and the catalog modal. The local
 * fallback catalog (`REGISTRATION_INDUSTRIES_DESCRIBED`, used when the
 * network call fails) carries no `hidden` field at all, so a fetch failure
 * shows every industry - fail-open, matching the backend's own fail-open
 * behavior when it can't reach the visibility store.
 */
export default function IndustrySelect({ value, onSelect, disabled = false, idPrefix = 'industry' }) {
  const [industries, setIndustries] = useState([]);
  const [industriesLoaded, setIndustriesLoaded] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchRegistrationIndustries()
      .then((list) => {
        if (!cancelled) setIndustries(list);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIndustriesLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleIndustries = industries.filter((entry) => entry.hidden !== true);
  const selectedEntry = visibleIndustries.find((entry) => entry.key === value) || null;
  const labelId = `${idPrefix}-label`;
  const selectId = `${idPrefix}-select`;
  const helpTextId = `${idPrefix}-help`;
  const catalogTitleId = `${idPrefix}-catalog-title`;
  const detailTitleId = `${idPrefix}-detail-title`;
  const industryOptions = visibleIndustries.length > 0
    ? visibleIndustries.map((entry) => ({ value: entry.key, label: entry.label }))
    : [{
      value: '__industry_options_unavailable__',
      label: industriesLoaded ? 'No industries available' : 'Loading industries…',
      disabled: true
    }];

  return (
    <div>
      <label htmlFor={selectId} id={labelId} className="text-sm font-semibold text-slate-900">Business industry</label>
      <p id={helpTextId} className="mt-1 text-xs text-slate-500">
        Choose the closest match to configure your DGFY tools.
      </p>

      <div className="mt-2 flex items-center gap-2">
        <DropdownSelect
          id={selectId}
          value={value || ''}
          options={industryOptions}
          disabled={disabled}
          onChange={(nextKey) => {
            const entry = visibleIndustries.find((candidate) => candidate.key === nextKey);
            if (entry) onSelect(entry);
          }}
          ariaDescribedBy={helpTextId}
          listboxLabel="Business industry options"
          placeholder="Select an industry…"
          placeholderClassName="font-normal"
          required
          className="min-w-0 flex-1"
        />
        <button
          type="button"
          aria-label="About business industries"
          aria-haspopup="dialog"
          onClick={() => setCatalogOpen(true)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
        >
          <Info className="h-4 w-4" />
        </button>
      </div>

      {selectedEntry ? (
        <div className="mt-3 rounded-xl border border-[#1f5f9f] bg-[#f7fbfa] p-3">
          <span className="block text-sm font-semibold text-[#132033]">{selectedEntry.label}</span>
          <span className="mt-0.5 block text-xs text-slate-500">{selectedEntry.summary}</span>
          {selectedEntry.niches?.length > 0 ? (
            <span className="mt-1 block text-xs text-slate-400">{selectedEntry.niches.slice(0, 4).join(', ')}…</span>
          ) : null}
          {resolveWhatYoullGet(selectedEntry.template_key, selectedEntry.template_modules).length > 0 ? (
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setDetailOpen(true)}
              className="mt-2 text-xs font-medium text-[#1f5f9f] hover:underline"
            >
              What you&apos;ll get
            </button>
          ) : null}
        </div>
      ) : null}

      <IndustryInfoModal
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        titleId={catalogTitleId}
        title="Business industries on DGFY"
        entries={visibleIndustries}
      />
      {selectedEntry ? (
        <IndustryInfoModal
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          titleId={detailTitleId}
          title={selectedEntry.label}
          entries={[selectedEntry]}
        />
      ) : null}
    </div>
  );
}
