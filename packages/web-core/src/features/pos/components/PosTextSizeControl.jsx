import React from 'react';
import { Type } from 'lucide-react';
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
    className = ''
}) {
    const normalizedValue = normalizePosTextSize(value);

    return (
        <div
            className={`flex min-w-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white/90 px-2 py-1 shadow-sm ${className}`}
            data-testid="pos-text-size-control"
        >
            <Type className="h-4 w-4 shrink-0 text-[#1A4E8D]" aria-hidden="true" />
            <label htmlFor={id} className="sr-only">POS text size</label>
            <select
                id={id}
                aria-label="POS text size"
                title="Adjust POS text size"
                value={normalizedValue}
                onChange={(event) => onChange(event.target.value)}
                className="h-7 min-w-0 max-w-[9rem] truncate border-0 bg-transparent px-0 text-xs font-extrabold text-[#0F172A] outline-none focus:ring-0"
            >
                {POS_TEXT_SIZE_OPTIONS.map(({ value: optionValue }) => (
                    <option key={optionValue} value={optionValue}>
                        {POS_TEXT_SIZE_LABELS[optionValue]}
                    </option>
                ))}
            </select>
        </div>
    );
}
