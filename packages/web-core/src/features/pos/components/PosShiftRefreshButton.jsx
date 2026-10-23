import React from 'react';
import { RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  POS_SHIFT_PRIMARY_BUTTON_CLASS,
  POS_SHIFT_SECONDARY_BUTTON_CLASS
} from './posShiftButtonStyles.js';

export default function PosShiftRefreshButton({
  label = 'Refresh data',
  loading = false,
  disabled = false,
  onClick,
  className = '',
  heightClassName = 'h-11 min-h-11',
  appearance = 'primary',
  dataTestId
}) {
  const appearanceClass = appearance === 'secondary'
    ? POS_SHIFT_SECONDARY_BUTTON_CLASS
    : POS_SHIFT_PRIMARY_BUTTON_CLASS;

  return (
    <Button
      type="button"
      data-testid={dataTestId}
      aria-label={label}
      aria-busy={loading || undefined}
      title={label}
      className={`${heightClassName} w-11 shrink-0 rounded-lg border p-0 ${appearanceClass} ${className}`}
      onClick={onClick}
      disabled={disabled || loading}
    >
      <RefreshCcw
        className={`h-4 w-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`}
        aria-hidden="true"
      />
    </Button>
  );
}
