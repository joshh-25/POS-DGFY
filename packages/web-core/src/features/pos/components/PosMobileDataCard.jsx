import { cn } from '@/lib/utils.js';

const resolveAlignment = (align) => {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return 'text-left';
};

/** Shared compact record card for dense POS data on narrow viewports. */
export default function PosMobileDataCard({
  title,
  titleLabel,
  titleClassName,
  fields = [],
  fieldLayout = 'rows',
  action = null,
  details = null,
  detailsId,
  detailsLabel,
  expanded = false,
  className
}) {
  const isMetricGrid = fieldLayout === 'metrics';

  return (
    <article className={cn('min-w-0 rounded-xl border border-slate-200 bg-white p-3', className)}>
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          {titleLabel ? (
            <p className="text-[11px] font-semibold leading-4 text-slate-500">{titleLabel}</p>
          ) : null}
          <div className={cn(
            'break-words text-[13px] font-bold leading-5 text-slate-950',
            titleClassName
          )}>{title ?? '—'}</div>
        </div>
        {action ? <div className="flex shrink-0 items-start">{action}</div> : null}
      </div>

      {fields.length > 0 ? (
        <dl className={cn(
          'mt-2 border-t border-slate-100',
          isMetricGrid ? 'grid grid-cols-2 gap-y-3 pt-3' : 'space-y-1.5 pt-2'
        )}>
          {fields.map((field, index) => (
            <div
              key={field.key}
              className={cn(
                'min-w-0',
                isMetricGrid && fields.length > 1 && index === 0 && 'border-r border-slate-200 pr-4',
                isMetricGrid && fields.length > 1 && index === 1 && 'pl-4',
                !isMetricGrid && cn(
                  'grid items-start gap-2',
                  field.labelNoWrap
                    ? 'grid-cols-[max-content_minmax(0,1fr)]'
                    : 'grid-cols-[minmax(5.5rem,0.42fr)_minmax(0,1fr)]'
                )
              )}
            >
              <dt className={cn(
                'min-w-0 break-words text-[11px] font-medium leading-4 text-slate-500',
                field.labelNoWrap && 'whitespace-nowrap'
              )}>
                {field.label}
              </dt>
              <dd className={cn(
                'min-w-0 break-words',
                isMetricGrid
                  ? cn('mt-1 text-left text-[17px] font-extrabold leading-6', field.valueClassName || 'text-slate-950', field.numeric && 'tabular-nums')
                  : cn(
                      'text-[12px] leading-4',
                      field.valueClassName || 'text-slate-700',
                      resolveAlignment(field.align),
                      field.numeric || field.align === 'right' || field.align === 'center'
                        ? 'font-semibold tabular-nums'
                        : 'font-medium'
                    )
              )}>
                {field.value ?? '—'}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {details ? (
        <div
          id={detailsId}
          role="region"
          aria-label={detailsLabel}
          hidden={!expanded}
          className="mt-2 border-t border-slate-100 pt-2"
        >
          {details}
        </div>
      ) : null}
    </article>
  );
}
