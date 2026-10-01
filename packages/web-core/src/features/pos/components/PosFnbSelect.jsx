import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { createPortal } from 'react-dom';

const normalizeValue = (value) => String(value ?? '');

export default function PosFnbSelect({
  id,
  value = '',
  options = [],
  onChange,
  disabled = false,
  placeholder = 'Select an option',
  leadingIcon: LeadingIcon = null,
  'aria-label': ariaLabel,
  className = '',
  menuClassName = '',
  optionClassName = '',
  portal = true
}) {
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const normalizedValue = normalizeValue(value);
  const selectedOption = options.find((option) => normalizeValue(option.value) === normalizedValue);
  const listboxId = `${id}-listbox`;

  const updateMenuPosition = useCallback(() => {
    if (!portal || !open || !rootRef.current || typeof window === 'undefined') return;

    const trigger = rootRef.current.querySelector('[role="combobox"]');
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuMaxHeight = 184;
    const viewportPadding = 8;
    const scrollRegion = rootRef.current.closest('.pos-items-modal-scroll-region');
    const scrollRegionRect = scrollRegion?.getBoundingClientRect();
    const boundaryTop = scrollRegionRect
      ? Math.max(viewportPadding, scrollRegionRect.top + viewportPadding)
      : viewportPadding;
    const boundaryBottom = scrollRegionRect
      ? Math.min(window.innerHeight - viewportPadding, scrollRegionRect.bottom - viewportPadding)
      : window.innerHeight - viewportPadding;
    const spaceBelow = boundaryBottom - rect.bottom - 4;
    const spaceAbove = rect.top - boundaryTop - 4;
    const openUpward = spaceBelow < menuMaxHeight && spaceAbove > spaceBelow;
    const availableHeight = Math.max(96, Math.min(menuMaxHeight, openUpward ? spaceAbove : spaceBelow));

    setMenuPosition({
      top: openUpward ? Math.max(boundaryTop, rect.top - availableHeight - 4) : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      maxHeight: availableHeight
    });
  }, [open, portal]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key === 'Tab') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    if (portal) {
      updateMenuPosition();
      window.addEventListener('resize', updateMenuPosition);
      document.addEventListener('scroll', updateMenuPosition, true);
    }
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      if (portal) {
        window.removeEventListener('resize', updateMenuPosition);
        document.removeEventListener('scroll', updateMenuPosition, true);
      }
    };
  }, [open, portal, updateMenuPosition]);

  const selectOption = (option) => {
    if (!option || option.disabled) return;
    onChange?.({ target: { value: normalizeValue(option.value) } });
    setOpen(false);
  };

  const moveSelection = (direction) => {
    const selectableIndexes = options
      .map((option, index) => (option.disabled ? -1 : index))
      .filter((index) => index >= 0);
    if (!selectableIndexes.length) return;
    const currentIndex = selectableIndexes.indexOf(options.findIndex((option) => normalizeValue(option.value) === normalizedValue));
    const nextPosition = Math.min(
      selectableIndexes.length - 1,
      Math.max(0, (currentIndex < 0 ? 0 : currentIndex) + direction)
    );
    selectOption(options[selectableIndexes[nextPosition]]);
  };

  const firstSelectableOption = options.find((option) => !option.disabled);
  const lastSelectableOption = [...options].reverse().find((option) => !option.disabled);

  const handleTriggerKeyDown = (event) => {
    if (disabled) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen((current) => !current);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      else moveSelection(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) setOpen(true);
      else moveSelection(-1);
    } else if (event.key === 'Home' && open) {
      event.preventDefault();
      selectOption(firstSelectableOption);
    } else if (event.key === 'End' && open) {
      event.preventDefault();
      selectOption(lastSelectableOption);
    }
  };

  const menu = (
    <div
      ref={menuRef}
      id={listboxId}
      role="listbox"
      aria-label={ariaLabel || placeholder}
      className={`pos-items-dropdown-menu pos-items-options-select-menu z-[10050] rounded-lg border border-slate-200 bg-white p-1 shadow-xl shadow-slate-900/15 ${portal ? 'fixed' : 'absolute inset-x-0 top-full mt-1'} ${menuClassName}`}
      style={portal && menuPosition ? {
        top: menuPosition.top,
        left: menuPosition.left,
        width: menuPosition.width,
        maxHeight: menuPosition.maxHeight,
        overflowX: 'hidden',
        overflowY: 'auto'
      } : undefined}
    >
      {options.length ? options.map((option) => {
        const optionValue = normalizeValue(option.value);
        const selected = optionValue === normalizedValue;
        return (
          <button
            key={optionValue || `empty-${option.label}`}
            type="button"
            role="option"
            aria-selected={selected}
            aria-disabled={option.disabled ? 'true' : undefined}
            disabled={option.disabled}
            onClick={() => selectOption(option)}
            className={`pos-items-dropdown-option flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors ${option.disabled ? 'cursor-not-allowed text-slate-400' : selected ? 'bg-blue-50 font-bold text-[#1A4E8D]' : 'text-[#0F172A] hover:bg-slate-50'} ${optionClassName}`}
          >
            <span className="min-w-0 truncate">{option.label}</span>
            {selected ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
          </button>
        );
      }) : (
        <p className="px-2.5 py-2 text-xs text-slate-500">No options available.</p>
      )}
    </div>
  );

  return (
    <div ref={rootRef} className="pos-items-dropdown relative min-w-0">
      <button
        id={id}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
        className={`pos-items-dropdown-trigger pos-items-options-control flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-[#1A4E8D] bg-white px-3 text-left text-[13px] text-[#0F172A] outline-none transition-colors hover:bg-blue-50/30 focus:border-[#1A4E8D] focus:ring-2 focus:ring-[#1A4E8D]/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${className}`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
          {LeadingIcon ? <LeadingIcon className="pos-items-options-control-leading-icon h-3.5 w-3.5 shrink-0 text-[#1A4E8D]" aria-hidden="true" /> : null}
          <span className={`min-w-0 truncate ${selectedOption ? 'text-[#0F172A]' : 'text-slate-300'}`}>
            {selectedOption?.label || placeholder}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[#1A4E8D] transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (!portal || menuPosition) ? (portal && typeof document !== 'undefined' ? createPortal(menu, document.body) : menu) : null}
    </div>
  );
}
