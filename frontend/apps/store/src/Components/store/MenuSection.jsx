import React, { useState } from 'react';

const MENU_IMAGES = {
  'pork-bbq': 'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=300&h=200&fit=crop',
  'chicken-bbq': 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=300&h=200&fit=crop',
  'liempo': 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?w=300&h=200&fit=crop',
  'java-rice': 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=300&h=200&fit=crop',
  'iced-tea': 'https://images.unsplash.com/photo-1499638673689-79a0b5114d87?w=300&h=200&fit=crop',
};

const SearchIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);

export function MenuSection({ menu, categories, onAddToCart }) {
  const [activeTab, setActiveTab] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredMenu = menu.filter(item => {
    const matchesCategory = activeTab === 'All' || item.category.includes(activeTab);
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <section className="bg-white rounded-2xl p-6 mb-6">
      <div className="flex justify-between items-center mb-5">
        <h2 className="text-lg font-bold text-[#1A1A1A]">MENU</h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-white border border-gray-300 rounded-full px-4 py-2 gap-2">
            <SearchIcon />
            <input 
              type="text" 
              placeholder="Search menu..."
              className="border-none outline-none text-sm w-40"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <a className="text-sm text-[#E8540A] hover:underline cursor-pointer whitespace-nowrap">View full menu →</a>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-4 mb-5 scrollbar-hide">
        {categories.map((category) => (
          <button
            key={category}
            className={`px-4 py-2 rounded-full text-sm font-medium cursor-pointer whitespace-nowrap transition-colors ${
              activeTab === category
                ? 'bg-[#E8540A] text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
            onClick={() => setActiveTab(category)}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Menu Grid */}
      <div className="grid grid-cols-5 gap-4">
        {filteredMenu.map((item) => (
          <div 
            key={item.id} 
            className="menu-card border border-gray-200 rounded-xl overflow-hidden cursor-pointer"
          >
            <div className="relative">
              <img 
                src={MENU_IMAGES[item.id] || MENU_IMAGES['pork-bbq']}
                alt={item.name}
                className="w-full h-36 object-cover"
              />
              {item.isBestSeller && (
                <span className="absolute top-2 left-2 bg-[#E8540A] text-white text-[10px] font-bold px-2 py-0.5 rounded">
                  BEST SELLER
                </span>
              )}
            </div>
            <div className="p-3">
              <h4 className="text-sm font-semibold text-gray-900 mb-1">{item.name}</h4>
              <p className="text-xs text-gray-500 leading-relaxed mb-2 line-clamp-2">{item.description}</p>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-gray-900">₱{item.price.toFixed(2)}</span>
                <button 
                  className="border border-[#E8540A] text-[#E8540A] bg-white px-3 py-1 rounded-md text-xs font-medium cursor-pointer hover:bg-orange-50 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddToCart?.(item);
                  }}
                >
                  + Add
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}