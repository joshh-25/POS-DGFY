import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

const BASE_INPUT_STYLE = {
  height: 42,
  width: '100%',
  borderRadius: 10,
  border: '1px solid #CBD5E1',
  background: '#fff',
  fontSize: 14,
  color: '#0F172A',
  padding: '0 40px 0 12px',
  boxSizing: 'border-box'
};

export default function StorefrontPasswordInput({
  id,
  name,
  value,
  onChange,
  placeholder,
  autoComplete,
  disabled,
  required = true
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        style={BASE_INPUT_STYLE}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        disabled={disabled}
        style={{
          position: 'absolute',
          right: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          border: 'none',
          background: 'none',
          color: '#64748B',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          padding: 0
        }}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
