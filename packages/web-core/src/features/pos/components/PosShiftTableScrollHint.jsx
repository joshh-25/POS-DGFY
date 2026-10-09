import React from 'react';

export default function PosShiftTableScrollHint() {
  return (
    <>
      <p className="px-4 py-2 text-xs text-slate-500 xl:hidden" aria-hidden="true">
        Scroll horizontally to view all columns.
      </p>
      <span className="sr-only">This table can be scrolled horizontally to view all columns.</span>
    </>
  );
}
