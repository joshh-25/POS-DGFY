import React, { useState, useRef, useEffect } from 'react'
import { cn } from '../../src/lib/utils.js'

const DropdownMenuContext = React.createContext()

const DropdownMenu = ({ children }) => {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target) && 
          triggerRef.current && !triggerRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen, triggerRef, menuRef }}>
      <div className="relative">{children}</div>
    </DropdownMenuContext.Provider>
  )
}

const DropdownMenuTrigger = React.forwardRef(({ className, children, asChild, ...props }, ref) => {
  const { setOpen, triggerRef } = React.useContext(DropdownMenuContext)
  
  return (
    <button
      ref={(node) => {
        triggerRef.current = node
        if (ref) ref.current = node
      }}
      type="button"
      onClick={() => setOpen(prev => !prev)}
      className={cn(className)}
      {...props}
    >
      {children}
    </button>
  )
})
DropdownMenuTrigger.displayName = 'DropdownMenuTrigger'

const DropdownMenuContent = React.forwardRef(({ className, align = 'end', ...props }, ref) => {
  const { open, menuRef } = React.useContext(DropdownMenuContext)
  
  if (!open) return null

  return (
    <div
      ref={(node) => {
        menuRef.current = node
        if (ref) ref.current = node
      }}
      className={cn(
        'absolute z-50 min-w-[8rem] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-md',
        align === 'end' ? 'right-0' : 'left-0',
        className
      )}
      {...props}
    />
  )
})
DropdownMenuContent.displayName = 'DropdownMenuContent'

const DropdownMenuItem = React.forwardRef(({ className, ...props }, ref) => {
  const { setOpen } = React.useContext(DropdownMenuContext)
  
  return (
    <div
      ref={ref}
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-slate-100 focus:bg-slate-100',
        className
      )}
      onClick={() => setOpen(false)}
      {...props}
    />
  )
})
DropdownMenuItem.displayName = 'DropdownMenuItem'

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem }

