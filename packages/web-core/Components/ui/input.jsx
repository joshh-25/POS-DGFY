import React from 'react'
import { cn } from '../../src/lib/utils.js'

const Input = React.forwardRef(({ className, type, onWheel, onKeyDown, ...props }, ref) => {
  const isNumberInput = type === 'number'

  // Number fields are manually entered in POS. Prevent browser wheel and
  // arrow-key increments so a focused amount cannot change accidentally.
  const handleWheel = (e) => {
    if (isNumberInput) {
      e.preventDefault();
      e.stopPropagation();
    }
    // Call any user-provided onWheel handler
    onWheel?.(e);
  };

  const handleKeyDown = (e) => {
    if (isNumberInput && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
    }
    onKeyDown?.(e);
  };

  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        isNumberInput && 'dgfy-number-input',
        className
      )}
      ref={ref}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      {...props}
    />
  )
})
Input.displayName = 'Input'

export { Input }
