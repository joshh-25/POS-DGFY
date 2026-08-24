import React from 'react'
import { cn } from '../../src/lib/utils.js'

const Progress = React.forwardRef(({ className, indicatorClassName, value = 0, max = 100, ...props }, ref) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)

  return (
    <div
      ref={ref}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-slate-200', className)}
      {...props}
    >
      <div
        className={cn('h-full w-full flex-1 bg-teal-600 transition-all', indicatorClassName)}
        style={{ transform: `translateX(-${100 - percentage}%)` }}
      />
    </div>
  )
})
Progress.displayName = 'Progress'

export { Progress }

