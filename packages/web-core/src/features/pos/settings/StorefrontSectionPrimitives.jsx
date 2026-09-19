import React from 'react';
import StorefrontSectionInfo from './StorefrontSectionInfo.jsx';

// Storefront settings use a small, explicit type scale so summary cards,
// editors, and list rows remain readable and comparable across viewports.
// Mobile inputs intentionally keep their own 16px rule to prevent browser
// zoom while editing; these roles describe surrounding interface text.
export const STOREFRONT_TYPOGRAPHY = Object.freeze({
  pageTitle: 'text-[16px] font-extrabold tracking-tight text-[#0F172A]',
  sectionTitle: 'text-[14px] font-extrabold text-[#0F172A]',
  sectionDescription: 'text-[12px] leading-5 text-[#64748B]',
  itemLabel: 'text-[13px] font-bold text-[#0F172A]',
  fieldLabel: 'text-[12px] font-bold text-[#0F172A]',
  helper: 'text-[11px] leading-4 text-[#64748B]'
});

export function StorefrontSectionHeader({
  title,
  titleId,
  description,
  info,
  infoLabel,
  infoPanelId,
  hasData = false,
  action = null,
  actionNote = null
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 id={titleId} className={STOREFRONT_TYPOGRAPHY.sectionTitle}>{title}</h3>
            {info ? <StorefrontSectionInfo label={infoLabel || title} panelId={infoPanelId}>{info}</StorefrontSectionInfo> : null}
          </div>
          <p className={`mt-0.5 max-w-prose ${STOREFRONT_TYPOGRAPHY.sectionDescription}`}>{description}</p>
        </div>
      </div>
      {hasData ? (
        <div className="flex shrink-0 flex-col items-stretch gap-1 sm:items-end">
          {action}
          {actionNote}
        </div>
      ) : null}
    </div>
  );
}

export function StorefrontEmptyState({
  icon: Icon,
  iconClassName = 'mx-auto grid h-10 w-10 place-items-center rounded-full bg-blue-50 text-[#1A4E8D]',
  title,
  titleClassName = '',
  description,
  action,
  className = ''
}) {
  return (
    <div className={`rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center ${className}`}>
      {Icon ? <span className={iconClassName} aria-hidden="true"><Icon className="h-5 w-5" /></span> : null}
      <h4 className={`${Icon ? 'mt-3 ' : ''}${STOREFRONT_TYPOGRAPHY.itemLabel} ${titleClassName}`}>{title}</h4>
      <p className={`mx-auto mt-1 max-w-xs ${STOREFRONT_TYPOGRAPHY.sectionDescription}`}>{description}</p>
      {action}
    </div>
  );
}
