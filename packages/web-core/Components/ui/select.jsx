import React, { useState, useRef, useEffect } from 'react'
import { cn } from '../../src/lib/utils.js'
import { ChevronDown } from 'lucide-react'

const SelectContext = React.createContext()

const Select = ({ children, value, onValueChange, ...props }) => {
  const [open, setOpen] = useState(false)
  const [selectedValue, setSelectedValue] = useState(value || '')
  const [selectedLabel, setSelectedLabel] = useState('')
  const [items, setItems] = useState({})

  // Sync selectedValue with value prop when it changes externally
  useEffect(() => {
    if (value !== undefined && value !== selectedValue) {
      setSelectedValue(value)
      // If we already have the label for this value, update selectedLabel
      if (items[value]) {
        setSelectedLabel(items[value])
      }
    }
  }, [value, items])

  const registerItem = (val, label) => {
    setItems(prev => {
      if (prev[val] === label) return prev;
      return { ...prev, [val]: label };
    });
    if (val === selectedValue) {
      setSelectedLabel(label);
    }
  };

  const handleValueChange = (newValue, newLabel) => {
    setSelectedValue(newValue)
    setSelectedLabel(newLabel)
    setOpen(false)
    if (onValueChange) onValueChange(newValue)
  }

  // Find SelectContent from Select's children (not SelectTrigger's children)
  const childrenArray = React.Children.toArray(children)
  const selectContent = childrenArray.find(child => {
    return React.isValidElement(child) && child.type === SelectContent
  })

  return (
    <SelectContext.Provider value={{
      open,
      setOpen,
      selectedValue,
      selectedLabel,
      handleValueChange,
      selectContent,
      registerItem
    }}>
      <div className="relative" {...props}>
        {children}
      </div>
    </SelectContext.Provider>
  )
}

const SelectTrigger = React.forwardRef(({ className, children, ...props }, ref) => {
  const contextValue = React.useContext(SelectContext)
  const { open, setOpen, selectedValue, selectContent } = contextValue
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
  }, [open, setOpen])

  return (
    <>
      <button
        ref={(node) => {
          triggerRef.current = node
          if (ref) ref.current = node
        }}
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      >
        {children || <span className="text-slate-500">Select...</span>}
        <ChevronDown className="h-4 w-4 opacity-50" />
      </button>
      {open && selectContent && (
        <div ref={menuRef} className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          <SelectContext.Provider value={{ ...contextValue, menuOpen: true }}>
            {selectContent}
          </SelectContext.Provider>
        </div>
      )}
    </>
  )
})
SelectTrigger.displayName = 'SelectTrigger'

const SelectContent = ({ children, className, ...props }) => {
  const { menuOpen } = React.useContext(SelectContext)
  if (!menuOpen) return null

  return (
    <div className={cn('p-1', className)} {...props}>
      {children}
    </div>
  )
}

const SelectItem = React.forwardRef(({ className, children, value, ...props }, ref) => {
  const { handleValueChange, selectedValue, registerItem } = React.useContext(SelectContext)

  useEffect(() => {
    if (value !== undefined && children) {
      registerItem(value, children);
    }
  }, [value, children]);

  return (
    <div
      ref={ref}
      onClick={() => handleValueChange(value, children)}
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-slate-100 focus:bg-slate-100',
        selectedValue === value && 'bg-slate-100',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
})
SelectItem.displayName = 'SelectItem'

const SelectValue = ({ placeholder, children, ...props }) => {
  const { selectedLabel, selectedValue } = React.useContext(SelectContext)
  return <span {...props}>{children || selectedLabel || selectedValue || placeholder}</span>
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }

