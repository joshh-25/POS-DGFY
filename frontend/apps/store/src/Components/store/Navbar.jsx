import React from 'react';

// Icons as components
const SearchIcon = () => (
  <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg className="w-[14px] h-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const ShoppingCartIcon = () => (
  <svg className="w-[20px] h-[20px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="8" cy="21" r="1" />
    <circle cx="19" cy="21" r="1" />
    <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
  </svg>
);

const ChatIcon = () => (
  <svg className="w-[20px] h-[20px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const BellIcon = () => (
  <svg className="w-[20px] h-[20px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const MenuIcon = () => (
  <svg className="w-[20px] h-[20px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

export function Navbar({ onNavigate }) {
  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 h-14">
      <div className="flex items-center justify-between h-full max-w-7xl mx-auto px-6">
        {/* Left: Logo */}
        <div 
          className="flex items-center cursor-pointer" 
          onClick={() => onNavigate?.('/tenant-store')}
        >
          <span className="text-2xl font-extrabold text-[#E8540A]">DGFY</span>
          <span className="text-2xl font-extrabold text-[#1A1A1A]">.ph</span>
        </div>

        {/* Center: Search Bar */}
        <div className="hidden md:flex items-center bg-white border border-gray-300 rounded-full px-4 py-2 w-96">
          <span className="text-gray-400 mr-2"><SearchIcon /></span>
          <input 
            type="text" 
            placeholder="Search for stores, products, services..." 
            className="flex-1 border-none outline-none text-sm"
          />
        </div>

        {/* Right: Navigation */}
        <div className="flex items-center gap-4">
          <span className="hidden md:flex items-center gap-1 text-sm font-medium text-gray-700 cursor-pointer hover:text-gray-900">
            Explore <ChevronDownIcon />
          </span>
          <span className="hidden md:block text-sm font-medium text-gray-700 cursor-pointer hover:text-gray-900">For Business</span>
          <span className="hidden md:flex items-center gap-1 text-sm font-medium text-gray-700 cursor-pointer hover:text-gray-900">
            Help <ChevronDownIcon />
          </span>
          
          <button className="hidden md:block p-2 rounded-lg hover:bg-gray-100">
            <ShoppingCartIcon />
          </button>
          
          <button className="hidden md:block p-2 rounded-lg hover:bg-gray-100">
            <ChatIcon />
          </button>
          
          <button className="relative p-2 rounded-lg hover:bg-gray-100">
            <BellIcon />
            <span className="absolute top-1 right-1 bg-[#E8540A] text-white text-[10px] font-semibold rounded-full px-1.5 min-w-[16px] text-center">3</span>
          </button>
          
          <div className="hidden md:flex items-center gap-2 p-1 rounded-lg hover:bg-gray-100 cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-[#E8540A] text-white flex items-center justify-center text-xs font-semibold">
              JD
            </div>
            <span className="text-sm font-medium text-[#1A1A1A]">Juan D.</span>
          </div>
        </div>
      </div>
    </nav>
  );
}

// Mobile Navbar
export function MobileNavbar({ onNavigate }) {
  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 h-14 flex items-center justify-between px-4">
      <div 
        className="flex" 
        onClick={() => onNavigate?.('/tenant-store')}
      >
        <span className="text-xl font-extrabold text-[#E8540A]">DGFY</span>
        <span className="text-xl font-extrabold text-[#1A1A1A]">.ph</span>
      </div>
      
      <div className="flex items-center gap-2">
        <button className="p-2 rounded-lg hover:bg-gray-100">
          <SearchIcon />
        </button>
        <button className="p-2 rounded-lg hover:bg-gray-100">
          <ShoppingCartIcon />
        </button>
        <button className="p-2 rounded-lg hover:bg-gray-100">
          <MenuIcon />
        </button>
      </div>
    </nav>
  );
}