import React from 'react'
import { cn } from '../../src/lib/utils.js'

const Input = React.forwardRef(({ className, type, onWheel, ...props }, ref) => {
  // Prevent scroll event from bubbling up when scrolling on a number input
  // This stops the modal/page from scrolling while the value changes
  const handleWheel = (e) => {
    if (type === 'number') {
      e.stopPropagation();
    }
    // Call any user-provided onWheel handler
    onWheel?.(e);
  };

  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      ref={ref}
      onWheel={handleWheel}
      {...props}
    />
  )
})
Input.displayName = 'Input'

export { Input }

