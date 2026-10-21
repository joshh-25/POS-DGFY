import { useState } from 'react';
import { Clock, Trash2 } from 'lucide-react';
import { GlobalPagination, POS_PAGINATION_FOOTER_NO_DIVIDER_CLASS } from '@/components/ui/pagination';
import PosMobileDataCard from '../components/PosMobileDataCard.jsx';
import PosTableActionButton from '../components/PosTableActionButton.jsx';
import { POS_TABLE_HEADER_CLASS, POS_TABLE_ROW_CLASS, POS_TABLE_SURFACE_CLASS } from '../components/PosTableSurface.jsx';
import { usePosViewportMode } from '../components/PosResponsiveFormDrawer.jsx';
import { AFFILIATE_PAGE_SIZE_OPTIONS, formatAffiliateTableDate } from './affiliatePresentation.js';

const PENDING_TABLE_HEADER_CELL_CLASS = 'whitespace-normal px-2.5 text-left text-[13px] font-black uppercase leading-tight tracking-wide';
const PENDING_TABLE_ACTION_HEADER_CELL_CLASS = 'whitespace-normal px-2.5 text-center text-[13px] font-black uppercase leading-tight tracking-wide';
const PENDING_TABLE_CELL_CLASS = 'px-2.5 py-2 text-left text-[13px] leading-4 text-[#334155] align-middle';
const PENDING_TABLE_ACTION_CELL_CLASS = 'px-2.5 py-2 text-center text-[13px] leading-4 text-[#334155] align-middle';
const PENDING_INVITE_COLUMN_WIDTHS = [
    'pos-affiliates-data-column pos-affiliates-identity-column',
    'pos-affiliates-data-column',
    'pos-affiliates-data-column',
    'pos-affiliates-data-column',
    'pos-affiliates-data-column',
    'pos-affiliates-data-column',
    'pos-affiliates-data-column',
    'pos-affiliates-actions-column'
];

