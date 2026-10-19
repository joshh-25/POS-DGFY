import React from 'react';
import { Code2, Copy, Eye, FileText } from 'lucide-react';
import PosMobileDataCard from './PosMobileDataCard.jsx';
import PosTableActionButton from './PosTableActionButton.jsx';
import PosTableSurface, { POS_TABLE_HEADER_CLASS, POS_TABLE_ROW_CLASS } from './PosTableSurface.jsx';

const AUDIT_TABLE_HEADER_CELL_CLASS = 'whitespace-normal px-2.5 text-left text-[13px] font-black uppercase leading-tight tracking-wide';
const AUDIT_TABLE_ACTION_HEADER_CELL_CLASS = 'whitespace-normal px-2.5 text-center text-[13px] font-black uppercase leading-tight tracking-wide';
const AUDIT_TABLE_CELL_CLASS = 'px-2.5 py-4 text-left text-[13px] leading-4 text-[#334155] align-middle';
const AUDIT_TABLE_ACTION_CELL_CLASS = 'px-2.5 py-4 text-center text-[13px] leading-4 text-[#334155] align-middle';

const formatAuditPayload = (changes, parseAuditChanges) => {
    try {
        return JSON.stringify(parseAuditChanges(changes), null, 2);
    } catch {
        return '{}';
    }
};

