import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';

export default function DgfyPasswordInput({
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
    <div className="relative">
      <Input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        className="pr-11"
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800"
        aria-label={visible ? 'Hide password' : 'Show password'}
        disabled={disabled}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
