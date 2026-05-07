import React from 'react';

const CartIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="8" cy="21" r="1" />
    <circle cx="19" cy="21" r="1" />
    <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
  </svg>
);

const HeartIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

const ShareIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

const BagIcon = () => (
  <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

export function AboutSection({ about }) {
  return (
    <section className="bg-white rounded-2xl p-6 flex-1">
      <h3 className="text-base font-bold text-[#1A1A1A] mb-3">About Kuya Ding's BBQ</h3>
      <p className="text-sm text-gray-700 leading-relaxed mb-4">{about}</p>
      <button className="border border-[#E8540A] text-[#E8540A] bg-white px-4 py-2.5 rounded-lg text-sm font-medium cursor-pointer hover:bg-orange-50 transition-colors">
        Learn more about us →
      </button>
    </section>
  );
}

export function PromoSection({ promo }) {
  return (
    <section className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-2xl p-6 border border-orange-200 flex items-center gap-5 max-w-sm ml-6">
      <div className="flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-orange-800 mb-2">{promo.label}</div>
        <div className="flex items-baseline gap-1 mb-1">
          <span className="text-4xl font-extrabold text-[#E8540A] leading-none">{promo.discountPercent}%</span>
          <span className="text-base font-bold text-[#E8540A]">OFF</span>
        </div>
        <div className="text-base font-semibold text-orange-800 mb-2">{promo.title}</div>
        <div className="text-xs text-orange-900">
          {promo.conditions.map((condition, index) => (
            <div key={index}>• {condition}</div>
          ))}
        </div>
      </div>
      <img 
        src="https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=200&h=200&fit=crop"
        alt="Promo"
        className="w-20 h-20 rounded-lg object-cover"
      />
    </section>
  );
}

// Cart Bar Desktop
export function CartBarDesktop({ cart, onViewCart }) {
  if (!cart || cart.itemCount === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 flex justify-between items-center z-50 shadow-lg">
      <div className="flex items-center gap-3 cursor-pointer" onClick={onViewCart}>
        <div className="relative w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-[#E8540A]">
          <CartIcon />
          <span className="absolute -top-1 -right-1 bg-[#E8540A] text-white text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center">{cart.itemCount}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-gray-900">{cart.itemCount} items in cart</span>
          <span className="text-xs text-gray-500">₱{cart.total.toFixed(2)}</span>
        </div>
        <span className="text-gray-500">▲</span>
      </div>
      <button 
        className="bg-[#E8540A] text-white border-none px-8 py-3 rounded-xl text-[15px] font-semibold cursor-pointer hover:bg-[#F26522] transition-colors"
        onClick={onViewCart}
      >
        View Cart
      </button>
    </div>
  );
}

// Mobile Bottom Action Bar
export function BottomActionBarMobile({ cart, onNavigate }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 flex justify-between items-center z-50">
      <button className="flex flex-col items-center gap-1 bg-transparent border-none cursor-pointer p-2 text-gray-700">
        <HeartIcon />
        <span className="text-xs">Follow</span>
      </button>
      
      <button className="flex-2 bg-[#E8540A] text-white border-none rounded-full py-3.5 px-4 text-[15px] font-semibold cursor-pointer flex items-center justify-center gap-2 mx-3">
        <BagIcon /> Order Now
      </button>
      
      <button className="flex flex-col items-center gap-1 bg-transparent border-none cursor-pointer p-2 text-gray-700">
        <ShareIcon />
        <span className="text-xs">Share</span>
      </button>
    </div>
  );
}