import React from 'react';

// Icons
const InfoIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
    <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const ChatIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const PhoneIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const BagIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

// Desktop Store Hero
export function StoreHeroDesktop({ store, onNavigate }) {
  return (
    <section className="relative h-[220px] bg-gray-900 bg-cover bg-center"
      style={{ backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.65), rgba(0,0,0,0.25)), url(https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=1200&h=400&fit=crop)' }}
    >
      <div className="relative flex items-end justify-between h-full max-w-7xl mx-auto px-6 pb-6">
        {/* Left: Logo Card */}
        <div className="flex items-end gap-5">
          <div className="w-36 h-36 bg-white rounded-2xl flex flex-col items-center justify-center shadow-lg">
            <span className="text-4xl mb-1">🔥</span>
            <div className="font-extrabold text-xl text-[#E8540A] leading-tight text-center">
              KUYA DING'S<br/>BBQ
            </div>
            <div className="text-[9px] text-gray-500 mt-1 tracking-widest">EST. 2020</div>
          </div>
        </div>

        {/* Center: Store Info */}
        <div className="flex-1 pl-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="bg-green-500 text-white text-xs font-semibold px-2.5 py-1 rounded-md">Open</span>
            <span className="text-white text-sm flex items-center gap-1">
              <InfoIcon /> Closes {store.closesAt}
            </span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-1">{store.name}</h1>
          <p className="text-lg text-amber-500 italic font-[Pacifico] mb-2">{store.tagline}</p>
          <div className="flex items-center gap-3 text-white text-sm">
            <span className="flex items-center gap-1">
              <span>⭐</span>
              <strong>{store.rating}</strong> ({store.reviewCount})
            </span>
            <span className="text-white/60">•</span>
            <span>{store.categories.join(', ')}</span>
            <span className="text-white/60">•</span>
            <span>📍 {store.address}</span>
          </div>
        </div>

        {/* Right: Action Buttons */}
        <div className="flex items-end gap-3">
          <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-white text-white font-semibold text-sm hover:bg-white/10 transition-colors">
            <ChatIcon /> Message
          </button>
          <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-white text-white font-semibold text-sm hover:bg-white/10 transition-colors">
            <PhoneIcon /> Call
          </button>
          <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#E8540A] border-2 border-[#E8540A] text-white font-semibold text-sm hover:bg-[#F26522] transition-colors">
            <BagIcon /> Order Now
          </button>
        </div>
      </div>
    </section>
  );
}

// Mobile Store Hero
export function StoreHeroMobile({ store, onNavigate }) {
  return (
    <>
      <div className="relative h-60 bg-gray-900 bg-cover bg-center"
        style={{ backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.6)), url(https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&h=400&fit=crop)' }}
      >
        <button 
          className="absolute top-4 left-4 w-9 h-9 rounded-full bg-white/90 border-none cursor-pointer flex items-center justify-center"
          onClick={() => onNavigate?.('/tenant-store')}
        >
          ←
        </button>
        <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/50 px-3 py-1.5 rounded-lg">
          <span className="bg-green-500 text-white text-[11px] font-semibold px-2 py-0.5 rounded">Open</span>
          <span className="text-white text-xs">Closes {store.closesAt}</span>
        </div>
      </div>
      <div className="relative px-4 pb-4 bg-white">
        <div className="absolute -mt-12 left-4 w-24 h-24 rounded-full bg-[#1A1A1A] border-4 border-white shadow-lg flex flex-col items-center justify-center">
          <span className="text-3xl">🔥</span>
          <div className="text-[10px] text-white font-bold leading-tight text-center">KUYA<br/>DING'S<br/>BBQ</div>
        </div>
        <div className="pt-14">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-[#1A1A1A]">{store.name}</h1>
            <span className="w-5 h-5 rounded-full bg-[#E8540A] flex items-center justify-center text-white text-xs">✓</span>
          </div>
          <p className="text-sm text-[#E8540A] italic font-[Pacifico] mb-2">{store.tagline}</p>
          <div className="flex items-center gap-2 text-sm text-gray-600 flex-wrap">
            <span>⭐ {store.rating} ({store.reviewCount})</span>
            <span className="text-gray-300">|</span>
            <span>🍴 {store.categories.join(', ')}</span>
            <span className="text-gray-300">|</span>
            <span>📍 Antipolo City</span>
          </div>
          <div className="flex gap-3 mt-4">
            <button className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold text-sm">
              <ChatIcon /> Message
            </button>
            <button className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#E8540A] border border-[#E8540A] text-white font-semibold text-sm">
              <PhoneIcon /> Call
            </button>
          </div>
        </div>
      </div>
    </>
  );
}