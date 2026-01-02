import React, { useState, useEffect, useRef } from 'react'
import { cn } from '../../src/lib/utils.js'

const Popover = ({ children }) => {
  const [open, setOpen] = useState(false)

  return (
    <PopoverContext.Provider value={{ open, setOpen }}>
      {children}
    </PopoverContext.Provider>
  )
}

const PopoverContext = React.createContext()

const PopoverTrigger = ({ asChild, children, className, ...props }) => {
  const { open, setOpen } = React.useContext(PopoverContext)

  return (
    <div
      className={className}
      onClick={() => setOpen(!open)}
      {...props}
    >
      {children}
    </div>
  )
}

const PopoverContent = ({
  className,
  align = "center",
  sideOffset = 4,
  children,
  ...props
}) => {
  const { open, setOpen } = React.useContext(PopoverContext)
  const contentRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (contentRef.current && !contentRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, setOpen])

  if (!open) return null

  return (
    <div
      ref={contentRef}
      className={cn(
        "absolute z-50 mt-1 w-full rounded-md border border-slate-200 bg-white p-0 shadow-md outline-none",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export { Popover, PopoverTrigger, PopoverContent }
