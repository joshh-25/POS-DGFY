import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
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
} from '../Components/store/index.js';
import { STORE_DATA } from '../data/storeData.js';

// Page wrapper with responsive handling
export default function StorePage() {
  const { slug } = useParams();
  const [cart, setCart] = useState(STORE_DATA.cart);
  const [isMobile, setIsMobile] = useState(false);

  // Check viewport size
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 769);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleAddToCart = (item) => {
    setCart(prev => ({
      itemCount: prev.itemCount + 1,
      total: prev.total + item.price
    }));
  };

  const { store, menu, menuCategories, reviews, promo } = STORE_DATA;

  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F5', paddingBottom: isMobile ? '80px' : '80px' }}>
      {/* Navbar */}
      {isMobile ? <MobileNavbar /> : <Navbar />}
      
      {/* Store Hero */}
      {isMobile ? (
        <StoreHeroMobile store={store} />
      ) : (
        <StoreHeroDesktop store={store} />
      )}
      
      {/* Page Content */}
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px 24px' }}>
        {/* Info Grid (Desktop only) */}
        {!isMobile && <InfoGrid store={store} />}
        
        {/* Two Column Layout (Desktop) */}
        <div style={{ 
          display: 'flex', 
          gap: '24px',
          flexDirection: isMobile ? 'column' : 'row'
        }}>
          {/* Left Column - Menu + About/Promo */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Menu Section */}
            <MenuSection 
              menu={menu} 
              categories={menuCategories}
              onAddToCart={handleAddToCart}
            />
            
            {/* About + Promo Row */}
            <div style={{ 
              display: 'flex', 
              gap: '24px',
              flexDirection: isMobile ? 'column' : 'row'
            }}>
              <AboutSection about={store.about} />
              {!isMobile && <PromoSection promo={promo} />}
            </div>
          </div>
          
          {/* Right Column - Reviews (Desktop only) */}
          {!isMobile && (
            <div style={{ width: '340px', flexShrink: 0 }}>
              <ReviewsSidebar reviews={reviews} />
            </div>
          )}
        </div>
      </div>
      
      {/* Cart Bar */}
      {isMobile ? (
        <BottomActionBarMobile cart={cart} />
      ) : (
        <CartBarDesktop cart={cart} />
      )}
    </div>
  );
}