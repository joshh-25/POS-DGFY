import React, { useState, useRef, useEffect } from 'react'
import { cn } from '../../src/lib/utils.js'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'

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
  const optionLabel = getSelectedOptionLabel(selectContent?.props?.children, selectedValue)

  return (
    <SelectContext.Provider value={{
      open,
      setOpen,
      selectedValue,
      selectedLabel: optionLabel ?? selectedLabel,
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
          'flex h-10 w-full items-center justify-between rounded-lg border border-[#C7DCF3] bg-white px-3 py-2 text-sm text-[#0F172A] ring-offset-white placeholder:text-slate-500 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1A4E8D]/20 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        aria-expanded={open}
        {...props}
      >
        {children || <span className="text-slate-500">Select...</span>}
        {open ? <ChevronUp className="h-4 w-4 text-[#1A4E8D]" /> : <ChevronDown className="h-4 w-4 text-[#1A4E8D]" />}
      </button>
      {open && selectContent && (
        <div ref={menuRef} className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-[#C7DCF3] bg-white shadow-lg shadow-slate-900/10">
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
      role="option"
      aria-selected={selectedValue === value}
      className={cn(
        'relative flex min-h-9 cursor-pointer select-none items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-[#0F172A] outline-none transition-colors hover:bg-[#EFF6FF] focus:bg-[#EFF6FF]',
        selectedValue === value && 'bg-[#EAF2FC] font-semibold text-[#1A4E8D]',
        className
      )}
      {...props}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {selectedValue === value ? <Check className="h-4 w-4 shrink-0 text-[#1A4E8D]" aria-hidden="true" /> : null}
    </div>
  )
})
SelectItem.displayName = 'SelectItem'

function getSelectedOptionLabel(children, targetValue) {
  let match
  React.Children.forEach(children, (child) => {
    if (match !== undefined || !React.isValidElement(child)) return
    if (child.type === SelectItem && child.props.value === targetValue) {
      match = child.props.children
      return
    }
    if (child.props.children) {
      match = getSelectedOptionLabel(child.props.children, targetValue)
    }
  })
  return match
}

const SelectValue = ({ placeholder, children, ...props }) => {
  const { selectedLabel, selectedValue } = React.useContext(SelectContext)
  return <span {...props}>{children || selectedLabel || selectedValue || placeholder}</span>
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
