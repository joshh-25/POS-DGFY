import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

const getEnabledIndex = (options, start, direction) => {
  if (options.length === 0) return -1;
  let index = (start + options.length) % options.length;
  for (let count = 0; count < options.length; count += 1) {
    if (!options[index]?.disabled) return index;
    index = (index + direction + options.length) % options.length;
  }
  return -1;
};

export default function PosReportsDropdown({
  id,
  value,
  options = [],
  onChange,
  ariaLabel,
  disabled = false,
  placement = 'bottom',
  size = 'regular',
  triggerClassName = ''
}) {
  const generatedId = useId();
  const controlId = id || `pos-reports-dropdown-${generatedId}`;
  const menuId = `${controlId}-options`;
  const normalizedOptions = Array.isArray(options) ? options : [];
  const selectedIndex = normalizedOptions.findIndex((option) => String(option.value) === String(value));
  const selectedOption = normalizedOptions[selectedIndex];
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef(new Map());

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
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

  useEffect(() => {
    if (open) optionRefs.current.get(activeIndex)?.focus();
  }, [activeIndex, open]);

  const openAt = (index = selectedIndex) => {
    if (disabled || normalizedOptions.length === 0) return;
    setActiveIndex(getEnabledIndex(normalizedOptions, index < 0 ? 0 : index, 1));
    setOpen(true);
  };

  const selectOption = (option) => {
    if (!option || option.disabled) return;
    onChange?.(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (event) => {
    if (disabled || open) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowUp' ? -1 : 1;
      const start = selectedIndex < 0
        ? (direction > 0 ? 0 : normalizedOptions.length - 1)
        : selectedIndex;
      openAt(getEnabledIndex(normalizedOptions, start, direction));
    }
  };

  const handleOptionKeyDown = (event, index) => {
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectOption(normalizedOptions[index]);
      return;
    }

    let nextIndex = index;
    if (event.key === 'ArrowDown') nextIndex = getEnabledIndex(normalizedOptions, index + 1, 1);
    else if (event.key === 'ArrowUp') nextIndex = getEnabledIndex(normalizedOptions, index - 1, -1);
    else if (event.key === 'Home') nextIndex = getEnabledIndex(normalizedOptions, 0, 1);
    else if (event.key === 'End') nextIndex = getEnabledIndex(normalizedOptions, normalizedOptions.length - 1, -1);
    else return;

    event.preventDefault();
    setActiveIndex(nextIndex);
    optionRefs.current.get(nextIndex)?.focus();
  };

  const triggerSizeClass = size === 'small' ? 'h-9 min-h-9' : 'h-10 min-h-10';
  const menuPlacementClass = placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1';

  return (
    <div ref={rootRef} className="relative inline-flex min-w-0">
      <button
        ref={triggerRef}
        id={controlId}
        type="button"
        aria-label={ariaLabel ? `${ariaLabel}: ${selectedOption?.label ?? ''}`.trim() : selectedOption?.label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openAt())}
        onKeyDown={handleTriggerKeyDown}
        className={`inline-flex ${triggerSizeClass} min-w-0 items-center justify-between gap-2 rounded-xl border border-[#A9C5EA] bg-white px-3 text-xs font-extrabold text-[#1A4E8D] shadow-sm transition-colors hover:bg-[#F5F9FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/35 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${triggerClassName}`}
      >
        <span className="min-w-0 truncate">{selectedOption?.label ?? 'Select'}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open ? (
        <div
          id={menuId}
          role="listbox"
          aria-label={`${ariaLabel || 'Report option'} choices`}
          className={`absolute ${menuPlacementClass} left-0 z-50 max-h-60 min-w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5`}
        >
          {normalizedOptions.map((option, index) => {
            const isSelected = String(option.value) === String(value);
            return (
              <div
                key={String(option.value)}
                ref={(node) => {
                  if (node) optionRefs.current.set(index, node);
                  else optionRefs.current.delete(index);
                }}
                role="option"
                aria-selected={isSelected}
                aria-disabled={Boolean(option.disabled)}
                tabIndex={-1}
                onClick={() => selectOption(option)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
                className={`flex min-h-9 items-center justify-between gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-left text-xs font-extrabold transition-colors ${option.disabled
                  ? 'cursor-not-allowed text-slate-400'
                  : isSelected
                    ? 'cursor-pointer bg-blue-50 text-[#1A4E8D]'
                    : 'cursor-pointer text-slate-800 hover:bg-slate-50 hover:text-[#1A4E8D] focus:bg-slate-50'}`}
              >
                <span>{option.label}</span>
                {isSelected ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
