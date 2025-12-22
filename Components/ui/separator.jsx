import React from 'react'
import { cn } from '../../src/lib/utils.js'

const Separator = React.forwardRef(({ className, orientation = 'horizontal', ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'shrink-0 bg-slate-200',
        orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
        className
      )}
      {...props}
    />
  )
})
Separator.displayName = 'Separator'

export { Separator }

