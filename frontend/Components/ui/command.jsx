import React, { useState, useEffect, useRef } from 'react'
import { Search } from 'lucide-react'
import { cn } from '../../src/lib/utils.js'

const Command = ({ className, children, ...props }) => {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-md bg-white text-slate-950",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

const CommandInput = ({ className, value, onValueChange, placeholder, ...props }) => {
  return (
    <div className="flex items-center border-b px-4">
      <Search className="mr-2 h-4 w-4 shrink-0 opacity-40" />
      <input
        className={cn(
          "flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
        placeholder={placeholder}
        {...props}
      />
    </div>
  )
}

const CommandList = ({ className, children, ...props }) => {
  return (
    <div
      className={cn("max-h-[300px] overflow-y-auto overflow-x-hidden", className)}
      {...props}
    >
      {children}
    </div>
  )
}

const CommandEmpty = ({ className, children, ...props }) => {
  return (
    <div
      className={cn("py-10 text-center text-sm text-slate-400", className)}
      {...props}
    >
      {children}
    </div>
  )
}

const CommandGroup = ({ className, heading, children, ...props }) => {
  return (
    <div
      className={cn(
        "overflow-hidden p-1 text-slate-950",
        className
      )}
      {...props}
    >
      {heading && (
        <div className="px-2 py-1.5 text-xs font-medium text-slate-500">
          {heading}
        </div>
      )}
      {children}
    </div>
  )
}

const CommandItem = ({ className, selected, onSelect, children, ...props }) => {
  return (
    <div
      className={cn(
        "relative flex cursor-pointer select-none items-center rounded-md px-3 py-3 text-sm outline-none transition-colors hover:bg-slate-50 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        selected && "bg-slate-100",
        className
      )}
      onClick={onSelect}
      {...props}
    >
      {children}
    </div>
  )
}

export {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
}
