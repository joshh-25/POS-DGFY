import React from 'react'
import { cn } from '../../src/lib/utils.js'

const Badge = React.forwardRef(({ className, variant = 'default', ...props }, ref) => {
  const variants = {
    default: 'bg-slate-100 text-slate-800 border-slate-200',
    secondary: 'bg-slate-100 text-slate-800',
    outline: 'border border-slate-300 text-slate-800',
  }

  return (
    <div
      ref={ref}
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
        variants[variant],
        className
      )}
      {...props}
    />
  )
})
Badge.displayName = 'Badge'

export { Badge }

