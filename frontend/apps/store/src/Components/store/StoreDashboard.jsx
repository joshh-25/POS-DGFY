import React, { useState, useEffect } from 'react';
import { 
  Navbar, 
  MobileNavbar, 
  StoreHeroDesktop, 
  StoreHeroMobile, 
  InfoGrid, 
  MenuSection, 
  ReviewsSidebar, 
  AboutSection, 
  PromoSection, 
  CartBarDesktop,
  BottomActionBarMobile 
} from './index.js';

// Convert API store data to UI format
function transformStoreData(selectedStore) {
  if (!selectedStore) return null;
  
  return {
    id: selectedStore.slug || selectedStore.tenant_id,
    name: selectedStore.tenant_name || 'Store',
    tagline: selectedStore.storefront_tagline || '',
    established: selectedStore.established || '',
    status: selectedStore.is_open ? 'open' : 'closed',
    closesAt: selectedStore.storefront_hours?.close || '10:00 PM',
    rating: selectedStore.storefront_rating || 4.5,
    reviewCount: selectedStore.storefront_review_count || 0,
    categories: selectedStore.storefront_categories || ['Store'],
    address: selectedStore.storefront_address || '',
    phone: selectedStore.storefront_phone || '',
    email: selectedStore.storefront_email || '',
    hours: selectedStore.storefront_hours?.display || '10:00 AM – 10:00 PM',
    hoursSchedule: 'Daily',
    deliveryPlatforms: ['Grab', 'Foodpanda', 'Lalamove'],
    about: selectedStore.storefront_about || '',
    overview: selectedStore.storefront_about || '',
    photoCount: 12,
    priceRange: 'PP',
    verified: true,
  };
}

// Convert catalog items to menu format
function transformCatalogToMenu(catalog) {
  if (!Array.isArray(catalog)) return [];
  
  return catalog.map((item, index) => ({
    id: item.item_id || `item-${index}`,
    name: item.name || item.item_name || 'Item',
    category: item.category || ['Menu'],
    description: item.description || '',
    price: parseFloat(item.price || item.unit_price || 0),
    isBestSeller: item.is_featured || item.is_best_seller || false,
    image: item.image_url || item.catalog_image || '',
  }));
}

// Default menu categories
const DEFAULT_CATEGORIES = ['All', 'Best Sellers', 'Menu'];

// Default reviews (placeholder)
const DEFAULT_REVIEWS = {
  average: 4.8,
  total: 127,
  breakdown: [
    { stars: 5, percent: 91 },
    { stars: 4, percent: 6 },
    { stars: 3, percent: 2 },
    { stars: 2, percent: 1 },
    { stars: 1, percent: 0 },
  ],
  items: [
    { name: 'Customer', avatarGender: 'male', stars: 5, timeAgo: 'Recently', text: 'Great products and excellent service!' },
  ],
};

// Default promo
const DEFAULT_PROMO = {
  label: "TODAY'S PROMO",
  discountPercent: 10,
  title: 'Special Offer',
  conditions: ['Min. order ₱100', 'Valid today only'],
};

export function StoreDashboard({ 
  selectedStore, 
  catalog, 
  cart, 
  onAddToCart,
  onNavigate,
  routeSlug 
}) {
  const [isMobile, setIsMobile] = useState(false);

  // Check viewport size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 769);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Transform data
  const store = transformStoreData(selectedStore);
  const menu = transformCatalogToMenu(catalog);
  const categories = menu.length > 0 
    ? ['All', ...new Set(menu.flatMap(item => item.category))] 
    : DEFAULT_CATEGORIES;
  
  // If no store data, show placeholder
  if (!store) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-400 mb-2">Loading store...</div>
          <div className="text-sm text-gray-500">Tenant page: {routeSlug}</div>
        </div>
      </div>
    );
  }

  const cartItemCount = Array.isArray(cart) ? cart.length : 0;
  const cartTotal = Array.isArray(cart) 
    ? cart.reduce((sum, item) => sum + (parseFloat(item.price || 0) * (item.quantity || 1)), 0) 
    : 0;

  const cartData = {
    itemCount: cartItemCount,
    total: cartTotal,
  };

  const handleAddToCart = (item) => {
    if (onAddToCart) {
      onAddToCart(item);
    } else {
      // Default implementation - dispatch custom event
      window.dispatchEvent(new CustomEvent('store-add-to-cart', { detail: item }));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50" style={{ paddingBottom: isMobile ? '80px' : '80px' }}>
      {/* Navbar */}
      {isMobile ? <MobileNavbar onNavigate={onNavigate?.goDiscovery} /> : <Navbar onNavigate={onNavigate?.goDiscovery} />}
      
      {/* Store Hero */}
      {isMobile ? (
        <StoreHeroMobile store={store} onNavigate={onNavigate?.goDiscovery} />
      ) : (
        <StoreHeroDesktop store={store} onNavigate={onNavigate?.goDiscovery} />
      )}
      
      {/* Page Content */}
      <div className="max-w-7xl mx-auto px-6 pb-6">
        {/* Info Grid (Desktop only) */}
        {!isMobile && <InfoGrid store={store} />}
        
        {/* Two Column Layout */}
        <div className="flex gap-6 flex-col md:flex-row">
          {/* Left Column - Menu + About/Promo */}
          <div className="flex-1 min-w-0">
            {/* Menu Section */}
            <MenuSection 
              menu={menu} 
              categories={categories}
              onAddToCart={handleAddToCart}
            />
            
            {/* About + Promo Row */}
            <div className="flex flex-col md:flex-row gap-6">
              <AboutSection about={store.about} />
              {!isMobile && <PromoSection promo={DEFAULT_PROMO} />}
            </div>
          </div>
          
          {/* Right Column - Reviews (Desktop only) */}
          {!isMobile && (
            <div className="w-[340px] flex-shrink-0">
              <ReviewsSidebar reviews={DEFAULT_REVIEWS} />
            </div>
          )}
        </div>
      </div>
      
      {/* Cart Bar */}
      {isMobile ? (
        <BottomActionBarMobile cart={cartData} />
      ) : (
        <CartBarDesktop cart={cartData} />
      )}
    </div>
  );
}