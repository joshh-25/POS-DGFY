import { Check, ChevronDown } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState } from 'react';
import { CHECKOUT_FONT_FAMILY } from './checkoutUiTokens.js';

const MENU_ROW_HEIGHT = 34;
const MENU_MAX_HEIGHT = 220;

function getMenuPosition(trigger, optionCount) {
  if (!trigger || typeof window === 'undefined') return null;
  const rect = trigger.getBoundingClientRect();
  const width = Math.min(Math.max(rect.width, 112), window.innerWidth - 16);
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const desiredHeight = Math.min(optionCount * MENU_ROW_HEIGHT + 12, MENU_MAX_HEIGHT);
  const availableBelow = Math.max(0, window.innerHeight - rect.bottom - 12);
  const availableAbove = Math.max(0, rect.top - 12);
  const placeBelow = availableBelow >= Math.min(desiredHeight, 120) || availableBelow >= availableAbove;
  const maxHeight = Math.max(72, Math.min(desiredHeight, placeBelow ? availableBelow : availableAbove));

  return {
    left,
    top: placeBelow ? rect.bottom + 6 : Math.max(8, rect.top - maxHeight - 6),
    width,
    maxHeight
  };
}

/** Compact, keyboard-operable listbox used by the scheduled-order time fields. */
export function StorefrontTimePickerSelect({
  allowCustomInput = false,
  brandColor,
  disabled = false,
  isResponsive = false,
  label,
  onChange,
  options,
  placeholder,
  value = ''
}) {
  const id = useId();
  const triggerRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);
  const optionRefs = useRef([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState(null);
  const [inputDraft, setInputDraft] = useState(null);
  const [inputError, setInputError] = useState(false);
  const selectedIndex = Math.max(0, options.indexOf(value));
  const inputValue = inputDraft ?? value;
  const errorId = id + '-error';
  const errorMessage = label === 'Minute'
    ? 'Enter 00–60.'
    : label === 'Hour' ? 'Enter an available hour.' : 'Choose AM or PM.';

  const commitInput = () => {
    const trimmed = inputValue.trim().toUpperCase();
    const normalized = label === 'Hour' && /^\d{1,2}$/.test(trimmed)
      ? String(Number(trimmed))
      : label === 'Minute' && /^\d{1,2}$/.test(trimmed)
        ? trimmed.padStart(2, '0')
        : trimmed;
    const customInputAllowed = allowCustomInput
      && label === 'Minute'
      && /^\d{1,2}$/.test(trimmed)
      && Number(trimmed) <= 60;
    if (normalized && (options.includes(normalized) || customInputAllowed)) {
      setInputDraft(null);
      setInputError(false);
      if (normalized !== value) onChange(normalized);
    } else {
      setInputError(Boolean(trimmed));
      setInputDraft(null);
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    const focusTimer = window.setTimeout(() => optionRefs.current[activeIndex]?.focus(), 0);
    const updatePosition = () => {
      const nextPosition = getMenuPosition(triggerRef.current, options.length);
      setPosition((current) => (
        current && nextPosition
          && current.left === nextPosition.left
          && current.top === nextPosition.top
          && current.width === nextPosition.width
          && current.maxHeight === nextPosition.maxHeight
          ? current
          : nextPosition
      ));
    };
    const handlePointerDown = (event) => {
      if (triggerRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
      setPosition(null);
    };
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      setPosition(null);
      triggerRef.current?.focus();
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeIndex, open, options.length]);

  const handleTriggerClick = () => {
    if (options.length === 0) return;
    if (open) {
      setOpen(false);
      setPosition(null);
      return;
    }
    setActiveIndex(selectedIndex);
    setPosition(getMenuPosition(triggerRef.current, options.length));
    setOpen(true);
  };

  const handleMenuKeyDown = (event) => {
    let nextIndex = activeIndex;
    if (event.key === 'ArrowDown') nextIndex = Math.min(options.length - 1, activeIndex + 1);
    else if (event.key === 'ArrowUp') nextIndex = Math.max(0, activeIndex - 1);
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = options.length - 1;
    else return;

    event.preventDefault();
    setActiveIndex(nextIndex);
    optionRefs.current[nextIndex]?.focus();
  };

  const selectedLabel = value || placeholder;
  const menu = open && typeof document !== 'undefined' ? createPortal(
    <div
      ref={menuRef}
      id={id + '-options'}
      role="listbox"
      aria-label={label + ' options'}
      data-storefront-picker-overlay="true"
      onKeyDown={handleMenuKeyDown}
      style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        boxShadow: '0 18px 34px rgba(15, 23, 42, 0.14), 0 1px 4px rgba(15, 23, 42, 0.05)',
        boxSizing: 'border-box',
        maxHeight: position?.maxHeight ?? MENU_MAX_HEIGHT,
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        padding: 6,
        position: 'fixed',
        left: position?.left ?? 8,
        top: position?.top ?? 8,
        visibility: position ? 'visible' : 'hidden',
        width: position?.width ?? 112,
        zIndex: 3100,
        fontFamily: CHECKOUT_FONT_FAMILY
      }}
    >
      {options.map((option, index) => {
        const selected = option === value;
        return (
          <button
            key={option}
            ref={(element) => { optionRefs.current[index] = element; }}
            type="button"
            role="option"
            aria-selected={selected}
            tabIndex={index === activeIndex ? 0 : -1}
            onFocus={() => setActiveIndex(index)}
            onClick={() => {
              onChange(option);
              setInputDraft(null);
              setInputError(false);
              setOpen(false);
              setPosition(null);
              triggerRef.current?.focus();
            }}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            style={{
              alignItems: 'center',
              background: selected ? '#eff6ff' : '#fff',
              border: 0,
              borderRadius: 8,
              boxSizing: 'border-box',
              color: selected ? brandColor : '#0f172a',
              cursor: 'pointer',
              display: 'flex',
              fontFamily: CHECKOUT_FONT_FAMILY,
              fontSize: 12,
              fontWeight: 700,
              justifyContent: 'space-between',
              minHeight: MENU_ROW_HEIGHT,
              padding: '0 10px',
              textAlign: 'left',
              width: '100%'
            }}
          >
            <span>{option}</span>
            {selected ? <Check aria-hidden="true" size={14} /> : null}
          </button>
        );
      })}
    </div>,
    document.body
  ) : null;

  return (
    <div style={{ minWidth: 0, position: 'relative', width: '100%' }}>
      <div
        style={{
          alignItems: 'center',
          background: '#fff',
          border: '1px solid ' + (inputError ? '#dc2626' : '#cbd5e1'),
          borderRadius: 8,
          boxSizing: 'border-box',
          color: disabled ? '#94a3b8' : '#0f172a',
          display: 'flex',
          fontFamily: CHECKOUT_FONT_FAMILY,
          fontSize: 12,
          fontWeight: 700,
          gap: 4,
          justifyContent: 'space-between',
          minHeight: isResponsive ? 42 : 38,
          minWidth: 0,
          opacity: disabled ? 0.65 : 1,
          padding: '0 4px 0 7px',
          textAlign: 'left',
          width: '100%'
        }}
      >
        <input
          ref={inputRef}
          aria-label={label}
          aria-invalid={inputError || undefined}
          aria-describedby={inputError ? errorId : undefined}
          disabled={disabled}
          inputMode={label === 'AM/PM' ? 'text' : 'numeric'}
          maxLength={2}
          onBlur={commitInput}
          onChange={(event) => { setInputDraft(event.target.value); setInputError(false); }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { commitInput(); inputRef.current?.blur(); }
            if (event.key === 'ArrowDown' && !open) { event.preventDefault(); handleTriggerClick(); }
          }}
          placeholder={placeholder}
          type="text"
          value={inputValue}
          style={{ background: 'transparent', border: 0, color: 'inherit', flex: 1, font: 'inherit', minWidth: 0, outline: 0, padding: 0, width: '100%' }}
          className="focus-visible:ring-2 focus-visible:ring-blue-500"
        />
        <button
          ref={triggerRef}
          type="button"
          aria-label={label + ': ' + selectedLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={id + '-options'}
          disabled={disabled || options.length === 0}
          onClick={handleTriggerClick}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          style={{ alignItems: 'center', background: 'transparent', border: 0, color: 'inherit', cursor: disabled ? 'not-allowed' : 'pointer', display: 'inline-flex', flexShrink: 0, height: 32, justifyContent: 'center', padding: '0 2px' }}
        >
          <ChevronDown aria-hidden="true" size={13} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
        </button>
      </div>
      {inputError ? <span id={errorId} role="alert" style={{ color: '#b91c1c', display: 'block', fontSize: 11, lineHeight: 1.25, marginTop: 4 }}>{errorMessage}</span> : null}
      {menu}
    </div>
  );
}
