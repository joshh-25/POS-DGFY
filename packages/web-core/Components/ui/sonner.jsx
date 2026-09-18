import { Toaster as Sonner } from 'sonner'
import { isIminWrapperRuntime } from '../../src/utils/iminRuntimeFeedback.js'

const Toaster = ({ ...props }) => {
  const isIminPosRuntime = String(import.meta.env?.VITE_APP_SURFACE || '').trim().toLowerCase() === 'pos'
    && isIminWrapperRuntime();
  if (isIminPosRuntime) return null;

  return (
    <Sonner
      theme="light"
      richColors
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-white group-[.toaster]:text-slate-950 group-[.toaster]:border-slate-200 group-[.toaster]:shadow-lg',
          success:
            'group-[.toaster]:!bg-emerald-50 group-[.toaster]:!text-emerald-800 group-[.toaster]:!border-emerald-200',
          warning:
            'group-[.toaster]:!bg-amber-50 group-[.toaster]:!text-amber-800 group-[.toaster]:!border-amber-200',
          info:
            'group-[.toaster]:!bg-blue-50 group-[.toaster]:!text-blue-800 group-[.toaster]:!border-blue-200',
          error:
            'group-[.toaster]:!bg-red-50 group-[.toaster]:!text-red-800 group-[.toaster]:!border-red-200',
          description: 'group-[.toast]:text-slate-500',
          actionButton:
            'group-[.toast]:bg-slate-900 group-[.toast]:text-slate-50',
          cancelButton:
            'group-[.toast]:bg-slate-100 group-[.toast]:text-slate-500',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
