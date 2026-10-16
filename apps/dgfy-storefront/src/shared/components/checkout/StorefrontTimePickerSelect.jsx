import { useEffect, useRef, useState } from 'react';
import { CHECKOUT_FONT_FAMILY } from './checkoutUiTokens.js';

const TIME_WHEEL_ITEM_HEIGHT = 42;
const TIME_WHEEL_VISIBLE_ITEMS = 3;

const normalizeTypedValue = (label, rawValue) => {
  const value = String(rawValue ?? '').trim().toUpperCase();
  if (label === 'AM/PM') return value === 'AM' || value === 'PM' ? value : null;
  if (!/^\d{1,2}$/.test(value)) return null;
  const numericValue = Number(value);
  if (label === 'Hour') return numericValue >= 1 && numericValue <= 12 ? String(numericValue) : null;
  if (label === 'Minute') return numericValue >= 0 && numericValue <= 59 ? String(numericValue).padStart(2, '0') : null;
  return null;
};

const isAllowedInputDraft = (label, rawValue) => {
  const value = String(rawValue ?? '').trim().toUpperCase();
  if (label === 'AM/PM') return value === '' || value === 'A' || value === 'P' || value === 'AM' || value === 'PM';
  if (label === 'Hour') return value === '' || /^[1-9]$/.test(value) || /^(1[0-2])$/.test(value);
  if (label === 'Minute') return value === '' || /^\d$/.test(value) || /^(?:[0-5]\d)$/.test(value);
  return true;
};

const normalizeOptions = (options) => (Array.isArray(options) ? options : []).map((option) => {
  if (option && typeof option === 'object') {
    return {
      disabled: Boolean(option.disabled),
      label: String(option.label ?? option.value ?? ''),
      value: String(option.value ?? '')
    };
  }
  return { disabled: false, label: String(option), value: String(option) };
});

