import { X } from 'lucide-react';

export default function PosAppliedFilterChips({
    activeFilters = [],
    onRemoveFilter,
    onClearAllFilters,
    groupLabel = 'Applied filters',
    clearAllAriaLabel = 'Clear all filters',
    className = 'flex-wrap'
}) {
    if (!Array.isArray(activeFilters) || activeFilters.length === 0) return null;

    return (
        <div
            role="group"
            aria-label={groupLabel}
            aria-live="polite"
            className={`flex min-w-0 items-center gap-2 ${className}`}
        >
            {activeFilters.map((filter) => (
                <button
                    key={filter.key}
                    type="button"
                    title={filter.label}
                    aria-label={`Remove filter: ${filter.label}`}
                    onClick={() => onRemoveFilter?.(filter.key)}
                    className="inline-flex min-h-8 max-w-full items-center gap-2 rounded-lg bg-blue-50 px-2.5 py-1 text-left text-[12px] font-semibold text-[#1A4E8D] transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/35 focus-visible:ring-offset-1"
                >
                    <span className="max-w-[min(65vw,18rem)] truncate">{filter.label}</span>
                    <X aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                </button>
            ))}
            <span aria-hidden="true" className="hidden h-6 w-px bg-slate-200 sm:block" />
            <button
                type="button"
                onClick={onClearAllFilters}
                aria-label={clearAllAriaLabel}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-rose-50 px-2 py-1 text-[12px] font-bold text-rose-600 transition-colors hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30 focus-visible:ring-offset-1"
            >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
                <span>Clear all</span>
            </button>
        </div>
    );
}