export default function AffiliatePendingInvites({ invites, canManage, inviteBusyId, onCancel, compact = false }) {
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(AFFILIATE_PAGE_SIZE_OPTIONS[0]);
    const viewportMode = usePosViewportMode();
    const isMobileViewport = viewportMode === 'mobile';
    const totalPages = Math.max(1, Math.ceil(invites.length / pageSize));
    const safeCurrentPage = Math.min(currentPage, totalPages);
    const visibleInvites = invites.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize);

    if (!canManage || !invites.length) return null;

    return (
        <div className="min-w-0 max-w-full">
            <header
                data-testid="affiliate-pending-invites-heading"
                className="affiliate-pending-invites-heading flex min-w-0 items-center justify-between gap-4 border-t border-slate-200 px-2 py-4 sm:px-4 sm:py-5"
            >
                <div className="min-w-0">
                    <h3 className="text-base font-black leading-tight text-[#0F172A] sm:text-lg">Pending invites</h3>
                    <p className="mt-1 text-sm leading-5 text-slate-500">Invitations that have not been accepted yet.</p>
                </div>
                <div
                    className="flex shrink-0 items-center gap-1.5 text-sm font-bold text-amber-700"
                    aria-label={`${invites.length} pending ${invites.length === 1 ? 'invite' : 'invites'}`}
                >
                    <Clock aria-hidden="true" className="h-4 w-4" />
                    <span>{invites.length} pending {invites.length === 1 ? 'invite' : 'invites'}</span>
                </div>
            </header>
            <section className={`${POS_TABLE_SURFACE_CLASS} ${compact ? 'p-2' : 'p-0'}`}>
                <div data-testid="affiliate-pending-invites-region" className="affiliate-pending-invites-region min-w-0 overflow-x-hidden">
                        {isMobileViewport ? (
                            <div data-testid="affiliate-pending-invites-mobile-records" className="grid min-w-0 gap-2 p-2">
                                {visibleInvites.map((invite) => (
                                    <PosMobileDataCard
                                        key={invite.invite_id}
                                        titleLabel="Email"
                                        title={invite.email || 'Email unavailable'}
                                        fields={[
                                            {
                                                key: 'date-invited',
                                                label: 'Date invited',
                                                value: formatAffiliateTableDate(invite.created_at),
                                                valueClassName: 'text-slate-500',
                                                align: 'right'
                                            }
                                        ]}
                                        action={(
                                            <PosTableActionButton
                                                icon={Trash2}
                                                tone="danger"
                                                aria-label={`Cancel invite ${invite.email || 'without email'}`}
                                                title={`Cancel invite ${invite.email || 'without email'}`}
                                                disabled={inviteBusyId === invite.invite_id}
                                                onClick={() => onCancel(invite)}
                                            />
                                        )}
                                        className="shadow-sm shadow-slate-200/40"
                                    />
                                ))}
                            </div>
                        ) : (
                            <table aria-label="Pending affiliate invites table" className="pos-affiliates-data-table pos-affiliates-pending-table w-full min-w-0 table-fixed border-collapse text-left text-[13px]">
                                <colgroup>
                                    {PENDING_INVITE_COLUMN_WIDTHS.map((className, index) => <col key={index} className={className} />)}
                                </colgroup>
                                <thead className={`${POS_TABLE_HEADER_CLASS} sticky top-0 z-10`}>
                                    <tr className="h-12">
                                        <th scope="col" colSpan={4} className={PENDING_TABLE_HEADER_CELL_CLASS}>Email</th>
                                        <th scope="col" className={PENDING_TABLE_HEADER_CELL_CLASS}>Date invited</th>
                                        <th scope="col" colSpan={2} aria-hidden="true" className="p-0" />
                                        <th scope="col" className={PENDING_TABLE_ACTION_HEADER_CELL_CLASS}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visibleInvites.map((invite) => (
                                        <tr key={invite.invite_id} className={`${POS_TABLE_ROW_CLASS} h-12`}>
                                            <td colSpan={4} className={PENDING_TABLE_CELL_CLASS}>
                                                <div className="min-w-0">
                                                    <div className="truncate font-black text-[#0F172A]" title={invite.email || 'Email unavailable'}>{invite.email || 'Email unavailable'}</div>
                                                </div>
                                            </td>
                                            <td className={`${PENDING_TABLE_CELL_CLASS} whitespace-nowrap text-slate-500`}>{formatAffiliateTableDate(invite.created_at)}</td>
                                            <td colSpan={2} aria-hidden="true" className="p-0" />
                                            <td className={PENDING_TABLE_ACTION_CELL_CLASS}>
                                                <div className="flex w-full items-center justify-center">
                                                    <PosTableActionButton
                                                        icon={Trash2}
                                                        tone="danger"
                                                        aria-label={`Cancel invite ${invite.email || 'without email'}`}
                                                        title={`Cancel invite ${invite.email || 'without email'}`}
                                                        disabled={inviteBusyId === invite.invite_id}
                                                        onClick={() => onCancel(invite)}
                                                    />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                </div>
            </section>
            <GlobalPagination
                testId="affiliate-pending-invites-pagination"
                ariaLabel="Pending affiliate invites pagination"
                currentPage={safeCurrentPage}
                totalPages={totalPages}
                totalItems={invites.length}
                pageSize={pageSize}
                pageSizeOptions={AFFILIATE_PAGE_SIZE_OPTIONS}
                hidePageSizeSuffixOnMobile
                itemLabel="invites"
                pageSizeLabel="Invites per page"
                pageInputLabel="Go to pending invites page"
                previousLabel="Previous pending invites page"
                nextLabel="Next pending invites page"
                onPageChange={setCurrentPage}
                onPageSizeChange={(nextPageSize) => {
                    if (!Number.isInteger(nextPageSize) || nextPageSize <= 0) return;
                    setPageSize(nextPageSize);
                    setCurrentPage(1);
                }}
                accentColor="#1A4E8D"
                className={POS_PAGINATION_FOOTER_NO_DIVIDER_CLASS}
            />
        </div>
    );
}
