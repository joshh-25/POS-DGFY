import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../src/lib/utils.js'

const Popover = ({ open: controlledOpen, onOpenChange, children }) => {
  const [internalOpen, setInternalOpen] = useState(false)
  const triggerRef = useRef(null)

  const open = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setOpen = (val) => {
    if (onOpenChange) onOpenChange(val)
    setInternalOpen(val)
  }

  return (
    <PopoverContext.Provider value={{ open, setOpen, triggerRef }}>
      {children}
    </PopoverContext.Provider>
  )
}

const PopoverContext = React.createContext()

const PopoverTrigger = ({ asChild, children, className, ...props }) => {
  const { open, setOpen, triggerRef } = React.useContext(PopoverContext)

  return (
    <div
      ref={triggerRef}
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
  side = "bottom",
  sideOffset = 4,
  collisionPadding = 12,
  matchTriggerWidth = false,
  portal = false,
  children,
  style,
  ...props
}) => {
  const { open, setOpen, triggerRef } = React.useContext(PopoverContext)
  const contentRef = useRef(null)
  const [position, setPosition] = useState(null)

  useEffect(() => {
    const handlePointerDown = (event) => {
      const target = event.target
      const clickedContent = contentRef.current?.contains(target)
      const clickedTrigger = triggerRef?.current?.contains(target)
      if (!clickedContent && !clickedTrigger) {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener('mousedown', handlePointerDown)
      return () => document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [open, setOpen, triggerRef])

  useLayoutEffect(() => {
    if (!open || !portal) {
      setPosition(null)
      return undefined
    }

    const updatePosition = () => {
      const trigger = triggerRef?.current
      const content = contentRef.current
      if (!trigger || !content) return

      const triggerRect = trigger.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const padding = Math.max(0, Number(collisionPadding) || 0)
      const availableBelow = Math.max(0, viewportHeight - triggerRect.bottom - sideOffset - padding)
      const availableAbove = Math.max(0, triggerRect.top - sideOffset - padding)
      const measuredHeight = content.getBoundingClientRect().height || 320
      const placeBelow = side === 'top'
        ? false
        : side === 'bottom'
          ? availableBelow >= Math.min(measuredHeight, 180) || availableBelow >= availableAbove
          : availableBelow >= availableAbove
      const availableHeight = placeBelow ? availableBelow : availableAbove
      const height = Math.max(1, Math.min(measuredHeight, availableHeight || viewportHeight - padding * 2))
      const width = matchTriggerWidth
        ? Math.min(triggerRect.width, viewportWidth - padding * 2)
        : Math.min(content.getBoundingClientRect().width || 320, viewportWidth - padding * 2)

      let left = align === 'end'
        ? triggerRect.right - width
        : align === 'center'
          ? triggerRect.left + (triggerRect.width - width) / 2
          : triggerRect.left
      left = Math.max(padding, Math.min(left, viewportWidth - width - padding))

      const top = placeBelow
        ? triggerRect.bottom + sideOffset
        : Math.max(padding, triggerRect.top - height - sideOffset)

      setPosition({
        left,
        top,
        height,
        width
      })
    }

    updatePosition()
    const frame = window.requestAnimationFrame(updatePosition)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [align, collisionPadding, matchTriggerWidth, open, portal, side, sideOffset, triggerRef])

  if (!open) return null

  const content = (
    <div
      ref={contentRef}
      className={cn(
        "absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-white p-0 shadow-md outline-none",
        className
      )}
      style={portal ? {
        ...style,
        position: 'fixed',
        left: position ? `${position.left}px` : '-10000px',
        top: position ? `${position.top}px` : '-10000px',
        width: position ? `${position.width}px` : undefined,
        height: position ? `${position.height}px` : undefined,
        zIndex: portal ? 200 : style?.zIndex,
        visibility: position ? 'visible' : 'hidden'
      } : style}
      {...props}
    >
      {children}
    </div>
  )

  return portal && typeof document !== 'undefined'
    ? createPortal(content, document.body)
    : content
}

export { Popover, PopoverTrigger, PopoverContent }
