import { useEffect, useRef } from 'react';
import { CHECKOUT_FONT_FAMILY } from './checkoutUiTokens.js';

const TIME_WHEEL_ITEM_HEIGHT = 42;
const TIME_WHEEL_VISIBLE_ITEMS = 3;

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
  const settleTimerRef = useRef(null);
  const suppressScrollRef = useRef(false);
  const suppressScrollTimerRef = useRef(null);
  const normalizedOptions = normalizeOptions(options);
  const itemHeight = isResponsive ? 44 : TIME_WHEEL_ITEM_HEIGHT;
  const selectedIndex = normalizedOptions.findIndex((option) => option.value === String(value));
  const enabledOptions = normalizedOptions.filter((option) => !option.disabled);

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
    const nextOption = normalizedOptions[nearestIndex]?.disabled
      ? normalizedOptions
        .map((option, index) => ({ index, option }))
        .filter(({ option }) => !option.disabled)
        .sort((left, right) => Math.abs(left.index - nearestIndex) - Math.abs(right.index - nearestIndex))[0]?.option
      : normalizedOptions[nearestIndex];
    if (nextOption && !nextOption.disabled && nextOption.value !== String(value)) onChange(nextOption.value);
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
    if (option.value !== String(value)) onChange(option.value);
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
                color: option.disabled ? '#b7c0d0' : active ? '#17213c' : '#66748f',
                cursor: disabled || option.disabled ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                fontFamily: CHECKOUT_FONT_FAMILY,
                fontSize: 12,
                fontWeight: active ? 600 : 500,
                justifyContent: 'center',
                minHeight: itemHeight,
                opacity: option.disabled ? 0.65 : 1,
                padding: '0 6px',
                scrollSnapAlign: 'start',
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
          position: 'absolute'
        }}
      />
      <div
        aria-hidden="true"
        style={{
          background: 'linear-gradient(to bottom, rgba(255,255,255,0.96), rgba(255,255,255,0) 38%, rgba(255,255,255,0) 62%, rgba(255,255,255,0.96))',
          inset: 0,
          pointerEvents: 'none',
          position: 'absolute'
        }}
      />
    </div>
  );
}
