import React from 'react';

export default function WorkspaceShell({ title, children, locked, className = 'p-5' }) {
  const isIncomingQueue = title === 'Incoming Online Queue';

  if (isIncomingQueue) {
    return (
      <section className="min-w-0 max-w-full space-y-4">
        <div className="min-w-0 max-w-full rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/80">
          {children}
          {locked && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Terminal is locked. Unlock to run protected operational actions.
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className={`min-w-0 max-w-full rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70 ${className}`}>
      {children}
    </section>
  );
}