/** iPhone-style scroll wheel used by the shared scheduled-order time fields. */
export function StorefrontTimePickerSelect({
  brandColor = '#1A4E8D',
  disabled = false,
  isResponsive = false,
  label,
  onChange,
  options,
  placeholder,
  value = ''
}) {
  const wheelRef = useRef(null);
  const inputRef = useRef(null);
  const inputPointerRef = useRef(null);
  const settleTimerRef = useRef(null);
  const suppressScrollRef = useRef(false);
  const suppressScrollTimerRef = useRef(null);
  const normalizedOptions = normalizeOptions(options);
  const itemHeight = isResponsive ? 44 : TIME_WHEEL_ITEM_HEIGHT;
  const selectedValue = String(value ?? '');
  const selectedIndex = normalizedOptions.findIndex((option) => option.value === selectedValue);
  const enabledOptions = normalizedOptions.filter((option) => !option.disabled);
  const isAmPm = label === 'AM/PM';
  const [inputState, setInputState] = useState(() => ({
    draft: selectedValue,
    error: false,
    value: selectedValue
  }));
  const inputDraft = inputState.value === selectedValue ? inputState.draft : selectedValue;
  const inputError = inputState.value === selectedValue ? inputState.error : false;

  useEffect(() => {
    const wheel = wheelRef.current;
    if (!wheel || selectedIndex < 0) return undefined;
    suppressScrollRef.current = true;
    wheel.scrollTop = selectedIndex * itemHeight;
    const releaseTimer = window.setTimeout(() => {
      suppressScrollRef.current = false;
    }, 0);
    return () => window.clearTimeout(releaseTimer);
  }, [itemHeight, selectedIndex]);

  useEffect(() => () => {
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    if (suppressScrollTimerRef.current) window.clearTimeout(suppressScrollTimerRef.current);
  }, []);

  const selectClosestOption = () => {
    const wheel = wheelRef.current;
    if (!wheel || enabledOptions.length === 0) return;
    const nearestIndex = Math.max(0, Math.min(
      normalizedOptions.length - 1,
      Math.round(wheel.scrollTop / itemHeight)
    ));
    const nextEntry = normalizedOptions[nearestIndex]?.disabled
      ? normalizedOptions
        .map((option, index) => ({ index, option }))
        .filter(({ option }) => !option.disabled)
        .sort((left, right) => Math.abs(left.index - nearestIndex) - Math.abs(right.index - nearestIndex))[0]
      : { index: nearestIndex, option: normalizedOptions[nearestIndex] };
    const nextOption = nextEntry?.option;
    if (!nextOption || nextOption.disabled) return;
    const nextScrollTop = nextEntry.index * itemHeight;
    if (wheel.scrollTop !== nextScrollTop) {
      suppressScrollRef.current = true;
      wheel.scrollTop = nextScrollTop;
      if (suppressScrollTimerRef.current) window.clearTimeout(suppressScrollTimerRef.current);
      suppressScrollTimerRef.current = window.setTimeout(() => {
        suppressScrollRef.current = false;
        suppressScrollTimerRef.current = null;
      }, 0);
    }
    if (nextOption.value !== selectedValue) {
      setInputState({ draft: nextOption.value, error: false, value: selectedValue });
      onChange(nextOption.value);
    }
  };

  const handleScroll = () => {
    if (disabled || suppressScrollRef.current) return;
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(selectClosestOption, 90);
  };

  const handleOptionClick = (option, index) => {
    if (disabled || option.disabled) return;
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    suppressScrollRef.current = true;
    if (suppressScrollTimerRef.current) window.clearTimeout(suppressScrollTimerRef.current);
    suppressScrollTimerRef.current = window.setTimeout(() => {
      suppressScrollRef.current = false;
      suppressScrollTimerRef.current = null;
    }, 250);
    if (wheelRef.current) wheelRef.current.scrollTop = index * itemHeight;
    if (option.value === selectedValue) {
      inputRef.current?.focus();
      inputRef.current?.select();
      return;
    }
    setInputState({ draft: option.value, error: false, value: selectedValue });
    onChange(option.value);
  };

  const commitInput = () => {
    const normalized = normalizeTypedValue(label, inputDraft);
    const matchingOption = normalizedOptions.find((option) => option.value === normalized);
    if (!normalized || !matchingOption || matchingOption.disabled) {
      setInputState({ draft: inputDraft, error: true, value: selectedValue });
      return false;
    }
    setInputState({ draft: normalized, error: false, value: selectedValue });
    if (normalized !== selectedValue) onChange(normalized);
    return true;
  };

  const handleInputChange = (event) => {
    const draft = event.target.value;
    if (!isAllowedInputDraft(label, draft)) return;
    setInputState({ draft, error: false, value: selectedValue });
  };

  const handleInputWheel = (event) => {
    const wheel = wheelRef.current;
    if (disabled || !wheel || event.deltaY === 0) return;
    const delta = event.deltaMode === 1
      ? event.deltaY * itemHeight
      : event.deltaMode === 2
        ? event.deltaY * wheel.clientHeight
        : event.deltaY;
    event.preventDefault();
    wheel.scrollTop += delta;
  };

  const handleInputPointerDown = (event) => {
    const wheel = wheelRef.current;
    if (disabled || !wheel || (event.pointerType === 'mouse' && event.button !== 0)) return;
    inputPointerRef.current = {
      moved: false,
      pointerId: event.pointerId,
      startScrollTop: wheel.scrollTop,
      startY: event.clientY
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleInputPointerMove = (event) => {
    const drag = inputPointerRef.current;
    const wheel = wheelRef.current;
    if (!drag || !wheel || drag.pointerId !== event.pointerId) return;
    const delta = drag.startY - event.clientY;
    if (Math.abs(delta) < 2 && !drag.moved) return;
    drag.moved = true;
    event.preventDefault();
    wheel.scrollTop = drag.startScrollTop + delta;
  };

  const handleInputPointerEnd = (event) => {
    const drag = inputPointerRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    inputPointerRef.current = null;
  };

  return (
    <div style={{ minWidth: 0, opacity: disabled ? 0.65 : 1, position: 'relative', width: '100%' }}>
      <div
        ref={wheelRef}
        role="listbox"
        aria-label={label}
        aria-disabled={disabled || undefined}
        aria-orientation="vertical"
        onScroll={handleScroll}
        style={{
          height: itemHeight * TIME_WHEEL_VISIBLE_ITEMS,
          overflowY: 'auto',
          overscrollBehaviorY: 'contain',
          scrollSnapType: 'y mandatory',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <div aria-hidden="true" style={{ height: itemHeight }} />
        {normalizedOptions.length > 0 ? normalizedOptions.map((option, index) => {
          const active = option.value === String(value);
          const hideActiveAmPmLabel = label === 'AM/PM' && active;
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={active}
              disabled={disabled || option.disabled}
              onClick={() => handleOptionClick(option, index)}
              style={{
                alignItems: 'center',
                background: 'transparent',
                border: 0,
                color: hideActiveAmPmLabel
                  ? 'transparent'
                  : option.disabled ? '#b7c0d0' : active ? '#17213c' : '#66748f',
                cursor: disabled || option.disabled ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                fontFamily: CHECKOUT_FONT_FAMILY,
                fontSize: 12,
                fontWeight: active ? 600 : 500,
                justifyContent: 'center',
                minHeight: itemHeight,
                opacity: option.disabled ? 0.65 : 1,
                padding: '0 6px',
                scrollSnapAlign: 'center',
                transition: 'color 160ms ease, font-size 160ms ease',
                width: '100%'
              }}
            >
              {option.label}
            </button>
          );
        }) : (
          <button
            type="button"
            role="option"
            aria-selected="false"
            disabled
            style={{
              alignItems: 'center',
              background: 'transparent',
              border: 0,
              color: '#b7c0d0',
              display: 'inline-flex',
              fontFamily: CHECKOUT_FONT_FAMILY,
              fontSize: 14,
              fontWeight: 600,
              justifyContent: 'center',
              minHeight: itemHeight,
              padding: '0 6px',
              width: '100%'
            }}
          >
            {placeholder || '—'}
          </button>
        )}
        <div aria-hidden="true" style={{ height: itemHeight }} />
      </div>
      <input
        className="storefront-time-picker-input"
        ref={inputRef}
        aria-label={label}
        aria-invalid={inputError ? 'true' : undefined}
        disabled={disabled || normalizedOptions.length === 0}
        inputMode={label === 'AM/PM' ? 'text' : 'numeric'}
        maxLength={2}
        onBlur={() => {
          commitInput();
        }}
        onChange={handleInputChange}
        onFocus={(event) => {
          event.currentTarget.select();
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          commitInput();
          inputRef.current?.blur();
        }}
        onPointerCancel={handleInputPointerEnd}
        onPointerDown={handleInputPointerDown}
        onPointerMove={handleInputPointerMove}
        onPointerUp={handleInputPointerEnd}
        onWheel={handleInputWheel}
        type="text"
        value={inputDraft}
        style={{
          background: '#fff',
          border: 0,
          color: inputError ? '#b91c1c' : '#17213c',
          fontFamily: CHECKOUT_FONT_FAMILY,
          fontSize: 12,
          fontWeight: 600,
          height: itemHeight,
          inset: `${itemHeight}px 0 auto`,
          outline: 0,
          padding: '0 6px',
          position: 'absolute',
          textAlign: 'center',
          touchAction: 'none',
          width: '100%',
          zIndex: 2
        }}
      />
      <div
        aria-hidden="true"
        style={{
          borderBottom: `1px solid ${brandColor}`,
          borderTop: `1px solid ${brandColor}`,
          borderRadius: 10,
          inset: `${itemHeight}px 0 auto`,
          height: itemHeight,
          opacity: 0.35,
          pointerEvents: 'none',
          position: 'absolute',
          zIndex: 3
        }}
      />
      <div
        aria-hidden="true"
        style={{
          background: isAmPm
            ? 'transparent'
            : 'linear-gradient(to bottom, rgba(255,255,255,0.96), rgba(255,255,255,0) 38%, rgba(255,255,255,0) 62%, rgba(255,255,255,0.96))',
          inset: 0,
          pointerEvents: 'none',
          position: 'absolute'
        }}
      />
    </div>
  );
}
