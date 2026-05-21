import React, { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../src/lib/utils.js'

const Dialog = ({ open, onOpenChange, children }) => {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="fixed inset-0 bg-black/50" 
        onClick={() => onOpenChange && onOpenChange(false)}
      />
      <div className="relative z-50">
        {children}
      </div>
    </div>
  )
}

const DialogContent = React.forwardRef(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'relative bg-white rounded-2xl shadow-lg w-[calc(100vw-2rem)] max-w-lg max-h-[90vh] overflow-y-auto px-5 sm:w-full',
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
