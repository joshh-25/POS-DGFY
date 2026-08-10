import React from 'react';

const ACTION_TOKENS = {
  brand: '#ea580c',
  brandDark: '#c2410c',
  teal: '#0f766e',
  tealLight: '#ecfeff',
  dark: '#0f172a',
  border: '#e2e8f0',
  buttonRadius: '12px'
};

export const Badge = ({ children, background, color, border, style }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '6px 12px',
      borderRadius: 99,
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      background: background || ACTION_TOKENS.tealLight,
      color: color || ACTION_TOKENS.teal,
      border: `1px solid ${border || 'transparent'}`,
      ...style
    }}
  >
    {children}
  </span>
);

export const PrimaryButton = ({ children, onClick, disabled, style }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      background: disabled
        ? ACTION_TOKENS.border
        : `linear-gradient(135deg, ${ACTION_TOKENS.brand}, ${ACTION_TOKENS.brandDark})`,
      color: '#fff',
      border: 'none',
      borderRadius: ACTION_TOKENS.buttonRadius,
      padding: '12px 24px',
      fontSize: 14,
      fontWeight: 800,
      cursor: disabled ? 'not-allowed' : 'pointer',
      boxShadow: disabled ? 'none' : '0 10px 24px rgba(234,88,12,0.2)',
      transition: 'all 0.2s ease',
      ...style
    }}
  >
    {children}
  </button>
);

export const GhostButton = ({ children, onClick, disabled, style }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      background: '#fff',
      color: ACTION_TOKENS.dark,
      border: `1px solid ${ACTION_TOKENS.border}`,
      borderRadius: ACTION_TOKENS.buttonRadius,
      padding: '12px 24px',
      fontSize: 14,
      fontWeight: 500,
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'all 0.2s ease',
      ...style
    }}
  >
    {children}
  </button>
);
