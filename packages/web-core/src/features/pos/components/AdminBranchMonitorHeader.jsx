import React from 'react';

export default function AdminBranchMonitorHeader({
  headingId,
  title,
  subtitle,
  subtitleClassName = 'mt-1 text-xs leading-4 text-slate-600',
  subtitleAriaLive,
  subtitleAriaAtomic,
  action
}) {
  return (
    <div
      data-testid="pos-admin-branch-monitor-header"
      className="flex min-w-0 items-center justify-between gap-3 border-b border-slate-100 pb-3"
    >
      <div className="min-w-0 flex-1">
        <h2 id={headingId} className="text-xl font-black tracking-tight text-[#0B1647] sm:text-2xl">
          {title}
        </h2>
        {subtitle ? (
          <p
            className={subtitleClassName}
            aria-live={subtitleAriaLive}
            aria-atomic={subtitleAriaAtomic}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
