import { X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils.js';

const normalizeFields = (fields) => (Array.isArray(fields) ? fields : [])
  .filter((field) => field && field.label)
  .map((field) => ({
    ...field,
    value: field.value == null || field.value === '' ? '—' : field.value
  }));

export function PosTableDetailsSection({ title, fields, content, variant = 'default', index = 0 }) {
  const normalizedFields = normalizeFields(fields);
  const isReportsVariant = variant === 'reports';
  if (!normalizedFields.length && !content) return null;

  return (
    <section className={cn(
      'rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40',
      isReportsVariant && index === 0 && 'min-[768px]:rounded-none min-[768px]:border-0 min-[768px]:bg-transparent min-[768px]:p-0 min-[768px]:pt-0 min-[768px]:shadow-none',
      isReportsVariant && index > 0 && 'min-[768px]:rounded-none min-[768px]:border-x-0 min-[768px]:border-b-0 min-[768px]:border-t min-[768px]:border-slate-200 min-[768px]:bg-transparent min-[768px]:px-0 min-[768px]:pb-0 min-[768px]:pt-5 min-[768px]:shadow-none'
    )}>
      {title ? (
        <h3 className={cn(
          'mb-4 text-base font-black text-[#0F172A]',
          isReportsVariant && 'min-[768px]:mb-3 min-[768px]:text-[clamp(0.8125rem,0.9vw,1rem)]',
          isReportsVariant && title === 'Record details' && 'min-[768px]:hidden'
        )}>{title}</h3>
      ) : null}
      {normalizedFields.length ? (
        <dl className={cn(
          'grid gap-x-6 gap-y-4 sm:grid-cols-2',
          isReportsVariant && 'min-[768px]:gap-x-10 min-[768px]:gap-y-5'
        )}>
          {normalizedFields.map((field) => (
            <div key={field.key || field.label} className={`min-w-0 ${field.className || ''}`}>
              <dt className={cn(
                'text-xs font-semibold text-[#64748B]',
                isReportsVariant && 'min-[768px]:text-[clamp(0.75rem,0.8vw,0.8125rem)] min-[768px]:text-[#334155]'
              )}>{field.label}</dt>
              <dd className={cn(
                'mt-1 break-words text-sm font-semibold text-[#475569]',
                field.valueClassName,
                isReportsVariant && 'min-[768px]:text-[clamp(0.8125rem,0.9vw,0.9375rem)] min-[768px]:leading-5'
              )}>
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {content ? <div className={normalizedFields.length ? 'mt-4' : ''}>{content}</div> : null}
    </section>
  );
}

export default function PosTableDetailsDialog({
  open,
  onOpenChange,
  title = 'Details',
  subtitle = '',
  sections = [],
  footer = null,
  testId = 'pos-table-details-dialog',
  variant = 'default'
}) {
  const isReportsVariant = variant === 'reports';
  const visibleSections = (Array.isArray(sections) ? sections : []).filter((section) => normalizeFields(section?.fields).length || section?.content);

  return (
    <Dialog
      open={Boolean(open)}
      onOpenChange={onOpenChange}
      overlayClassName={isReportsVariant ? 'min-[768px]:backdrop-blur-md' : undefined}
    >
      <DialogContent
        data-testid={testId}
        className={cn(
          'flex max-h-[min(90vh,48rem)] w-[calc(100vw-1.5rem)] max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-0 shadow-2xl shadow-slate-950/25 sm:w-[calc(100vw-3rem)]',
          isReportsVariant && 'min-[768px]:max-h-[min(88vh,56rem)] min-[768px]:max-w-4xl min-[768px]:bg-white'
        )}
      >
        <DialogHeader className={cn(
          'shrink-0 border-b border-slate-200 bg-white px-5 py-4 text-left sm:px-6',
          isReportsVariant && 'min-[768px]:px-8 min-[768px]:py-6'
        )}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className={cn(
                'text-xl font-black leading-tight text-[#0F172A]',
                isReportsVariant && 'min-[768px]:text-[clamp(1.125rem,1.35vw,1.5rem)]'
              )}>{title}</DialogTitle>
              {subtitle ? (
                <DialogDescription className={cn(
                  'mt-1 truncate text-sm font-semibold text-slate-500',
                  isReportsVariant && 'min-[768px]:overflow-visible min-[768px]:text-clip min-[768px]:text-[clamp(0.8125rem,0.9vw,0.9375rem)] min-[768px]:whitespace-normal'
                )}>{subtitle}</DialogDescription>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              onClick={() => onOpenChange?.(false)}
              aria-label="Close details"
              title="Close details"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>
        </DialogHeader>

        <div className={cn(
          'min-h-0 flex-1 overflow-y-auto p-4 sm:p-5',
          isReportsVariant && 'min-[768px]:px-8 min-[768px]:py-6'
        )}>
          <div className={cn('space-y-4', isReportsVariant && 'min-[768px]:space-y-5')}>
            {visibleSections.map((section, index) => (
              <PosTableDetailsSection
                key={section.key || section.title || `details-section-${index}`}
                title={section.title}
                fields={section.fields}
                content={section.content}
                variant={variant}
                index={index}
              />
            ))}
          </div>
        </div>

        {footer ? (
          <DialogFooter className="shrink-0 border-t border-slate-200 bg-white px-5 py-3 sm:px-6 sm:py-4">
            {footer}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
