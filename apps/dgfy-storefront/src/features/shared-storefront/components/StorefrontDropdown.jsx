import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

const NOOP = () => {};

const DROPDOWN_MENU_BASE_STYLE = {
  position: 'absolute',
  top: 'calc(100% + 10px)',
  left: 0,
  minWidth: '100%',
  whiteSpace: 'nowrap',
  zIndex: 2400,
  border: '1px solid #dbe5ee',
  borderRadius: 18,
  background: '#ffffff',
  boxShadow: '0 20px 48px rgba(15,23,42,0.14)',
  padding: 8,
  display: 'grid',
  gap: 6,
  maxHeight: 280,
  overflowY: 'auto'
};

export function StorefrontDropdown({
  value,
  options,
  onChange,
  placeholder = 'Select',
  disabled = false,
  label = '',
  ariaLabel = '',
  leading = null,
  trailingMeta = null,
  triggerStyle = {},
  containerStyle = {},
  menuStyle = {},
  menuPlacement = 'bottom-start',
  optionStyle = {},
  selectedOptionStyle = {},
  optionLabelStyle = {},
  selectedOptionLabelStyle = {},
  selectedOptionIconStyle = {},
  selectedLabelStyle = {},
  labelStyle = {},
  chevronSize = 18,
  compactLabel = false,
  onOpenChange = NOOP
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const selectedOption = useMemo(
    () => options.find((option) => String(option.value) === String(value)) || null,
    [options, value]
  );

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        onOpenChange(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        onOpenChange(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onOpenChange]);

  return (
    <div ref={dropdownRef} style={{ position: 'relative', minWidth: 0, ...containerStyle }}>
      <button
        type="button"
        disabled={disabled}
        role="combobox"
        aria-label={ariaLabel || label || placeholder}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => {
          if (disabled) return;
          setIsOpen((previous) => {
            const nextOpenState = !previous;
            onOpenChange(nextOpenState);
            return nextOpenState;
          });
        }}
        style={{
          width: '100%',
          minHeight: 44,
          borderRadius: 18,
          border: '1px solid #dbe5ee',
          background: disabled ? '#f8fafc' : '#ffffff',
          color: disabled ? '#94a3b8' : '#0f172a',
          padding: compactLabel ? '10px 52px 10px 16px' : '11px 52px 11px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
          boxSizing: 'border-box',
          position: 'relative',
          outline: 'none',
          transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s',
          ...triggerStyle
        }}
      >
        {leading ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexShrink: 0 }}>
            {leading}
          </span>
        ) : null}
        {!leading && selectedOption?.icon ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexShrink: 0 }}>
            {React.createElement(selectedOption.icon, { size: 16 })}
          </span>
        ) : null}
        <span style={{ display: 'grid', gap: label ? 3 : 0, minWidth: 0, flex: 1 }}>
          {label ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                lineHeight: 1.1,
                ...labelStyle
              }}
            >
              {label}
            </span>
          ) : null}
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: disabled ? '#94a3b8' : '#0f172a',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.25,
              ...selectedLabelStyle
            }}
          >
            {selectedOption?.label || placeholder}
          </span>
        </span>
        {trailingMeta ? (
          <span style={{ fontSize: 12, fontWeight: 800, color: '#64748b', flexShrink: 0 }}>
            {trailingMeta}
          </span>
        ) : null}
        <ChevronDown
          size={chevronSize}
          color={disabled ? '#cbd5e1' : '#475569'}
          style={{
            position: 'absolute',
            right: 16,
            top: '50%',
            transform: `translateY(-50%) rotate(${isOpen ? 180 : 0}deg)`,
            transition: 'transform 0.2s',
            pointerEvents: 'none'
          }}
        />
      </button>

      {isOpen && !disabled ? (
        <div
          role="listbox"
          style={{
            ...DROPDOWN_MENU_BASE_STYLE,
            ...(menuPlacement === 'bottom-end' ? { left: 'auto', right: 0 } : null),
            ...menuStyle
          }}
        >
          {options.map((option) => {
            const isSelected = String(option.value) === String(value);
            return (
              <button
                key={`${option.value}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                  onOpenChange(false);
                }}
                style={{
                  width: '100%',
                  borderRadius: 14,
                  border: isSelected ? '1px solid #fed7aa' : '1px solid transparent',
                  background: isSelected ? '#fff7ed' : '#ffffff',
                  color: '#0f172a',
                  padding: option.description ? '10px 14px' : '11px 14px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'grid',
                  gap: option.description ? 4 : 0,
                  boxSizing: 'border-box',
                  ...optionStyle,
                  ...(isSelected ? selectedOptionStyle : {})
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  {option.icon ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: isSelected ? '#c2410c' : '#64748b', flexShrink: 0, ...(isSelected ? selectedOptionIconStyle : {}) }}>
                      {React.createElement(option.icon, { size: 16 })}
                    </span>
                  ) : null}
                  <span style={{ fontSize: 14, fontWeight: isSelected ? 800 : 700, lineHeight: 1.3, minWidth: 0, ...optionLabelStyle, ...(isSelected ? selectedOptionLabelStyle : {}) }}>
                    {option.label}
                  </span>
                </span>
                {option.description ? (
                  <span style={{ fontSize: 12, color: '#64748b', lineHeight: 1.35 }}>
                    {option.description}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
