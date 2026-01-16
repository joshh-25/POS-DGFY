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

  const handleClick = () => setOpen(prev => !prev)
  const handleRef = (node) => {
    triggerRef.current = node
    if (ref) ref.current = node
  }

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      ref: handleRef,
      onClick: (e) => {
        handleClick()
        if (children.props.onClick) {
          children.props.onClick(e)
        }
      },
      className: cn(className, children.props.className),
      ...props
    })
  }

  return (
    <button
      ref={handleRef}
      type="button"
      onClick={handleClick}
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

const DropdownMenuItem = React.forwardRef(({ className, asChild, children, ...props }, ref) => {
  const { setOpen } = React.useContext(DropdownMenuContext)

  const handleClick = (e) => {
    setOpen(false)
    if (props.onClick) {
      props.onClick(e)
    }
  }

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      ref,
      onClick: (e) => {
        handleClick(e)
        if (children.props.onClick) {
          children.props.onClick(e)
        }
      },
      className: cn(
        'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm text-slate-900 outline-none transition-colors hover:bg-slate-100 focus:bg-slate-100 [&_svg]:text-slate-700',
        className,
        children.props.className
      )
    })
  }

  return (
    <div
      ref={ref}
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm text-slate-900 outline-none transition-colors hover:bg-slate-100 focus:bg-slate-100 [&_svg]:text-slate-700',
        className
      )}
      onClick={handleClick}
      {...props}
    >
      {children}
    </div>
  )
})
DropdownMenuItem.displayName = 'DropdownMenuItem'

const DropdownMenuLabel = React.forwardRef(({ className, inset, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "px-2 py-1.5 text-sm font-semibold text-slate-900",
      inset && "pl-8",
      className
    )}
    {...props}
  />
))
DropdownMenuLabel.displayName = "DropdownMenuLabel"

const DropdownMenuSeparator = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-slate-100", className)}
    {...props}
  />
))
DropdownMenuSeparator.displayName = "DropdownMenuSeparator"

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator }

