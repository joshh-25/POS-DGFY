import React from 'react';
import { Check, ChevronDown, Type } from 'lucide-react';
import {
    DEFAULT_POS_TEXT_SIZE,
    normalizePosTextSize,
    POS_TEXT_SIZE_OPTIONS
} from '../utils/posTextSizePreference.js';

const POS_TEXT_SIZE_LABELS = Object.freeze({
    normal: 'Normal (100%)',
    large: 'Large (115%)',
    'extra-large': 'Extra large (130%)'
});
export default function PosTextSizeControl({
    id = 'pos-text-size-control',
    value = DEFAULT_POS_TEXT_SIZE,
    onChange = () => {},
    className = '',
    desktopLabeled = false
}) {
    const normalizedValue = normalizePosTextSize(value);
    const [open, setOpen] = React.useState(false);
    const triggerRef = React.useRef(null);
    const menuRef = React.useRef(null);
    const selectedLabel = POS_TEXT_SIZE_LABELS[normalizedValue];

    React.useEffect(() => {
        if (!open) return undefined;

        const handlePointerDown = (event) => {
            if (triggerRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
            setOpen(false);
        };
        const handleKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            setOpen(false);
            triggerRef.current?.focus();
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open]);

    const handleOptionSelect = (nextValue) => {
        onChange(nextValue);
        setOpen(false);
        triggerRef.current?.focus();
    };

    return (
        <div
            className={`relative flex min-w-0 items-center ${className}`}
            data-testid="pos-text-size-control"
        >
            <button
                ref={triggerRef}
                id={id}
                type="button"
                aria-label={`POS text size: ${selectedLabel}`}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={`${id}-menu`}
                title={`Text size: ${selectedLabel}`}
                onClick={() => setOpen((current) => !current)}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border-0 bg-transparent text-[#1A4E8D] shadow-none transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${desktopLabeled ? 'lg:h-10 lg:w-[12.5rem] lg:justify-between lg:gap-2 lg:rounded-xl lg:border lg:border-slate-200 lg:bg-white lg:px-3 lg:text-[#0F172A]' : 'lg:h-10 lg:w-10'}`}
            >
                <Type className="h-5 w-5 shrink-0 text-[#1A4E8D] lg:h-5 lg:w-5" strokeWidth={2.5} aria-hidden="true" />
                <span className={`min-w-0 truncate text-[11px] font-extrabold ${desktopLabeled ? 'hidden lg:inline' : 'hidden'}`}>{selectedLabel}</span>
                <ChevronDown className={`ml-0.5 h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {open && (
                <div
                    ref={menuRef}
                    id={`${id}-menu`}
                    role="listbox"
                    aria-label="POS text size options"
                    className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5"
                >
                    {POS_TEXT_SIZE_OPTIONS.map(({ value: optionValue }) => {
                        const isSelected = optionValue === normalizedValue;
                        return (
                            <button
                                key={optionValue}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => handleOptionSelect(optionValue)}
                                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-extrabold transition-colors ${isSelected
                                    ? 'bg-blue-50 text-[#1A4E8D]'
                                    : 'text-[#0F172A] hover:bg-slate-50 hover:text-[#1A4E8D]'}`}
                            >
                                <span>{POS_TEXT_SIZE_LABELS[optionValue]}</span>
                                {isSelected ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
