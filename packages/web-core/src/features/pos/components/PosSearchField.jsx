import React from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils.js';

export const POS_SEARCH_FIELD_INPUT_CLASS = 'h-10 pl-9 text-sm placeholder:text-slate-500';

const PosSearchField = React.forwardRef(function PosSearchField({
    ariaLabel,
    className,
    inputClassName,
    ...inputProps
}, ref) {
    return (
        <div className={cn('relative min-w-0', className)}>
            <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            />
            <Input
                {...inputProps}
                ref={ref}
                type="search"
                aria-label={ariaLabel}
                className={cn(POS_SEARCH_FIELD_INPUT_CLASS, inputClassName)}
            />
        </div>
    );
});

PosSearchField.displayName = 'PosSearchField';

export default PosSearchField;