function AuditEntryDetails({ entry, rowKey, locations, copiedLogId, onCopy, presentation }) {
    const readableFields = presentation.getAuditReadableDetailFields(entry, locations);
    const readableDetailsGridClassName = presentation.getAuditReadableDetailGridClassName(readableFields.length);
    const payload = formatAuditPayload(entry?.changes, presentation.parseAuditChanges);
    const payloadFileName = presentation.getAuditPayloadFileName(entry);
    const parsedChanges = presentation.parseAuditChanges(entry?.changes);
    const hasStructuredChanges = Object.keys(parsedChanges).length > 0;

    return (
        <div data-testid={`pos-audit-details-${rowKey}`} className="pos-audit-entry-details w-full">
            <div className="flex flex-wrap items-center justify-between gap-2 min-[768px]:gap-3">
                <div className="flex items-center gap-2 text-[12px] font-black uppercase tracking-wide text-[#475569] min-[768px]:text-[13px]">
                    <FileText className="h-3.5 w-3.5 text-[#1A4E8D] min-[768px]:h-4 min-[768px]:w-4" aria-hidden="true" />
                    Readable event details
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#B8D7FF] bg-[#EFF6FF] px-2 py-1 text-[10px] font-extrabold text-[#1A4E8D] min-[768px]:px-2.5 min-[768px]:text-[11px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#1A4E8D]" aria-hidden="true" />
                    {hasStructuredChanges ? 'Parsed' : 'No structured fields'}
                </span>
            </div>

            {readableFields.length > 0 ? (
                <div className={`mt-3 grid gap-2 min-[768px]:mt-4 min-[768px]:gap-3 ${readableDetailsGridClassName}`}>
                    {readableFields.map(({ key, label, value, Icon }) => (
                        <div key={key} className="min-w-0 rounded-lg border border-[#DCE7F2] bg-[#FBFCFE] px-3 py-2.5 min-[768px]:px-3.5 min-[768px]:py-3">
                            <p className="text-[10px] font-black uppercase tracking-wide text-[#71839D] min-[768px]:text-[11px]">{label}</p>
                            <div className="mt-1 flex min-w-0 items-center gap-2 text-[12px] font-extrabold text-[#334155] min-[768px]:mt-2 min-[768px]:text-[13px]">
                                <Icon className="h-3.5 w-3.5 shrink-0 text-[#9AAAC0] min-[768px]:h-4 min-[768px]:w-4" aria-hidden="true" />
                                <span className="min-w-0 break-words">{value}</span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="mt-3 rounded-lg border border-dashed border-[#DCE7F2] bg-[#FBFCFE] px-3 py-2.5 text-[11px] text-[#71839D] min-[768px]:mt-4 min-[768px]:px-3.5 min-[768px]:py-3 min-[768px]:text-[12px]">
                    No readable fields were returned for this event.
                </div>
            )}

            <div className="mt-3 border-t border-slate-100 pt-3 min-[768px]:mt-5 min-[768px]:pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2 min-[768px]:gap-3">
                    <div className="flex items-center gap-2 text-[12px] font-black uppercase tracking-wide text-[#475569] min-[768px]:text-[13px]">
                        <Code2 className="h-3.5 w-3.5 text-[#64748B] min-[768px]:h-4 min-[768px]:w-4" aria-hidden="true" />
                        Technical payload
                    </div>
                    <div className="flex min-w-0 max-w-full basis-full flex-1 items-center justify-end gap-2 min-[768px]:basis-auto min-[768px]:flex-none">
                        <span className="inline-flex min-h-8 min-w-0 flex-1 items-center gap-1 truncate rounded-md border border-slate-200 bg-slate-50 px-2 text-[10px] font-semibold text-slate-500 min-[768px]:flex-none">
                            <Code2 className="h-3 w-3 text-[#9AAAC0]" aria-hidden="true" />
                            <span className="min-w-0 truncate" title={payloadFileName}>{payloadFileName}</span>
                        </span>
                        <button
                            type="button"
                            onClick={() => onCopy(payload, rowKey)}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center gap-1 rounded-md bg-[#1A4E8D] px-0 text-[11px] font-extrabold text-white shadow-sm hover:bg-[#143F73] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50 min-[768px]:w-auto min-[768px]:px-2.5"
                            disabled={!payload}
                            aria-label={copiedLogId === rowKey ? 'Audit payload copied' : 'Copy audit payload'}
                            title={copiedLogId === rowKey ? 'Audit payload copied' : 'Copy audit payload'}
                        >
                            <Copy className="h-3 w-3" aria-hidden="true" />
                            <span className="sr-only min-[768px]:not-sr-only">{copiedLogId === rowKey ? 'Copied' : 'Copy'}</span>
                        </button>
                    </div>
                </div>
                <div className="mt-2 overflow-hidden rounded-lg border border-[#243451] bg-[#0F172A] min-[768px]:mt-3">
                    <div className="flex items-center justify-between border-b border-[#1E2B45] px-3 py-2">
                        <div className="flex items-center gap-1.5" aria-hidden="true">
                            <span className="h-2.5 w-2.5 rounded-full bg-[#33445F]" />
                            <span className="h-2.5 w-2.5 rounded-full bg-[#33445F]" />
                            <span className="h-2.5 w-2.5 rounded-full bg-[#33445F]" />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#8290A8]">application/json</span>
                    </div>
                    <pre className="max-h-48 overflow-auto p-3 text-[11px] leading-4 text-[#B7CAE8] min-[768px]:max-h-72 min-[768px]:p-4 min-[768px]:text-[12px] min-[768px]:leading-5">{payload}</pre>
                </div>
            </div>
        </div>
    );
}

function AuditEventCell({ entry, presentation }) {
    const EventIcon = presentation.getAuditEventIcon(entry);
    const toneClassName = presentation.getAuditEventTone(entry);
    return (
        <div className={`flex min-w-0 items-start gap-2.5 font-semibold ${toneClassName}`}>
            {React.createElement(EventIcon, { className: 'mt-0.5 h-4 w-4 shrink-0', 'aria-hidden': true })}
            <span className="min-w-0 break-words">{presentation.formatAuditEventLabel(entry)}</span>
        </div>
    );
}

function AuditTimestampCell({ value, presentation }) {
    const { date, time } = presentation.formatAuditDateParts(value);
    return (
        <span className="audit-timestamp-value">
            <span>{date}</span>
            {time ? (
                <>
                    <span className="audit-timestamp-divider" aria-hidden="true"> · </span>
                    <span className="audit-timestamp-time">{time}</span>
                </>
            ) : null}
        </span>
    );
}

function AuditMobileCard({ entry, rowKey, expanded, locations, copiedLogId, onCopy, onToggle, presentation }) {
    const context = presentation.getAuditContext(entry);
    const actorValue = (
        <span className="flex min-w-0 flex-col items-end gap-0.5 text-right">
            <span className="font-semibold text-[#334155]">{presentation.getAuditActor(entry)}</span>
            {context.length > 0 ? <span className="text-[11px] leading-4 text-[#71839D]">{context.join(' · ')}</span> : null}
        </span>
    );
    return (
        <PosMobileDataCard
            title={<AuditEventCell entry={entry} presentation={presentation} />}
            fields={[
                { key: 'actor', label: 'Actor & terminal', value: actorValue, align: 'right' },
                { key: 'timestamp', label: 'Timestamp', value: presentation.formatAuditDate(entry.timestamp), align: 'right', valueClassName: 'font-semibold tabular-nums text-[#475569]' }
            ]}
            action={(
                <PosTableActionButton
                    icon={Eye}
                    onClick={() => onToggle(rowKey)}
                    aria-expanded={expanded}
                    aria-controls={`pos-audit-details-mobile-${rowKey}`}
                    aria-label={`${expanded ? 'Hide' : 'View'} details for ${presentation.formatAuditEventLabel(entry)}`}
                    title={`${expanded ? 'Hide' : 'View'} audit details`}
                />
            )}
            details={<AuditEntryDetails entry={entry} rowKey={rowKey} locations={locations} copiedLogId={copiedLogId} onCopy={onCopy} presentation={presentation} />}
            detailsId={`pos-audit-details-mobile-${rowKey}`}
            detailsLabel={`Details for ${presentation.formatAuditEventLabel(entry)}`}
            expanded={expanded}
            className="rounded-xl"
        />
    );
}

export default function AuditWorkspaceResults({ logs, loading, totalItems, expandedRowKey, locations, copiedLogId, onCopy, onToggle, presentation }) {
    return (
        <PosTableSurface className="pos-audit-results-surface overflow-hidden">
            <p className="sr-only" aria-live="polite">{loading ? 'Loading audit history.' : `Showing ${totalItems} audit entries, newest first.`}</p>
            {logs.length === 0 && !loading ? <div className="p-10 text-center text-sm text-slate-500">No audit entries match these filters.</div> : null}
            {loading && logs.length === 0 ? <div className="p-10 text-center text-sm font-semibold text-slate-500" role="status">Loading audit history...</div> : null}
            {logs.length > 0 ? (
                <>
                    <div className="hidden min-[768px]:block overflow-x-auto">
                        <table data-testid="pos-audit-table" aria-label="POS audit log table" className="pos-audit-data-table w-full min-w-0 table-fixed border-collapse text-left text-[13px]">
                            <colgroup>
                                <col className="w-[44%]" />
                                <col className="w-[20%]" />
                                <col className="w-[20%]" />
                                <col className="w-[16%]" />
                            </colgroup>
                            <thead className={`${POS_TABLE_HEADER_CLASS} sticky top-0 z-10`}>
                                <tr className="h-12">
                                    <th scope="col" className={AUDIT_TABLE_HEADER_CELL_CLASS}>Event &amp; Type</th>
                                    <th scope="col" className={AUDIT_TABLE_HEADER_CELL_CLASS}>Actor &amp; Terminal</th>
                                    <th scope="col" className={AUDIT_TABLE_HEADER_CELL_CLASS}>Timestamp</th>
                                    <th scope="col" className={AUDIT_TABLE_ACTION_HEADER_CELL_CLASS}>Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((entry, entryIndex) => {
                                    const rowKey = entry.log_id ?? `row-${entryIndex}`;
                                    const expanded = expandedRowKey === rowKey;
                                    const context = presentation.getAuditContext(entry);
                                    return (
                                        <React.Fragment key={rowKey}>
                                            <tr id={`pos-audit-row-${rowKey}`} data-testid={`pos-audit-row-${rowKey}`} className={`${POS_TABLE_ROW_CLASS} ${expanded ? 'bg-[#F8FBFF]' : 'bg-white'}`}>
                                                <td className={AUDIT_TABLE_CELL_CLASS}><AuditEventCell entry={entry} presentation={presentation} /></td>
                                                <td className={AUDIT_TABLE_CELL_CLASS}>
                                                    <div className="font-semibold">{presentation.getAuditActor(entry)}</div>
                                                    {context.length > 0 ? <div className="mt-0.5 text-[12px] text-[#71839D]">{context.join(' · ')}</div> : null}
                                                </td>
                                                <td className={`${AUDIT_TABLE_CELL_CLASS} whitespace-nowrap font-semibold tabular-nums text-[#71839D]`}><AuditTimestampCell value={entry.timestamp} presentation={presentation} /></td>
                                                <td className={AUDIT_TABLE_ACTION_CELL_CLASS}>
                                                    <div className="flex w-full items-center justify-center">
                                                        <PosTableActionButton
                                                            icon={Eye}
                                                            onClick={() => onToggle(rowKey)}
                                                            aria-expanded={expanded}
                                                            aria-controls={`pos-audit-details-${rowKey}`}
                                                            aria-label={`${expanded ? 'Hide' : 'View'} details for ${presentation.formatAuditEventLabel(entry)}`}
                                                            title={`${expanded ? 'Hide' : 'View'} audit details`}
                                                            data-testid={`pos-audit-view-${rowKey}`}
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                            {expanded ? (
                                                <tr data-testid={`pos-audit-expanded-row-${rowKey}`} className="border-t border-blue-50 bg-slate-50/70">
                                                    <td colSpan={4} className="px-4 py-3"><AuditEntryDetails entry={entry} rowKey={rowKey} locations={locations} copiedLogId={copiedLogId} onCopy={onCopy} presentation={presentation} /></td>
                                                </tr>
                                            ) : null}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div data-testid="pos-audit-mobile-records" className="pos-audit-mobile-records grid gap-2 p-2 min-[768px]:hidden">
                        {logs.map((entry, entryIndex) => {
                            const rowKey = entry.log_id ?? `row-${entryIndex}`;
                            return (
                                <AuditMobileCard
                                    key={rowKey}
                                    entry={entry}
                                    rowKey={rowKey}
                                    expanded={expandedRowKey === rowKey}
                                    locations={locations}
                                    copiedLogId={copiedLogId}
                                    onCopy={onCopy}
                                    onToggle={onToggle}
                                    presentation={presentation}
                                />
                            );
                        })}
                    </div>
                </>
            ) : null}
        </PosTableSurface>
    );
}
