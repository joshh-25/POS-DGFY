import { cn } from '@/lib/utils.js';

export const POS_TABLE_SURFACE_CLASS = 'min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50';
export const POS_TABLE_HEADER_STANDARD_CLASS = 'pos-table-header--standard';
export const POS_TABLE_HEADER_CLASS = `${POS_TABLE_HEADER_STANDARD_CLASS} border-b border-slate-200 bg-white text-[#0F172A]`;
export const POS_TABLE_HEADER_CELL_CLASS = 'px-2.5 text-left text-[13px] font-black';
export const POS_TABLE_ROW_CLASS = 'border-b border-slate-100 text-slate-700 transition-colors hover:bg-slate-50/70';
export const POS_TABLE_CELL_CLASS = 'px-2.5 py-4 text-[#334155]';

export default function PosTableSurface({ children, className = '', ...props }) {
  return (
    <div className={cn(POS_TABLE_SURFACE_CLASS, className)} {...props}>
      {children}
    </div>
  );
}
