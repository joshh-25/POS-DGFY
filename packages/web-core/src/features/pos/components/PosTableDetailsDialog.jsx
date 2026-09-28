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

export function PosTableDetailsSection({ title, fields }) {
  const normalizedFields = normalizeFields(fields);
  if (!normalizedFields.length) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40">
      {title ? <h3 className="mb-4 text-base font-black text-[#0F172A]">{title}</h3> : null}
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {normalizedFields.map((field) => (
          <div key={field.key || field.label} className={`min-w-0 ${field.className || ''}`}>
            <dt className="text-xs font-semibold text-[#64748B]">{field.label}</dt>
            <dd className={cn('mt-1 break-words text-sm font-semibold text-[#475569]', field.valueClassName)}>
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
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
  testId = 'pos-table-details-dialog'
}) {
  const visibleSections = (Array.isArray(sections) ? sections : []).filter((section) => normalizeFields(section?.fields).length);

  return (
    <Dialog open={Boolean(open)} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid={testId}
        className="flex max-h-[min(90vh,48rem)] w-[calc(100vw-1.5rem)] max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-0 shadow-2xl shadow-slate-950/25 sm:w-[calc(100vw-3rem)]"
      >
        <DialogHeader className="shrink-0 border-b border-slate-200 bg-white px-5 py-4 text-left sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="text-xl font-black leading-tight text-[#0F172A]">{title}</DialogTitle>
              {subtitle ? <DialogDescription className="mt-1 truncate text-sm font-semibold text-slate-500">{subtitle}</DialogDescription> : null}
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

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="space-y-4">
            {visibleSections.map((section, index) => (
              <PosTableDetailsSection
                key={section.key || section.title || `details-section-${index}`}
                title={section.title}
                fields={section.fields}
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
