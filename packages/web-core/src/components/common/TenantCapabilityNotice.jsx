export default function TenantCapabilityNotice({
  notice,
  className = 'mb-4',
  onDismiss
}) {
  if (!notice?.message) return null;

  return (
    <div className={`${className} rounded-xl border border-amber-200 bg-amber-50 px-4 py-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-900">
            {notice.title || 'Platform admin changed your permissions'}
          </p>
          <p className="mt-1 text-xs leading-5 text-amber-800">{notice.message}</p>
          {notice.code && (
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-amber-900/80">
              Reason code: {notice.code}
            </p>
          )}
        </div>
        {typeof onDismiss === 'function' && (
          <button
            type="button"
            className="shrink-0 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-semibold text-amber-900"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
