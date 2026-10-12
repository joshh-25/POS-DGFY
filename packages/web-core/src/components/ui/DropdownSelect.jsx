import React from 'react';
import { Check, ChevronDown } from 'lucide-react';

const DEFAULT_TRIGGER_CLASS_NAME = 'inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-[13px] font-extrabold text-[#0F172A] shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400';
const DEFAULT_MENU_CLASS_NAME = 'absolute left-0 top-full z-50 mt-2 max-h-72 w-full min-w-[12rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5';
const DEFAULT_OPTION_CLASS_NAME = 'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs font-extrabold transition-colors';

const getValue = (value) => (value === null || value === undefined ? '' : String(value));

function getFirstEnabledIndex(options, direction = 1) {
    if (direction < 0) {
        for (let index = options.length - 1; index >= 0; index -= 1) {
            if (!options[index]?.disabled) return index;
        }
        return -1;
    }

    return options.findIndex((option) => !option?.disabled);
}

function getNextEnabledIndex(options, currentIndex, direction) {
    if (options.length === 0) return -1;

    for (let step = 1; step <= options.length; step += 1) {
        const candidateIndex = currentIndex < 0
            ? (direction > 0 ? step - 1 : options.length - step)
            : (currentIndex + direction * step + options.length) % options.length;
        if (!options[candidateIndex]?.disabled) return candidateIndex;
    }

    return -1;
}

export default function DropdownSelect({
    id,
    options = [],
    value = '',
    onChange = () => {},
    ariaLabel,
    ariaLabelledBy,
    ariaDescribedBy,
    ariaInvalid = false,
    listboxLabel,
    menuId: menuIdOverride,
    placeholder = 'Select an option',
    required = false,
    disabled = false,
    appearance = 'field',
    className = '',
    triggerClassName = DEFAULT_TRIGGER_CLASS_NAME,
    menuClassName = DEFAULT_MENU_CLASS_NAME,
    optionClassName = '',
    valueClassName = 'min-w-0 flex-1 truncate',
    placeholderClassName = '',
    chevronClassName = 'h-4 w-4 shrink-0 text-slate-500',
    startAdornment = null,
    title,
    testId,
    triggerTestId
}) {
    const selectedValue = getValue(value);
    const selectedIndex = options.findIndex((option) => getValue(option?.value) === selectedValue);
    const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;
    const [open, setOpen] = React.useState(false);
    const [activeIndex, setActiveIndex] = React.useState(-1);
    const rootRef = React.useRef(null);
    const triggerRef = React.useRef(null);
    const menuId = menuIdOverride || `${id}-menu`;
    const activeOption = open && activeIndex >= 0 ? options[activeIndex] : null;

    React.useEffect(() => {
        if (!open) return undefined;

        const handlePointerDown = (event) => {
            if (rootRef.current?.contains(event.target)) return;
            setOpen(false);
            setActiveIndex(-1);
        };
        const handleKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            setOpen(false);
            setActiveIndex(-1);
            triggerRef.current?.focus();
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open]);

    const openMenu = (nextActiveIndex = selectedIndex) => {
        const safeIndex = options[nextActiveIndex]?.disabled
            ? getFirstEnabledIndex(options)
            : nextActiveIndex;
        setActiveIndex(safeIndex >= 0 ? safeIndex : getFirstEnabledIndex(options));
        setOpen(true);
    };

    const closeMenu = (restoreFocus = false) => {
        setOpen(false);
        setActiveIndex(-1);
        if (restoreFocus) triggerRef.current?.focus();
    };

    const selectOption = (option) => {
        if (!option || option.disabled) return;
        const nextValue = getValue(option.value);
        if (nextValue !== selectedValue) onChange(nextValue);
        closeMenu(true);
    };

    const handleKeyDown = (event) => {
        if (disabled) return;

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            const currentIndex = open ? activeIndex : selectedIndex;
            setActiveIndex(getNextEnabledIndex(options, currentIndex, direction));
            setOpen(true);
            return;
        }

        if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            setActiveIndex(getFirstEnabledIndex(options, event.key === 'Home' ? 1 : -1));
            setOpen(true);
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!open) {
                openMenu();
                return;
            }
            selectOption(options[activeIndex] || selectedOption);
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            closeMenu(true);
            return;
        }

        if (event.key === 'Tab' && open) {
            closeMenu();
        }
    };

    return (
        <div
            ref={rootRef}
            className={`dropdown-select relative min-w-0 ${className}`}
            data-testid={testId}
        >
            <button
                ref={triggerRef}
                id={id}
                type="button"
                role="combobox"
                aria-label={ariaLabel}
                aria-labelledby={ariaLabelledBy}
                aria-describedby={ariaDescribedBy}
                aria-invalid={ariaInvalid || undefined}
                aria-required={required || undefined}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={menuId}
                aria-activedescendant={activeOption ? `${id}-option-${activeIndex}` : undefined}
                title={title}
                data-testid={triggerTestId}
                data-value={selectedValue}
                data-appearance={appearance}
                disabled={disabled}
                onClick={() => (open ? closeMenu() : openMenu())}
                onKeyDown={handleKeyDown}
                className={`dropdown-select__trigger ${triggerClassName}`}
            >
                {startAdornment}
                <span className={`${valueClassName} ${selectedOption ? '' : placeholderClassName}`}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronDown
                    className={`${chevronClassName} transition-transform ${open ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                />
            </button>
            <div
                id={menuId}
                role="listbox"
                aria-label={listboxLabel || (ariaLabel ? `${ariaLabel} options` : undefined)}
                aria-labelledby={ariaLabelledBy}
                hidden={!open}
                className={`dropdown-select__menu ${menuClassName}`}
            >
                {options.map((option, index) => {
                    const optionValue = getValue(option?.value);
                    const isSelected = optionValue === selectedValue;
                    const isActive = index === activeIndex;
                    const isDisabled = Boolean(option?.disabled);
                    const stateClassName = isDisabled
                        ? 'cursor-not-allowed text-slate-400 opacity-60'
                        : isSelected || isActive
                            ? 'bg-blue-50 text-[#1A4E8D]'
                            : 'text-[#0F172A] hover:bg-slate-50 hover:text-[#1A4E8D]';

                    return (
                        <div
                            key={`${optionValue}-${index}`}
                            id={`${id}-option-${index}`}
                            role="option"
                            aria-selected={isSelected}
                            aria-disabled={isDisabled || undefined}
                            data-testid={option.testId}
                            data-active={isActive || undefined}
                            onMouseMove={() => {
                                if (!isDisabled) setActiveIndex(index);
                            }}
                            onClick={() => selectOption(option)}
                            className={`dropdown-select__option ${optionClassName} ${DEFAULT_OPTION_CLASS_NAME} ${stateClassName}`}
                        >
                            <span className="min-w-0 break-words">{option.label}</span>
                            {isSelected ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
