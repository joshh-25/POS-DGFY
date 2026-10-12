import { Dialog, DialogContent } from '@/components/ui/dialog';

const HISTORY_DIALOG_SHADOW = 'shadow-[0_12px_30px_rgba(15,23,42,0.2)]';

export default function PosFilterDialogShell({
  open = false,
  onClose,
  mode = 'filters',
  mobile = false,
  tabletPortrait = false,
  landscapeMobile = false,
  position = null,
  id,
  ariaLabelledBy,
  ariaDescribedBy,
  layerClassName = '',
  overlayClassName: overlayClassNameOverride = '',
  className = '',
  children
}) {
  const isMobileDialog = mobile && !tabletPortrait;
  const isDesktopFilterDialog = mode === 'filters' && !isMobileDialog;
  const defaultOverlayClassName = isMobileDialog || tabletPortrait
    ? 'bg-slate-950/60 backdrop-blur-sm'
    : 'bg-transparent backdrop-blur-none';
  const resolvedOverlayClassName = overlayClassNameOverride || defaultOverlayClassName;
  const contentClassName = [
    'flex',
    mode === 'calendar'
      ? 'h-[min(90vh,40rem)] max-h-[min(90vh,40rem)] dgfy-pos-history-calendar-dialog max-w-none rounded-xl'
      : 'h-[min(90vh,48rem)] max-h-[min(90vh,48rem)]',
    isMobileDialog
      ? 'dgfy-pos-history-mobile-sheet max-w-none rounded-t-2xl'
      : mode === 'calendar'
        ? ''
        : isDesktopFilterDialog
          ? 'dgfy-pos-history-filter-dialog w-auto max-w-none rounded-xl'
          : 'max-w-2xl',
    tabletPortrait ? 'dgfy-pos-history-tablet-portrait-dialog' : '',
    landscapeMobile ? 'dgfy-pos-history-mobile-landscape-dialog' : '',
    'flex-col overflow-hidden border border-slate-300 p-0',
    className,
    HISTORY_DIALOG_SHADOW
  ].filter(Boolean).join(' ');
  const contentStyle = !isMobileDialog && !tabletPortrait && position
    ? {
        position: 'fixed',
        left: `${position.left}px`,
        top: `${position.top}px`,
        width: `${position.width}px`,
        maxWidth: `${position.width}px`,
        ...(position.maxHeight != null
          ? {
              // A max-height alone does not give the flex column a definite
              // height, so the body can remain content-sized and be clipped
              // by the shell instead of becoming the scroll container.
              maxHeight: `${position.maxHeight}px`,
              height: `${position.maxHeight}px`
            }
          : {}),
        boxSizing: 'border-box'
      }
    : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose?.();
      }}
      overlayClassName={resolvedOverlayClassName}
      layerClassName={layerClassName}
      mobileSheet={isMobileDialog}
    >
      <DialogContent
        id={id}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        className={contentClassName}
        style={contentStyle}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}
