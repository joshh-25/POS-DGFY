import React from 'react';
import { Link } from 'react-router-dom';

export default function DgfyLegalAcknowledgementBox({
  id,
  checked,
  onChange,
  disabled,
  disabledReason,
  label,
  documents,
  snapshotText,
  versionLabel,
  documentLinkState = null
}) {

  return (
    <div className="rounded-2xl border border-[#d8e8e3] bg-[#f7fbfa] p-4 text-sm text-slate-700">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <label htmlFor={id} className="flex gap-3 leading-6">
          <input
            id={id}
            type="checkbox"
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            className="mt-1 h-5 w-5 shrink-0 accent-[#1A4E8D]"
            required
          />
          <span>{label}</span>
        </label>
        {documents?.[0]?.href ? (
          <Link
            to={documents[0].href}
            state={documentLinkState}
            className="self-start rounded-lg border border-[#1A4E8D] px-3 py-1.5 text-xs font-bold text-[#1A4E8D] hover:bg-[#e8f4ff] whitespace-nowrap"
          >
            See Terms & Conditions
          </Link>
        ) : null}
      </div>
      {disabledReason ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{disabledReason}</p> : null}
      {versionLabel ? <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">{versionLabel}</p> : null}
    </div>
  );
}
