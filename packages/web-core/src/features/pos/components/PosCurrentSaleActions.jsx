import React from 'react';
import { Banknote, BookmarkPlus, CreditCard, Printer, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PosCurrentSaleActions({
  presentationBundle,
  onParkAndNewSale,
  onCheckout,
  checkoutDisabled = false,
  checkoutLoading = false,
  onPrintOrder,
  printOrderDisabled = false,
  printerAvailable = false,
  onOpenCashDrawer,
  cashDrawerDisabled = false,
  drawerOpening = false,
  showParkedSaleControls = false,
  onParkSale,
  parkSaleDisabled = false,
  parkLoading = false,
  activeParkedSale = null,
  parkSaleLoading = false,
  parkSaleLabel = 'Park Sale',
  onSplitPayment,
  splitPaymentDisabled = false,
  splitPaymentLoading = false,
  tabletLayout = false
}) {
  const hasParkedSaleControls = presentationBundle?.currentSaleActions?.showParkedSaleControls
    ?? showParkedSaleControls;
  const parkHandler = onParkAndNewSale || onParkSale;
  const isParkLoading = parkLoading || parkSaleLoading;
  const resolvedParkLabel = activeParkedSale ? 'Update Parked Sale' : (parkSaleLabel || 'Park');
  const compactParkedLayout = hasParkedSaleControls && !tabletLayout;
  const gridClassName = compactParkedLayout ? 'grid-cols-6' : 'grid-cols-2 sm:grid-cols-2';
  const checkoutActionClassName = compactParkedLayout ? 'order-2 col-span-3' : '';
  const printActionClassName = compactParkedLayout ? 'order-1 col-span-3' : '';
  const bottomActionClassName = compactParkedLayout ? 'order-3 col-span-2' : '';

  return (
    <div
      data-testid="pos-current-sale-actions"
      data-presentation-bundle={presentationBundle?.key || 'counter'}
      data-has-parked-sale-controls={hasParkedSaleControls ? 'true' : 'false'}
       className={`dgfy-pos-current-sale-actions ${tabletLayout ? 'dgfy-pos-tablet-action-grid' : ''} grid shrink-0 ${gridClassName} gap-2 pt-2`}
    >
      <Button
        type="button"
        onClick={onCheckout}
        disabled={checkoutDisabled}
        className={`${checkoutActionClassName} flex min-h-[46px] w-full min-w-0 flex-col items-center justify-center rounded-xl bg-[#0B449C] p-1.5 text-center text-white shadow-md shadow-blue-900/15 transition hover:bg-blue-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <ShoppingCart size={14} className="mb-0.5 shrink-0" aria-hidden="true" />
        <span className="w-full min-w-0 break-words text-center text-[10px] font-extrabold leading-[1.15] line-clamp-2 sm:text-[11px] xl:text-xs">
          {checkoutLoading ? 'Processing...' : 'Checkout'}
        </span>
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => onPrintOrder?.()}
        disabled={printOrderDisabled}
        title={printerAvailable ? undefined : 'No order-ticket printer detected on this device.'}
        className={`${printActionClassName} flex min-h-[46px] w-full min-w-0 flex-col items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-center text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <Printer size={14} className="mb-0.5 shrink-0" aria-hidden="true" />
        <span className="w-full min-w-0 break-words text-center text-[10px] font-extrabold leading-[1.15] line-clamp-2 sm:text-[11px] xl:text-xs">Print Order</span>
      </Button>
      {hasParkedSaleControls && (
        <Button
          type="button"
          variant="outline"
          data-testid="pos-park-sale-button"
          onClick={parkHandler}
          disabled={parkSaleDisabled || !parkHandler}
          title={activeParkedSale ? 'Update this resumed parked sale and start a new sale.' : 'Save this cart and start a new sale.'}
          className={`${bottomActionClassName} flex min-h-[46px] w-full min-w-0 flex-col items-center justify-center rounded-xl border border-amber-300 bg-amber-50 p-1.5 text-center text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <BookmarkPlus size={14} className="mb-0.5 shrink-0" aria-hidden="true" />
          <span className="w-full min-w-0 break-words text-center text-[10px] font-extrabold leading-[1.15] sm:text-[11px] xl:text-xs">
            {isParkLoading ? 'Parking...' : resolvedParkLabel}
          </span>
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        onClick={onOpenCashDrawer}
        disabled={cashDrawerDisabled}
        title={printerAvailable ? undefined : 'No cash drawer is configured for this terminal.'}
        className={`${bottomActionClassName} flex min-h-[46px] w-full min-w-0 flex-col items-center justify-center rounded-lg border p-1.5 text-center`}
      >
        <Banknote size={14} className="mb-0.5 shrink-0" aria-hidden="true" />
        <span className="w-full min-w-0 break-words text-center text-[10px] font-extrabold leading-[1.15] line-clamp-2 sm:text-[11px] xl:text-xs">{drawerOpening ? 'Opening...' : 'Open Cash Drawer'}</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        data-testid="pos-current-sale-split-payment"
        className={`${bottomActionClassName} flex min-h-[46px] w-full min-w-0 flex-col items-center justify-center rounded-lg border border-[#1A4E8D] bg-blue-50 p-1.5 text-center text-[#1A4E8D] hover:bg-blue-100`}
        onClick={onSplitPayment}
        disabled={splitPaymentDisabled}
      >
        <CreditCard size={14} className="mb-0.5 shrink-0" aria-hidden="true" />
        <span className="w-full min-w-0 break-words text-center text-[10px] font-extrabold leading-[1.15] line-clamp-2 sm:text-[11px] xl:text-xs">
          {splitPaymentLoading ? 'Processing...' : 'Split Payment'}
        </span>
      </Button>
    </div>
  );
}
