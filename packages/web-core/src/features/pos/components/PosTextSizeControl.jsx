import React from 'react';
import { Type } from 'lucide-react';
import PosDropdownSelect from './PosDropdownSelect.jsx';
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

const POS_TEXT_SIZE_TRIGGER_CLASS_NAME = 'inline-flex h-8 w-8 items-center justify-center rounded-xl border-0 bg-transparent text-[#1A4E8D] shadow-none transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:h-10 lg:w-10';
const POS_TEXT_SIZE_MENU_CLASS_NAME = 'absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5';

export default function PosTextSizeControl({
    id = 'pos-text-size-control',
    value = DEFAULT_POS_TEXT_SIZE,
    onChange = () => {},
    className = '',
    desktopLabeled = false
}) {
    const normalizedValue = normalizePosTextSize(value);
    const selectedLabel = POS_TEXT_SIZE_LABELS[normalizedValue];
    const options = POS_TEXT_SIZE_OPTIONS.map(({ value: optionValue }) => ({
        value: optionValue,
        label: POS_TEXT_SIZE_LABELS[optionValue]
    }));

    return (
        <PosDropdownSelect
            id={id}
            value={normalizedValue}
            onChange={onChange}
            options={options}
            ariaLabel={`POS text size: ${selectedLabel}`}
            listboxLabel="POS text size options"
            title={`Text size: ${selectedLabel}`}
            appearance="toolbar"
            className={`pos-text-size-control relative flex items-center ${className}`}
            triggerClassName={`${POS_TEXT_SIZE_TRIGGER_CLASS_NAME} ${desktopLabeled ? 'lg:h-10 lg:w-[12.5rem] lg:justify-between lg:gap-2 lg:rounded-xl lg:border lg:border-slate-200 lg:bg-white lg:px-3 lg:text-[#0F172A]' : ''}`}
            menuClassName={POS_TEXT_SIZE_MENU_CLASS_NAME}
            optionClassName="pos-text-size-control__option"
            valueClassName={`min-w-0 truncate text-[11px] font-extrabold ${desktopLabeled ? 'hidden lg:inline' : 'hidden'}`}
            chevronClassName="ml-0.5 h-3 w-3 shrink-0 text-[#1A4E8D] lg:h-3 lg:w-3"
            startAdornment={(
                <Type
                    className="h-5 w-5 shrink-0 text-[#1A4E8D] lg:h-5 lg:w-5"
                    strokeWidth={2.5}
                    aria-hidden="true"
                />
            )}
            testId="pos-text-size-control"
        />
    );
}
