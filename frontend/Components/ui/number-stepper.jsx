import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '../../src/lib/utils.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const toNumeric = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default function NumberStepper({
  value,
  onChange,
  min = 0,
  step = 1,
  disabled = false,
  className,
  inputClassName,
  size = 'md',
  mobileFriendly = true,
  uomLabel = '',
  controlsPosition = 'right-vertical',
  allowEmpty = false,
}) {
  const currentValue = toNumeric(value, min);
  const normalizedStep = Number.isFinite(Number(step)) ? Math.max(Number(step), 1e-9) : 1;
  const normalizedMin = Number.isFinite(Number(min)) ? Number(min) : 0;

  const emitChange = (nextValue) => {
    if (allowEmpty && nextValue === '') {
      onChange?.('');
      return;
    }

    const numeric = toNumeric(nextValue, normalizedMin);
    onChange?.(Math.max(normalizedMin, numeric));
  };

  const handleIncrement = () => {
    emitChange(currentValue + normalizedStep);
  };

  const handleDecrement = () => {
    emitChange(currentValue - normalizedStep);
  };

  const handleInputChange = (event) => {
    const raw = event.target.value;
    if (allowEmpty && raw === '') {
      emitChange('');
      return;
    }
    emitChange(raw);
  };

  const handleInputKeyDown = (event) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      handleIncrement();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      handleDecrement();
    }
  };

  const isCompact = size === 'sm';
  const baseInputSizeClass = isCompact ? 'h-8' : 'h-10';
  const baseControlSizeClass = mobileFriendly
    ? (isCompact ? 'h-10 w-10 md:h-8 md:w-8' : 'h-11 w-11 md:h-9 md:w-9')
    : (isCompact ? 'h-8 w-8' : 'h-9 w-9');

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Input
        type="number"
        min={normalizedMin}
        step={normalizedStep}
        disabled={disabled}
        value={value ?? ''}
        onChange={handleInputChange}
        onKeyDown={handleInputKeyDown}
        className={cn(
          'w-28 min-w-[7rem] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          baseInputSizeClass,
          inputClassName
        )}
      />

      {uomLabel ? (
        <span className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {uomLabel}
        </span>
      ) : null}

      {controlsPosition === 'right-vertical' ? (
        <div className="flex flex-col items-center justify-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled}
            className={cn('rounded-md p-0 touch-manipulation', baseControlSizeClass)}
            onClick={handleIncrement}
            aria-label="Increase value"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled || currentValue <= normalizedMin}
            className={cn('rounded-md p-0 touch-manipulation', baseControlSizeClass)}
            onClick={handleDecrement}
            aria-label="Decrease value"
          >
            <Minus className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
