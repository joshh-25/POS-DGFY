import React from 'react'
import { Check } from 'lucide-react'
import { cn } from '../../src/lib/utils.js'

const Checkbox = React.forwardRef(({ className, checked, onCheckedChange, ...props }, ref) => {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      ref={ref}
      onClick={() => onCheckedChange && onCheckedChange(!checked)}
      className={cn(
        'peer h-4 w-4 shrink-0 rounded-sm border border-slate-300 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-teal-600 text-white border-teal-600' : 'bg-white',
        className
      )}
      {...props}
    >
      {checked && <Check className="h-4 w-4" />}
    </button>
  )
})
Checkbox.displayName = 'Checkbox'

export { Checkbox }

