import { Button } from '@/components/ui/button';

/**
 * Compact summary row for write-only PIN settings.
 * The row keeps the default state readable while leaving the owning feature in
 * control of the edit, reset, and save behavior.
 */
export default function PosPinSetupRow({
  title,
  description,
  status,
  statusClassName = 'bg-slate-100 text-slate-600',
  rowClassName = 'border-slate-200 bg-white',
  actionLabel,
  onAction,
  disabled = false,
  children
}) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${rowClassName}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[12px] font-extrabold text-[#0F172A]">{title}</p>
          <p className="mt-0.5 text-[11px] leading-4 text-[#536B8C]">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:justify-end">
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-extrabold ${statusClassName}`}>
            {status}
          </span>
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-lg border-[#1A4E8D] bg-[#1A4E8D] px-3 text-[12px] font-extrabold text-white hover:bg-[#143F73]"
            onClick={onAction}
            disabled={disabled}
          >
            {actionLabel}
          </Button>
        </div>
      </div>
      {children ? <div className="mt-3 border-t border-slate-100 pt-3">{children}</div> : null}
    </div>
  );
}
