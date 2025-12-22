import React from 'react'
import { cn } from '../../src/lib/utils.js'

const Slider = React.forwardRef(({ className, value, onValueChange, min = 0, max = 100, step = 1, ...props }, ref) => {
  // Handle array values (extract first element if array) or single number
  const sliderValue = Array.isArray(value) ? value[0] : value
  
  // Use nullish coalescing to properly handle 0 values (not falsy check)
  const currentValue = sliderValue ?? min

  const handleChange = (e) => {
    const newValue = parseFloat(e.target.value)
    if (onValueChange) {
      // Call onValueChange with array to match expected API pattern
      onValueChange([newValue])
    }
  }

  return (
    <input
      type="range"
      ref={ref}
      min={min}
      max={max}
      step={step}
      value={currentValue}
      onChange={handleChange}
      className={cn(
        'w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer',
        'accent-teal-600',
        className
      )}
      {...props}
    />
  )
})
Slider.displayName = 'Slider'

export { Slider }

