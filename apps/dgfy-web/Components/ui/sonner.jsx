import { Toaster as Sonner } from 'sonner'
import { isIminWrapperRuntime } from '../../src/utils/iminRuntimeFeedback.js'

const Toaster = ({ ...props }) => {
  const isIminPosRuntime = String(import.meta.env?.VITE_APP_SURFACE || '').trim().toLowerCase() === 'pos'
    && isIminWrapperRuntime();
  if (isIminPosRuntime) return null;

  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-white group-[.toaster]:text-slate-950 group-[.toaster]:border-slate-200 group-[.toaster]:shadow-lg',
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
