import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { CAPABILITY_MODULES, STORE_TEMPLATE_PRESETS } from '@sieitzz/shared-constants/capabilityModules';
import { fetchRegistrationIndustries } from './registrationIndustryService.js';

// "What you'll get" is generated from the module catalog's own
// description/enforcement metadata (issue #178 Phase 29), never
// hand-written per-industry copy - so it can never drift from what the
// template actually turns on. Locked/planned modules are never shown; a
// merchant only sees what's actually theirs to use.
const resolveWhatYoullGet = (templateKey) => {
  const preset = templateKey ? STORE_TEMPLATE_PRESETS[templateKey] : null;
  if (!preset) return [];
  return [...preset.modules]
    .map((key) => ({ key, module: CAPABILITY_MODULES[key] }))
    .filter(({ module }) => module && module.status === 'shipped' && module.enforcement !== 'locked')
    .map(({ key, module }) => ({ key, label: module.label, description: module.description }))
    .sort((a, b) => a.label.localeCompare(b.label));
};

/**
 * The registration Industry picker (issue #178 "templates become the
 * Operating Mode" follow-up). Replaces the raw "Operating Mode" `<select>`
 * on all three signup surfaces with one component that presents DGFY's own
 * business-niche classification guide, so a merchant chooses what kind of
 * business they run rather than an engineering enum. Selecting an entry
 * derives both `workflow_mode` and the store template server-side - the
 * caller only ever needs `entry.key` (industryKey) for submission.
 *
 * `onSelect` receives the full described entry:
 * `{ key, label, summary, niches, workflow_mode, template_key, engine, engine_note }`.
 */
export default function IndustryPicker({ value, onSelect, disabled = false, idPrefix = 'industry' }) {
  const [industries, setIndustries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchRegistrationIndustries()
      .then((list) => {
        if (!cancelled) setIndustries(list);
      })
      // fetchRegistrationIndustries() already falls back to the local
      // catalog on a rejected request - this catch only guards the
      // pathological case where the call itself throws synchronously
      // (e.g. a misconfigured client), so loading never gets stuck.
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const labelId = `${idPrefix}-label`;

  return (
    <div>
      <p id={labelId} className="text-sm font-medium text-slate-900">What kind of business is this?</p>
      <p className="mt-1 text-xs text-slate-500">
        Pick the closest match — this sets up your DGFY tools. You can refine it later.
      </p>

      <div role="radiogroup" aria-labelledby={labelId} className="mt-2 space-y-2">
        {loading && industries.length === 0 ? (
          <p className="text-xs text-slate-500">Loading industries…</p>
        ) : null}
        {industries.map((entry) => {
          const isSelected = entry.key === value;
          const isExpanded = expandedKey === entry.key;
          const whatYoullGet = resolveWhatYoullGet(entry.template_key);

          return (
            <div
              key={entry.key}
              className={`rounded-xl border p-3 transition-colors ${isSelected ? 'border-[#1f5f9f] bg-[#f7fbfa]' : 'border-slate-200'}`}
            >
              <button
                type="button"
                id={`${idPrefix}-${entry.key}`}
                role="radio"
                aria-checked={isSelected}
                disabled={disabled}
                onClick={() => onSelect(entry)}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <span>
                  <span className="block text-sm font-semibold text-[#132033]">{entry.label}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{entry.summary}</span>
                  {entry.niches?.length > 0 ? (
                    <span className="mt-1 block text-xs text-slate-400">{entry.niches.slice(0, 4).join(', ')}…</span>
                  ) : null}
                </span>
                {entry.engine !== 'native' ? (
                  <Badge variant="outline" className="shrink-0">
                    {entry.engine === 'transitional' ? 'Native today' : 'Listing only'}
                  </Badge>
                ) : null}
              </button>

              {entry.engine === 'transitional' ? (
                <p className="mt-2 text-xs text-slate-500">
                  DGFY runs this fully today{entry.engine_note ? `; the plan is to move it to ${entry.engine_note} down the line` : ''}. Nothing changes for you now.
                </p>
              ) : null}
              {entry.engine === 'external' ? (
                <p className="mt-2 text-xs text-slate-500">
                  DGFY lists and promotes your business today. The full booking/selling engine for this industry is handled by a partner app{entry.engine_note ? ` (${entry.engine_note})` : ''} — we&apos;ll connect you when it&apos;s ready.
                </p>
              ) : null}

              {whatYoullGet.length > 0 ? (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setExpandedKey(isExpanded ? null : entry.key)}
                    className="text-xs font-medium text-[#1f5f9f] hover:underline"
                  >
                    {isExpanded ? "Hide what you'll get" : "What you'll get"}
                  </button>
                  {isExpanded ? (
                    <ul className="mt-1 space-y-1">
                      {whatYoullGet.map((module) => (
                        <li key={module.key} className="text-xs text-slate-500">
                          <span className="font-medium text-slate-700">{module.label}</span> — {module.description}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
