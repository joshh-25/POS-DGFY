import React from 'react';
import { BookmarkPlus, CreditCard, Printer, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PosCurrentSaleActions({
  onCheckout,
  checkoutDisabled = false,
  checkoutLoading = false,
  onPrintOrder,
  printOrderDisabled = false,
  printerAvailable = false,
  onOpenCashDrawer,
  cashDrawerDisabled = false,
  drawerOpening = false,
  onApplyDiscount,
  discountDisabled = false,
  showParkedSaleControls = false,
  onParkSale,
  parkSaleDisabled = false,
  parkSaleLoading = false,
  parkSaleLabel = 'Park Sale',
  onSplitPayment,
  splitPaymentDisabled = false,
  splitPaymentLoading = false,
  tabletLayout = false
}) {
  return (
    <div
      data-testid="pos-current-sale-actions"
      className={`dgfy-pos-current-sale-actions ${tabletLayout ? 'dgfy-pos-tablet-action-grid' : ''} grid shrink-0 grid-cols-2 sm:grid-cols-2 gap-2 border-t border-slate-200 pt-2`}
    >
      <Button
        type="button"
        onClick={onCheckout}
        disabled={checkoutDisabled}
        className="flex min-h-[46px] w-full min-w-0 flex-col items-center justify-center rounded-xl bg-[#0B449C] p-1.5 text-center text-white shadow-md shadow-blue-900/15 transition hover:bg-blue-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <ShoppingCart size={14} className="mb-0.5 shrink-0" />
        <span className="w-full min-w-0 break-words text-center text-[10px] font-extrabold leading-[1.15] line-clamp-2 sm:text-[11px] xl:text-xs">
          {checkoutLoading ? 'Processing...' : 'Checkout'}
        </span>
      </Button>
      {showParkedSaleControls && (
        <Button
          type="button"
          variant="outline"
          data-testid="pos-park-sale-button"
          onClick={onParkSale}
          disabled={parkSaleDisabled}
          title="Save the current cart as a parked sale and start a new sale."
          className="flex min-h-[46px] w-full min-w-0 flex-col items-center justify-center rounded-lg border border-[#1A4E8D] bg-white p-1.5 text-center text-[#1A4E8D] hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <BookmarkPlus size={14} className="mb-0.5 shrink-0" aria-hidden="true" />
          <span className="w-full min-w-0 break-words text-center text-[10px] font-extrabold leading-[1.15] line-clamp-2 sm:text-[11px] xl:text-xs">
            {parkSaleLoading ? 'Parking...' : parkSaleLabel}
          </span>
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        onClick={onPrintOrder}
        disabled={printOrderDisabled}
        title={printerAvailable ? undefined : 'No printer detected on this device.'}
        className="flex min-h-[46px] w-full min-w-0 flex-col items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-center text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Printer size={14} className="mb-0.5 shrink-0" />
        <span className="w-full min-w-0 break-words text-center text-[10px] font-extrabold leading-[1.15] line-clamp-2 sm:text-[11px] xl:text-xs">Print Order</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={onOpenCashDrawer}
        disabled={cashDrawerDisabled}
        title={printerAvailable ? undefined : 'No cash drawer is configured for this terminal.'}
        className="flex min-h-[46px] w-full min-w-0 flex-col items-center justify-center rounded-lg border p-1.5 text-center"
      >
        <span className="w-full min-w-0 break-words text-center text-[10px] font-extrabold leading-[1.15] line-clamp-2 sm:text-[11px] xl:text-xs">{drawerOpening ? 'Opening...' : 'Open Cash Drawer'}</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        className="flex min-h-[46px] w-full min-w-0 flex-col items-center justify-center rounded-lg border border-[#1A4E8D] bg-white p-1.5 text-center text-[#1A4E8D] hover:bg-blue-50"
        onClick={onApplyDiscount}
        disabled={discountDisabled}
      >
        <span className="w-full min-w-0 break-words text-center text-[10px] font-extrabold leading-[1.15] line-clamp-2 sm:text-[11px] xl:text-xs">Apply Discount</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        data-testid="pos-current-sale-split-payment"
        className="flex min-h-[46px] w-full min-w-0 flex-col items-center justify-center rounded-lg border border-[#1A4E8D] bg-blue-50 p-1.5 text-center text-[#1A4E8D] hover:bg-blue-100"
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
