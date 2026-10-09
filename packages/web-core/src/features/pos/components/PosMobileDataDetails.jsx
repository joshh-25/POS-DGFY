import { cn } from '@/lib/utils.js';

/** Label/value rows used by the Reports and Shift mobile record cards. */
export default function PosMobileDataDetails({ fields = [], className }) {
  return (
    <dl className={cn('space-y-1.5 text-[11px] leading-4', className)}>
      {fields.map((field, index) => (
        <div
          key={field.key || `mobile-detail-${index}`}
          className="grid min-w-0 grid-cols-[minmax(5.5rem,0.42fr)_minmax(0,1fr)] items-start gap-2"
        >
          <dt className="min-w-0 break-words text-[#64748B]">
            {field.label || field.key || 'Details'}
          </dt>
          <dd className={cn('min-w-0 break-words text-right font-medium text-[#475569]', field.valueClassName)}>
            {field.value ?? '—'}
          </dd>
        </div>
      ))}
    </dl>
  );
}
