import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { fetchRegistrationIndustries } from './registrationIndustryService.js';
import { resolveWhatYoullGet } from './whatYoullGet.js';

/**
 * The ADMIN-ONLY registration Industry picker (issue #178 "templates become
 * the Operating Mode" follow-up). As of Phase 38, merchant-facing signup
 * surfaces use `IndustrySelect.jsx` (a dropdown, with this component's
 * detail shown in modals) instead - it drops the engine badges/notes below,
 * which are appropriate for an admin operating the assisted-provisioning
 * panel but not for a merchant. This component's only remaining consumer is
 * `frontend/Pages/admin/TenantManager.jsx`. Selecting an entry derives both
 * `workflow_mode` and the store template server-side - the caller only ever
 * needs `entry.key` (industryKey) for submission.
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
          const whatYoullGet = resolveWhatYoullGet(entry.template_key, entry.template_modules);

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
                <span className="flex shrink-0 items-center gap-1.5">
                  {entry.engine !== 'native' ? (
                    <Badge variant="outline">
                      {entry.engine === 'transitional' ? 'Native today' : 'Listing only'}
                    </Badge>
                  ) : null}
                  {entry.hidden === true ? (
                    <Badge variant="secondary">Hidden from registration</Badge>
                  ) : null}
                </span>
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
