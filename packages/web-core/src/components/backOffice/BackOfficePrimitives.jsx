import React from 'react';

const statusClass = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

const humanizeStatus = (value) => String(value || '—').replace(/_/g, ' ');

const renderCell = (column, row, emptyValue = '—') => {
    if (typeof column.render === 'function') return column.render(row);
    return row[column.key] ?? emptyValue;
};

const getRowKey = (row, index, rowKey) => (
    rowKey ? rowKey(row, index) : (row.id || row.key || index)
);

const reportToneClass = (tone) => {
    if (tone === 'positive') return 'border-emerald-200 bg-emerald-50/70';
    if (tone === 'negative') return 'border-rose-200 bg-rose-50/70';
    return 'border-slate-200 bg-white';
};

export const BackOfficeStatusPill = ({ value, fallback = 'unknown', className = '' }) => (
    <span className={`business-admin-status ${statusClass(value)} ${className}`.trim()}>
        {humanizeStatus(value || fallback)}
    </span>
);

export const BackOfficeMetric = ({ label, value, hint, tone = '', variant = 'business-admin' }) => {
    if (variant === 'reports') {
        return (
            <div className={`rounded-2xl border px-4 py-4 shadow-sm shadow-slate-200/70 ${reportToneClass(tone)}`}>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
                <p className="mt-2 text-[26px] font-black leading-none text-slate-950">{value}</p>
                {hint ? <p className="mt-2 text-xs font-medium text-slate-500">{hint}</p> : null}
            </div>
        );
    }

    return (
        <div className={`business-admin-card business-admin-metric ${tone}`}>
            <div className="business-admin-metric-label">{label}</div>
            <div className="business-admin-metric-value">{value}</div>
            {hint ? <div className="business-admin-metric-hint">{hint}</div> : null}
        </div>
    );
};

export const BackOfficeSectionCard = ({
    title,
    subtitle,
    children,
    action = null,
    actions = null,
    className = '',
    variant = 'business-admin'
}) => {
    const headerAction = actions ?? action;

    if (variant === 'reports') {
        return (
            <section className={`min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60 ${className}`}>
                <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
                    <h3 className="min-w-0 text-sm font-black text-slate-950">{title}</h3>
                    {headerAction}
                </div>
                {children}
            </section>
        );
    }

    return (
        <section className={`business-admin-card ${className}`}>
            <div className="business-admin-card-header">
                <div>
                    <div className="business-admin-card-title">{title}</div>
                    {subtitle ? <div className="business-admin-card-subtitle">{subtitle}</div> : null}
                </div>
                {headerAction}
            </div>
            <div className="business-admin-card-body flush">{children}</div>
        </section>
    );
};

export const BackOfficeEmptyState = ({
    message = 'No records match the current filters.',
    variant = 'business-admin'
}) => (
    <div className={variant === 'reports'
        ? 'rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center text-sm font-semibold text-slate-500'
        : 'business-admin-empty'}>
        {message}
    </div>
);

export const BackOfficeDataTable = ({
    columns = [],
    rows = [],
    rowKey,
    onRowClick,
    emptyMessage,
    emptyValue = '—',
    variant = 'business-admin'
}) => {
    if (variant === 'reports') {
        const reportEmptyMessage = emptyMessage || 'No rows found.';
        return (
            <div className="min-w-0 max-w-full">
                {rows.length > 0 ? (
                    <div className="grid min-w-0 gap-3 sm:hidden">
                        {rows.map((row, index) => (
                            <div key={`mobile-${getRowKey(row, index, rowKey)}`} className="min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                {columns.map((column) => (
                                    <div key={`mobile-${column.key}-${index}`} className="flex min-w-0 items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-b-0">
                                        <span className="min-w-0 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{column.label}</span>
                                        <span className="min-w-0 break-words text-right text-sm font-semibold text-slate-700">
                                            {renderCell(column, row, emptyValue)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="rounded-2xl border border-slate-200 px-4 py-10 text-center text-sm font-semibold text-slate-500 sm:hidden">
                        {reportEmptyMessage}
                    </div>
                )}

                <div className="hidden min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 sm:block">
                    <table className="w-full min-w-[720px] text-sm">
                        <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                            <tr>
                                {columns.map((column) => (
                                    <th key={column.key} className={`px-4 py-3 font-black ${column.align === 'right' ? 'text-right' : 'text-left'}`}>
                                        {column.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.length > 0 ? rows.map((row, index) => (
                                <tr key={getRowKey(row, index, rowKey)} className="text-slate-700">
                                    {columns.map((column) => (
                                        <td key={`${column.key}-${index}`} className={`px-4 py-3 ${column.align === 'right' ? 'text-right' : 'text-left'}`}>
                                            {renderCell(column, row, emptyValue)}
                                        </td>
                                    ))}
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={columns.length} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                                        {reportEmptyMessage}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    if (!rows.length) return <BackOfficeEmptyState message={emptyMessage} />;
    return (
        <div className="business-admin-table-wrap">
            <table className="business-admin-table">
                <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr key={getRowKey(row, index, rowKey)} onClick={onRowClick ? () => onRowClick(row) : undefined} style={onRowClick ? { cursor: 'pointer' } : undefined}>
                            {columns.map((column) => <td key={column.key}>{renderCell(column, row, emptyValue)}</td>)}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export const BackOfficeReportMetric = (props) => <BackOfficeMetric {...props} variant="reports" />;
export const BackOfficeReportSectionCard = (props) => <BackOfficeSectionCard {...props} variant="reports" />;
export const BackOfficeReportEmptyState = (props) => <BackOfficeEmptyState {...props} variant="reports" />;
export const BackOfficeReportDataTable = (props) => <BackOfficeDataTable {...props} variant="reports" />;
