import { Filter } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    PosFilterChoiceGroup,
    PosFilterDialogFooter,
    PosFilterDialogHeader
} from '../components/PosFilterDialogParts.jsx';
import PosFilterDialogShell from '../components/PosFilterDialogShell.jsx';

const getInitialFilterValue = (options) => options[0]?.value || 'all';

export default function AffiliateFilterPopover({
    value,
    onChange,
    options,
    label = 'Filter',
    mobileOnly = false,
    testId = 'affiliate-filter'
}) {
    const [open, setOpen] = useState(false);
    const [draftValue, setDraftValue] = useState(value || getInitialFilterValue(options));
    const [desktopFilterPosition, setDesktopFilterPosition] = useState(null);
    const desktopFilterButtonRef = useRef(null);
    const hasActiveFilter = value !== getInitialFilterValue(options);

    const syncDraft = () => {
        setDraftValue(value || getInitialFilterValue(options));
    };

    const close = () => setOpen(false);

    const apply = () => {
        onChange(draftValue);
        close();
    };

    const reset = () => setDraftValue(getInitialFilterValue(options));

    useLayoutEffect(() => {
        if (!open || mobileOnly || typeof window === 'undefined') {
            return undefined;
        }

        const updateDesktopFilterPosition = () => {
            const buttonRect = desktopFilterButtonRef.current?.getBoundingClientRect?.();
            if (!buttonRect) return;

            const viewportPadding = 16;
            // Keep the desktop Affiliate filter aligned with the History
            // filter dialog's 464px reference width.
            const dialogMaxWidth = 464;
            const dialogWidth = Math.min(dialogMaxWidth, Math.max(0, window.innerWidth - (viewportPadding * 2)));
            const preferredTop = buttonRect.bottom + 8;
            const maxHeight = Math.min(520, Math.max(220, window.innerHeight - preferredTop - viewportPadding));
            const top = preferredTop + 360 > window.innerHeight - viewportPadding
                ? Math.max(viewportPadding, buttonRect.top - Math.min(360, maxHeight) - 8)
                : preferredTop;
            const left = Math.max(
                viewportPadding,
                Math.min(buttonRect.right - dialogWidth, window.innerWidth - viewportPadding - dialogWidth)
            );

            setDesktopFilterPosition({
                left,
                top,
                width: dialogWidth,
                maxWidth: dialogWidth,
                maxHeight: Math.min(520, Math.max(220, window.innerHeight - top - viewportPadding)),
                boxSizing: 'border-box'
            });
        };

        updateDesktopFilterPosition();
        window.addEventListener('resize', updateDesktopFilterPosition);
        window.addEventListener('scroll', updateDesktopFilterPosition, true);
        return () => {
            window.removeEventListener('resize', updateDesktopFilterPosition);
            window.removeEventListener('scroll', updateDesktopFilterPosition, true);
        };
    }, [mobileOnly, open]);

    const trigger = mobileOnly ? (
        <button
            type="button"
            aria-label={label}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-pressed={open || hasActiveFilter}
            aria-controls={`${testId}-dialog`}
            onClick={() => {
                syncDraft();
                setOpen(true);
            }}
            className={`affiliate-mobile-toolbar-button ${open || hasActiveFilter ? 'affiliate-mobile-toolbar-button--active' : ''}`}
        >
            <Filter aria-hidden="true" />
        </button>
    ) : (
        <Button
            ref={desktopFilterButtonRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-pressed={open || hasActiveFilter}
            aria-controls={`${testId}-dialog`}
            onClick={() => {
                syncDraft();
                setOpen((current) => !current);
            }}
            className="pos-filter-trigger pos-items-primary-action h-9 rounded-lg bg-[#1A4E8D] px-3 text-[13px] text-white hover:bg-[#143F73] active:bg-[#143F73]"
        >
            <Filter className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {label}
            {hasActiveFilter && <span className="ml-1 text-[11px] font-bold">(1)</span>}
        </Button>
    );

    return (
        <>
            <div className={mobileOnly ? 'sm:hidden' : 'hidden sm:block'}>{trigger}</div>

            <PosFilterDialogShell
                open={open}
                onClose={close}
                mobile={mobileOnly}
                contentSized
                position={mobileOnly ? null : desktopFilterPosition}
                id={`${testId}-dialog`}
                ariaLabelledBy={`${testId}-title`}
                ariaDescribedBy={`${testId}-description`}
                className="pos-filter-surface affiliate-filter-surface"
            >
                <PosFilterDialogHeader
                    title={label}
                    description="Refine your affiliate list"
                    titleId={`${testId}-title`}
                    descriptionId={`${testId}-description`}
                    onClose={close}
                    closeLabel={`Close ${label.toLowerCase()}`}
                    mobile={mobileOnly}
                    className="dgfy-pos-history-dialog-header"
                    titleClassName="text-xl font-black text-[#0F172A]"
                    descriptionClassName="mt-0.5 text-[12px] text-slate-500"
                />

                <div className={`pos-filter-surface-body affiliate-filter-dialog-body min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain ${mobileOnly ? 'px-4 py-3' : 'px-4 py-2.5'}`}>
                    <PosFilterChoiceGroup
                        label="Status"
                        value={draftValue}
                        options={options}
                        onChange={setDraftValue}
                        testId={`${testId}-status`}
                        compact={!mobileOnly}
                        mobile={mobileOnly}
                        showSelectedIcon
                    />
                </div>

                <PosFilterDialogFooter
                    onReset={reset}
                    onApply={apply}
                    resetLabel="Reset All"
                    applyLabel="Apply Filters"
                    resetTestId={`${testId}-reset`}
                    applyTestId={`${testId}-apply`}
                    mobile={mobileOnly}
                    className={`${mobileOnly ? 'gap-3 px-4 py-3' : 'gap-2 px-4 py-2.5'} affiliate-filter-dialog-footer`}
                    leftButtonClassName={mobileOnly ? 'h-9' : 'h-10'}
                    applyButtonClassName={mobileOnly ? 'h-9' : 'h-10'}
                />
            </PosFilterDialogShell>
        </>
    );
}
