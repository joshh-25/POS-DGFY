import React from 'react';
import { createPortal } from 'react-dom';
import { ShoppingBag, Check, X } from 'lucide-react';

export function PosAddToCartToastContainer({ toasts = [], onDismiss }) {
  if (typeof document === 'undefined' || !toasts || toasts.length === 0) return null;

  const content = (
    <div
      role="region"
      aria-label="Add to cart notifications"
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-2.5 pointer-events-none max-w-xs sm:max-w-sm w-full px-3 sm:px-0"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pos-add-to-cart-toast pointer-events-auto flex items-center gap-3 rounded-2xl bg-[#0F172A]/95 p-3 pr-3.5 text-white shadow-2xl backdrop-blur-md border border-slate-700/60"
        >
          {/* Thumbnail */}
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-slate-800 border border-slate-700/80 flex items-center justify-center">
            {toast.imageSrc ? (
              <img
                src={toast.imageSrc}
                alt={toast.itemName}
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <ShoppingBag className="h-5 w-5 text-blue-400" aria-hidden="true" />
            )}
            <span className="absolute bottom-0 right-0 flex h-4 w-4 items-center justify-center rounded-tl-md bg-emerald-500 text-[9px] font-bold text-white shadow-sm">
              <Check className="h-2.5 w-2.5 stroke-[3]" />
            </span>
          </div>

          {/* Toast text info */}
          <div className="flex flex-1 min-w-0 flex-col justify-center">
            <div className="flex items-center justify-between gap-1.5">
              <p className="text-xs font-bold text-slate-100 truncate">
                {toast.itemName}
              </p>
              <span className="shrink-0 rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-extrabold text-blue-300 border border-blue-400/30">
                Qty: {toast.quantity}
              </span>
            </div>
            <p className="text-[11px] font-medium text-emerald-400 mt-0.5">
              Added to current sale.
            </p>
          </div>

          {/* Dismiss button */}
          {onDismiss && (
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}

export default PosAddToCartToastContainer;
