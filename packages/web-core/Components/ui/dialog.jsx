import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../src/lib/utils.js'

const DialogContext = createContext(null)

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

const Dialog = ({ open, onOpenChange, overlayClassName, children }) => {
  const rootRef = useRef(null)

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [open])

  if (!open) return null

  const dialog = (
    <DialogContext.Provider value={{ onOpenChange, rootRef }}>
      <div ref={rootRef} data-dialog-root="true" className="fixed inset-0 z-[100] flex items-center justify-center">
        <div
          data-dialog-overlay="true"
          className={cn('fixed inset-0 bg-slate-950/60 backdrop-blur-sm', overlayClassName)}
          onClick={() => onOpenChange && onOpenChange(false)}
        />
        {/*
          This wrapper -- not DialogContent's own className -- is what
          guarantees a dialog can never exceed the viewport, independent of
          whatever max-height utility a caller passes to DialogContent (often
          a `calc(100dvh - Nrem)` one). `max-h-full` resolves against this
          div's own `fixed inset-0` parent, whose height is set purely by
          top/right/bottom/left anchoring -- no vh/dvh unit involved, so unlike
          a `dvh` calc it can't silently fail to parse (and get dropped from
          the cascade entirely) on an older WebView. `flex flex-col` + the
          `min-h-0` added to DialogContent below is what turns that max-height
          into an actually-enforced constraint (a normal flex-shrink target)
          rather than a mere visual clip -- DialogContent's own header/body/
          footer flex layout then does the rest, exactly as it already does
          whenever its own max-height utility DOES survive.
        */}
        <div className="relative z-50 flex max-h-full min-h-0 w-full flex-col items-center">
          {children}
        </div>
      </div>
    </DialogContext.Provider>
  )

  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body)
}

const DialogContent = React.forwardRef(({ className, children, ...props }, ref) => {
  const contentRef = useRef(null)
  const dialogContext = useContext(DialogContext)
  const onOpenChange = dialogContext?.onOpenChange
  const rootRef = dialogContext?.rootRef

  useEffect(() => {
    const content = contentRef.current
    const root = rootRef?.current
    if (!content || !root) return undefined

    const getFocusableElements = () => Array.from(content.querySelectorAll(FOCUSABLE_SELECTOR))
      .filter((element) => element.getAttribute('aria-hidden') !== 'true')

    if (!content.contains(document.activeElement)) {
      const initialFocus = content.querySelector('[autofocus]') || getFocusableElements()[0] || content
      initialFocus.focus()
    }

    const handleKeyDown = (event) => {
      const openDialogs = Array.from(document.querySelectorAll('[data-dialog-root="true"]'))
      if (openDialogs[openDialogs.length - 1] !== root) return

      if (event.key === 'Escape' && onOpenChange) {
        event.preventDefault()
        onOpenChange(false)
        return
      }

      if (event.key !== 'Tab') return

      const focusableElements = getFocusableElements()
      if (focusableElements.length === 0) {
        event.preventDefault()
        content.focus()
        return
      }

      const firstFocusable = focusableElements[0]
      const lastFocusable = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement

      if (!content.contains(activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? lastFocusable : firstFocusable).focus()
      } else if (event.shiftKey && activeElement === firstFocusable) {
        event.preventDefault()
        lastFocusable.focus()
      } else if (!event.shiftKey && activeElement === lastFocusable) {
        event.preventDefault()
        firstFocusable.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [onOpenChange, rootRef])

  const setContentRef = useCallback((node) => {
    contentRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }, [ref])

  return (
    <div
      ref={setContentRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      className={cn(
        'relative min-h-0 bg-white rounded-2xl shadow-lg w-[calc(100vw-2rem)] max-w-lg max-h-[90vh] overflow-y-auto px-5 sm:w-full',
        className
      )}
      onClick={(e) => e.stopPropagation()}
      {...props}
    >
      {children}
    </div>
  )
})
DialogContent.displayName = 'DialogContent'

const DialogHeader = ({ className, ...props }) => {
  return (
    <div className={cn('flex flex-col space-y-1.5 p-6 pb-4', className)} {...props} />
  )
}

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <h2
      ref={ref}
      className={cn('text-2xl font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  )
})
DialogTitle.displayName = 'DialogTitle'

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <p
      ref={ref}
      className={cn('text-sm text-slate-500 mt-2', className)}
      {...props}
    />
  )
})
DialogDescription.displayName = 'DialogDescription'

const DialogFooter = ({ className, ...props }) => {
  return (
    <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-6 p-6 pt-8 pb-6', className)} {...props} />
  )
}

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter }
