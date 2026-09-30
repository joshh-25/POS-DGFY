import React from 'react';
import { Delete, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils.js';

export const POS_SEARCH_FIELD_INPUT_CLASS = 'h-10 w-full rounded-lg border border-slate-300 bg-white pl-11 pr-10 text-[13px] text-[#0F172A] shadow-sm placeholder:text-[#64748B] transition focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100';

const PosSearchField = React.forwardRef(function PosSearchField({
    ariaLabel,
    className,
    clearButtonLabel = 'Clear search',
    inputClassName,
    onClear,
    value = '',
    disabled = false,
    ...inputProps
}, ref) {
    const hasValue = String(value ?? '').length > 0;

    return (
        <div className={cn('relative min-w-0', className)}>
            <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#1A4E8D]"
            />
            <Input
                {...inputProps}
                ref={ref}
                type="text"
                role="searchbox"
                value={value}
                disabled={disabled}
                aria-label={ariaLabel}
                className={cn(POS_SEARCH_FIELD_INPUT_CLASS, inputClassName)}
            />
            <button
                type="button"
                aria-label={clearButtonLabel}
                onMouseDown={(event) => event.preventDefault()}
                onClick={onClear}
                disabled={!hasValue || disabled || typeof onClear !== 'function'}
                className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/40 disabled:cursor-default disabled:text-slate-300 disabled:hover:bg-transparent"
            >
                <Delete className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
        </div>
    );
});

PosSearchField.displayName = 'PosSearchField';

export default PosSearchField;
