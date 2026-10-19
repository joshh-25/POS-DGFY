import React, { useState } from 'react';
import { CalendarDays, RotateCcw } from 'lucide-react';
import PosDateRangePicker from './PosDateRangePicker.jsx';
import { PosFilterDialogFooter, PosFilterDialogHeader } from './PosFilterDialogParts.jsx';
import PosFilterDialogShell from './PosFilterDialogShell.jsx';
import { usePosViewportMode } from './PosResponsiveFormDrawer.jsx';
import usePosReportsPopoverPosition from './usePosReportsPopoverPosition.js';

export default function AuditDateFilterDialog({ open, onClose, onApply, dateRange, anchorRef, actionDisabled }) {
    const [draftFrom, setDraftFrom] = useState(() => dateRange?.dateFrom || '');
    const [draftTo, setDraftTo] = useState(() => dateRange?.dateTo || '');
    const viewportMode = usePosViewportMode();
    const isMobileDialog = viewportMode === 'mobile';
    const position = usePosReportsPopoverPosition({ open, anchorRef, maxWidth: 464 });

    if (!open) return null;

    return (
        <PosFilterDialogShell
            open={open}
            onClose={onClose}
            mode="calendar"
            mobile={isMobileDialog}
            contentSized
            position={position}
            id="pos-audit-calendar-dialog"
            ariaLabelledBy="pos-audit-calendar-title"
            ariaDescribedBy="pos-audit-calendar-description"
            className="pos-filter-surface pos-audit-calendar-surface"
        >
            <PosFilterDialogHeader
                title="Select Date"
                description="Choose a date range for the audit history."
                titleId="pos-audit-calendar-title"
                descriptionId="pos-audit-calendar-description"
                onClose={undefined}
                closeLabel="Close audit date filter"
                mobile={isMobileDialog}
                headerAction={(
                    <button
                        type="button"
                        data-testid="pos-audit-reset-dates"
                        onClick={() => {
                            setDraftFrom('');
                            setDraftTo('');
                        }}
                        aria-label="Reset audit dates"
                        title="Reset dates"
                        className={`${isMobileDialog ? 'h-11 w-11 rounded-lg' : 'h-9 w-9 rounded-lg'} inline-flex shrink-0 items-center justify-center bg-[#1A4E8D] text-white shadow-sm shadow-blue-900/15 hover:bg-[#143F73] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100`}
                    >
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    </button>
                )}
                className="dgfy-pos-history-dialog-header"
                titleClassName="text-xl font-black text-[#0F172A]"
                descriptionClassName="mt-0.5 text-[12px] text-slate-500"
            />
            <div className={`min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain ${isMobileDialog ? 'px-4 py-3' : 'px-4 py-2'} dgfy-pos-history-dialog-body`}>
                <PosDateRangePicker
                    from={draftFrom}
                    to={draftTo}
                    mobile={isMobileDialog}
                    testIdPrefix="pos-audit-calendar"
                    timeZone="Asia/Manila"
                    enableRangeDrag
                    dateLabelStyle="short"
                    onChange={(from, to) => {
                        setDraftFrom(from);
                        setDraftTo(to);
                    }}
                />
            </div>
            <PosFilterDialogFooter
                onCancel={onClose}
                onApply={() => onApply({ dateFrom: draftFrom, dateTo: draftTo || draftFrom })}
                applyIcon={CalendarDays}
                disabled={actionDisabled}
                cancelLabel="Cancel"
                cancelTestId="pos-audit-cancel-dates"
                applyTestId="pos-audit-apply-dates"
                mobile={isMobileDialog}
                className={`${isMobileDialog ? 'gap-3 px-4 py-3' : 'gap-2 px-4 py-2'} dgfy-pos-history-dialog-footer`}
                leftButtonClassName="h-9 border-rose-300 bg-rose-50/40 px-3 text-[13px] font-extrabold text-rose-700 shadow-sm shadow-rose-100/70 hover:border-rose-400 hover:bg-rose-50 hover:text-rose-800"
                applyButtonClassName="h-9 text-[13px]"
            />
        </PosFilterDialogShell>
    );
}
