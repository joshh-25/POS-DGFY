import React, { useRef, useEffect, useState } from 'react';
import {
  Search,
  MapPin,
  Sliders,
  Server,
  CheckCircle2,
  ArrowRight,
  Zap
} from 'lucide-react';
import { buildBusinessLoginUrl, buildBusinessRegistrationUrl } from '../../../businessRegistrationUrl.js';

// Lightweight viewport observer hook for high-performance scroll triggers
const useIntersection = (ref, options = {}) => {
  const [isIntersecting, setIsIntersecting] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsIntersecting(true);
        if (options.triggerOnce) {
          observer.unobserve(ref.current);
        }
      }
    }, options);
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref, options.triggerOnce]);
  return isIntersecting;
};

// Smooth viewport reveal container
function RevealSection({ children, style }) {
  const ref = useRef(null);
  const isVisible = useIntersection(ref, { triggerOnce: true, threshold: 0.08 });
  return (
    <div
      ref={ref}
      className={`solutions-reveal-section ${isVisible ? 'is-visible' : ''}`}
      style={style}
    >
      {children}
    </div>
  );
}

// Staged vertical growth chart bar
function InventoryChartBar({ targetHeight, delay, isHighlight }) {
  const ref = useRef(null);
  const isVisible = useIntersection(ref, { triggerOnce: true, threshold: 0.1 });
  return (
    <div
      style={{
        flex: 1,
        height: '100%',
        display: 'flex',
        alignItems: 'end',
        justifyContent: 'center'
      }}
    >
      <div
        ref={ref}
        className={`solutions-bar-grow ${isVisible ? 'is-visible' : ''}`}
        style={{
          width: '100%',
          height: targetHeight,
          background: isHighlight ? '#FF9F1C' : '#E2E8F0',
          borderRadius: '4px',
          transitionDelay: delay
        }}
      />
    </div>
  );
}

export function SolutionsPage({ logoSrc, onExploreClick }) {
  const handleRegisterRedirect = () => {
    if (typeof window !== 'undefined') {
      window.location.href = buildBusinessRegistrationUrl();
    }
  };

  return (
    <div style={{
      fontFamily: '"Inter", -apple-system, sans-serif',
      color: '#0A0F1C',
      background: '#FFFFFF',
      width: '100vw',
      marginLeft: 'calc(50% - 50vw)',
      marginRight: 'calc(50% - 50vw)',
      boxSizing: 'border-box',
      overflowX: 'hidden'
    }}>

      {/* ── 1. HERO SECTION ── */}
      <RevealSection>
        <section style={{
          padding: '96px 20px 120px',
          maxWidth: 1240,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '64px',
          alignItems: 'center'
        }}>
          {/* Left Content */}
          <div style={{ display: 'grid', gap: '24px', justifyItems: 'start' }}>
            <div style={{
              fontSize: '13px',
              fontWeight: 800,
              letterSpacing: '0.12em',
              color: '#1A4E8D',
              textTransform: 'uppercase',
              background: 'rgba(26, 78, 141, 0.08)',
              padding: '6px 14px',
              borderRadius: '999px'
            }}>
              SOLUTIONS
            </div>
            <h1 style={{
              fontSize: 'min(56px, 10vw)',
              fontWeight: 900,
              lineHeight: 1.08,
              letterSpacing: '-0.03em',
              margin: 0,
              color: '#0A0F1C'
            }}>
              One Connected Commerce Layer
            </h1>
            <p style={{
              fontSize: '18px',
              lineHeight: 1.6,
              color: '#5F6B7A',
              margin: 0,
              maxWidth: '540px',
              fontWeight: 450
            }}>
              Discover, manage, and grow your business through one unified platform built for map-based visibility, sales, real-time inventory, and kitchen operations.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', paddingTop: '8px' }}>
              <button
                type="button"
                onClick={handleRegisterRedirect}
                style={{
                  background: '#1A4E8D',
                  color: '#FFFFFF',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '15px',
                  padding: '14px 28px',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 10px 25px rgba(26, 78, 141, 0.25)',
                  transition: 'all 200ms ease'
                }}
              >
                Get Started
                <ArrowRight size={16} />
              </button>
              <button
                type="button"
                onClick={onExploreClick}
                style={{
                  background: '#F7F9FC',
                  color: '#0A0F1C',
                  border: '1px solid rgba(10, 15, 28, 0.06)',
                  fontWeight: 700,
                  fontSize: '15px',
                  padding: '14px 28px',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  transition: 'all 200ms ease'
                }}
              >
                Explore Live Map
              </button>
            </div>
          </div>

          {/* Right Floating Stack Visual */}
          <div style={{
            position: 'relative',
            display: 'grid',
            gap: '20px',
            justifyContent: 'stretch',
            padding: '20px'
          }}>
            {/* Vertical Connected Line */}
            <div style={{
              position: 'absolute',
              left: '42px',
              top: '40px',
              bottom: '40px',
              width: '2px',
              background: 'linear-gradient(to bottom, #1A4E8D, #42C77B, #FF9F1C, rgba(10,15,28,0.06))',
              zIndex: 1
            }} />

            {/* Layer 1: Map.DGFY */}
            <div 
              className="solutions-float-item"
              style={{
                background: '#FFFFFF',
                borderRadius: '20px',
                padding: '16px 20px 16px 24px',
                border: '1px solid rgba(10, 15, 28, 0.06)',
                boxShadow: '0 10px 30px rgba(10, 15, 28, 0.03)',
                display: 'flex',
                alignItems: 'center',
                gap: '20px',
                zIndex: 2,
                animationDelay: '0s'
              }}
            >
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'rgba(26, 78, 141, 0.08)',
                color: '#1A4E8D',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0
              }}>
                <MapPin size={20} />
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0A0F1C' }}>Map.DGFY</div>
                <div style={{ fontSize: '13px', color: '#5F6B7A', marginTop: '2px' }}>Makes everything searchable and discoverable</div>
              </div>
            </div>

            {/* Layer 2: DGFY POS */}
            <div 
              className="solutions-float-item"
              style={{
                background: '#FFFFFF',
                borderRadius: '20px',
                padding: '16px 20px 16px 24px',
                border: '1px solid rgba(10, 15, 28, 0.06)',
                boxShadow: '0 10px 30px rgba(10, 15, 28, 0.03)',
                display: 'flex',
                alignItems: 'center',
                gap: '20px',
                zIndex: 2,
                transform: 'translateX(8px)',
                animationDelay: '1.2s'
              }}
            >
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'rgba(66, 199, 123, 0.08)',
                color: '#42C77B',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0
              }}>
                <Zap size={20} />
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0A0F1C' }}>DGFY POS</div>
                <div style={{ fontSize: '13px', color: '#5F6B7A', marginTop: '2px' }}>Digitizes the operations and payments</div>
              </div>
            </div>

            {/* Layer 3: DGFY Inventory Engine */}
            <div 
              className="solutions-float-item"
              style={{
                background: '#FFFFFF',
                borderRadius: '20px',
                padding: '16px 20px 16px 24px',
                border: '1px solid rgba(10, 15, 28, 0.06)',
                boxShadow: '0 10px 30px rgba(10, 15, 28, 0.03)',
                display: 'flex',
                alignItems: 'center',
                gap: '20px',
                zIndex: 2,
                transform: 'translateX(16px)',
                animationDelay: '2.4s'
              }}
            >
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'rgba(255, 159, 28, 0.08)',
                color: '#FF9F1C',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0
              }}>
                <Sliders size={20} />
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0A0F1C' }}>DGFY Inventory Engine</div>
                <div style={{ fontSize: '13px', color: '#5F6B7A', marginTop: '2px' }}>Structures catalog data and stock in real-time</div>
              </div>
            </div>

            {/* Layer 4: SKUPERVISOR */}
            <div 
              className="solutions-float-item"
              style={{
                background: '#F8FAFC',
                borderRadius: '20px',
                padding: '14px 20px 14px 24px',
                border: '1px dashed rgba(10, 15, 28, 0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: '20px',
                zIndex: 2,
                transform: 'translateX(24px)',
                animationDelay: '3.6s'
              }}
            >
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'rgba(10, 15, 28, 0.04)',
                color: '#5F6B7A',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0
              }}>
                <Server size={20} />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0A0F1C' }}>Powered by SKUPERVISOR</div>
                <div style={{ fontSize: '12px', color: '#5F6B7A', marginTop: '2px' }}>Operational backbone for stock and procurement</div>
              </div>
            </div>
          </div>
        </section>
      </RevealSection>

      {/* ── 2. SOLUTIONS OVERVIEW ── */}
      <RevealSection style={{
        background: '#F7F9FC',
        borderTop: '1px solid rgba(10, 15, 28, 0.03)',
        borderBottom: '1px solid rgba(10, 15, 28, 0.03)',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        <section style={{
          padding: '120px 20px',
          maxWidth: 1240,
          margin: '0 auto',
          display: 'grid',
          gap: '56px',
          boxSizing: 'border-box'
        }}>
          <div style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gap: '56px' }}>
            {/* Section title */}
            <div style={{ textAlign: 'center', display: 'grid', gap: '12px', justifyItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#1A4E8D', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                OUR SOLUTIONS
              </span>
              <h2 style={{ fontSize: 'min(38px, 8vw)', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
                Built for Modern Business Growth
              </h2>
              <p style={{ fontSize: '16px', color: '#5F6B7A', margin: 0, maxWidth: '520px' }}>
                Connect each step of your commercial workflow into a clean, optimized digital structure.
              </p>
            </div>

            {/* Cards Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '32px'
            }}>
              {/* Card A: Map.DGFY */}
              <div style={{
                background: '#FFFFFF',
                borderRadius: '24px',
                border: '1px solid rgba(10, 15, 28, 0.05)',
                boxShadow: '0 8px 30px rgba(10,15,28,0.02)',
                padding: '32px',
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
                transition: 'transform 200ms ease'
              }}>
                <div>
                  <span style={{ display: 'inline-flex', padding: '10px', borderRadius: '12px', background: 'rgba(26, 78, 141, 0.08)', color: '#1A4E8D', marginBottom: '16px' }}>
                    <MapPin size={22} />
                  </span>
                  <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Map.DGFY</h3>
                  <div style={{ fontSize: '13px', color: '#1A4E8D', fontWeight: 700, marginTop: '2px' }}>Makes everything searchable</div>
                  <p style={{ margin: '12px 0 0', fontSize: '14px', lineHeight: 1.6, color: '#5F6B7A' }}>
                    Help customers discover nearby products and services through real-time location-based visibility.
                  </p>
                </div>

                {/* Bullet Features */}
                <div style={{ display: 'grid', gap: '10px' }}>
                  {['Nearby search', 'Product discovery', 'Service discovery', 'Live merchant visibility'].map((feat) => (
                    <div key={feat} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#5F6B7A' }}>
                      <CheckCircle2 size={14} color="#1A4E8D" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>

                {/* Mock Map Preview */}
                <div style={{
                  marginTop: 'auto',
                  height: '140px',
                  borderRadius: '16px',
                  background: '#EEF2F6',
                  position: 'relative',
                  overflow: 'hidden',
                  border: '1px solid rgba(10,15,28,0.04)',
                  display: 'grid',
                  placeItems: 'center'
                }}>
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage: 'radial-gradient(#CBD5E1 1.5px, transparent 1.5px)',
                    backgroundSize: '16px 16px',
                    opacity: 0.6
                  }} />
                  
                  {/* Traced Route SVG Path */}
                  <svg style={{ position: 'absolute', width: '100%', height: '100%' }}>
                    <path 
                      d="M 30,110 C 80,90 120,40 180,70" 
                      fill="none" 
                      stroke="#1A4E8D" 
                      strokeWidth="3" 
                      className="solutions-route-animated" 
                    />
                  </svg>
                  
                  <div style={{
                    position: 'absolute',
                    top: '12px',
                    left: '12px',
                    right: '12px',
                    background: '#FFFFFF',
                    borderRadius: '10px',
                    padding: '6px 12px',
                    boxShadow: '0 4px 12px rgba(10,15,28,0.06)',
                    fontSize: '11px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#94A3B8'
                  }}>
                    <Search size={12} color="#1A4E8D" />
                    <span>Search products or services...</span>
                  </div>
                  
                  {/* Map Pin Mark and Radial Pulse Glow */}
                  <div style={{
                    position: 'absolute',
                    left: '174px',
                    top: '52px',
                    color: '#1A4E8D',
                    display: 'grid',
                    placeItems: 'center',
                    width: '44px',
                    height: '44px'
                  }}>
                    <div className="solutions-pulse-glow" />
                    <MapPin size={24} fill="#1A4E8D" fillOpacity={0.2} style={{ zIndex: 1 }} />
                  </div>
                </div>
              </div>

              {/* Card B: DGFY POS */}
              <div style={{
                background: '#FFFFFF',
                borderRadius: '24px',
                border: '1px solid rgba(10, 15, 28, 0.05)',
                boxShadow: '0 8px 30px rgba(10,15,28,0.02)',
                padding: '32px',
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
                transition: 'transform 200ms ease'
              }}>
                <div>
                  <span style={{ display: 'inline-flex', padding: '10px', borderRadius: '12px', background: 'rgba(66, 199, 123, 0.08)', color: '#42C77B', marginBottom: '16px' }}>
                    <Zap size={22} />
                  </span>
                  <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>DGFY POS</h3>
                  <div style={{ fontSize: '13px', color: '#42C77B', fontWeight: 700, marginTop: '2px' }}>Digitizes daily sales</div>
                  <p style={{ margin: '12px 0 0', fontSize: '14px', lineHeight: 1.6, color: '#5F6B7A' }}>
                    Turn sales and checkout operations into structured transactions that are easier to manage.
                  </p>
                </div>

                {/* Bullet Features */}
                <div style={{ display: 'grid', gap: '10px' }}>
                  {['Sales tracking', 'Checkout system', 'Order management', 'Merchant operations'].map((feat) => (
                    <div key={feat} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#5F6B7A' }}>
                      <CheckCircle2 size={14} color="#42C77B" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>

                {/* Mock POS Dashboard Preview */}
                <div style={{
                  marginTop: 'auto',
                  height: '140px',
                  borderRadius: '16px',
                  background: '#EEF2F6',
                  position: 'relative',
                  overflow: 'hidden',
                  border: '1px solid rgba(10,15,28,0.04)',
                  padding: '12px',
                  display: 'grid',
                  gridTemplateRows: 'auto 1fr',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '9px', fontWeight: 800, color: '#0A0F1C' }}>Checkout Summary</span>
                    <span style={{ fontSize: '9px', fontWeight: 800, color: '#42C77B', background: 'rgba(66,199,123,0.1)', padding: '2px 6px', borderRadius: '4px' }}>Dine-in</span>
                  </div>
                  <div style={{ display: 'grid', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700 }}>
                      <span>Total Amount</span>
                      <span style={{ color: '#0A0F1C' }}>PHP 1,280.00</span>
                    </div>
                    <div style={{ height: '1px', background: 'rgba(10,15,28,0.06)' }} />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <div style={{ flex: 1, background: '#FFFFFF', border: '1px solid rgba(10,15,28,0.06)', borderRadius: '6px', fontSize: '8px', fontWeight: 700, padding: '4px', textAlign: 'center', color: '#5F6B7A' }}>Cash</div>
                      <div 
                        style={{ 
                          flex: 1, 
                          background: '#42C77B', 
                          color: '#FFFFFF', 
                          borderRadius: '6px', 
                          fontSize: '8px', 
                          fontWeight: 800, 
                          padding: '4px', 
                          textAlign: 'center', 
                          cursor: 'pointer',
                          transition: 'all 200ms ease'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.04)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                      >
                        Pay Now
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card C: DGFY Inventory */}
              <div style={{
                background: '#FFFFFF',
                borderRadius: '24px',
                border: '1px solid rgba(10, 15, 28, 0.05)',
                boxShadow: '0 8px 30px rgba(10,15,28,0.02)',
                padding: '32px',
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
                transition: 'transform 200ms ease'
              }}>
                <div>
                  <span style={{ display: 'inline-flex', padding: '10px', borderRadius: '12px', background: 'rgba(255, 159, 28, 0.08)', color: '#FF9F1C', marginBottom: '16px' }}>
                    <Sliders size={22} />
                  </span>
                  <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Inventory Engine</h3>
                  <div style={{ fontSize: '13px', color: '#FF9F1C', fontWeight: 700, marginTop: '2px' }}>Structures business data</div>
                  <p style={{ margin: '12px 0 0', fontSize: '14px', lineHeight: 1.6, color: '#5F6B7A' }}>
                    Manage products, stock batches, and pricing with real-time visibility for smarter business choices.
                  </p>
                </div>

                {/* Bullet Features */}
                <div style={{ display: 'grid', gap: '10px' }}>
                  {['Inventory management', 'Stock visibility', 'Pricing control', 'Real-time updates'].map((feat) => (
                    <div key={feat} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#5F6B7A' }}>
                      <CheckCircle2 size={14} color="#FF9F1C" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>

                {/* Mock Inventory Analytics Preview with Animated Bars */}
                <div style={{
                  marginTop: 'auto',
                  height: '140px',
                  borderRadius: '16px',
                  background: '#EEF2F6',
                  position: 'relative',
                  overflow: 'hidden',
                  border: '1px solid rgba(10,15,28,0.04)',
                  padding: '12px',
                  display: 'grid',
                  gridTemplateRows: 'auto 1fr',
                  gap: '8px'
                }}>
                  <span style={{ fontSize: '9px', fontWeight: 800, color: '#0A0F1C' }}>Stock Balance Status</span>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'end', height: '80%' }}>
                    <InventoryChartBar targetHeight="40%" delay="100ms" isHighlight={false} />
                    <InventoryChartBar targetHeight="75%" delay="250ms" isHighlight={false} />
                    <InventoryChartBar targetHeight="90%" delay="400ms" isHighlight={true} />
                    <InventoryChartBar targetHeight="50%" delay="550ms" isHighlight={false} />
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom SKUpervisor support strip */}
            <div style={{
              background: 'rgba(26, 78, 141, 0.03)',
              border: '1px solid rgba(26, 78, 141, 0.08)',
              borderRadius: '20px',
              padding: '20px 24px',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: '#1A4E8D',
                  color: '#FFFFFF',
                  fontSize: '15px',
                  fontWeight: 900,
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0
                }}>
                  S
                </span>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#0A0F1C' }}>
                  Powered by SKUPERVISOR
                </span>
              </div>
              <div style={{ fontSize: '14px', color: '#5F6B7A', flex: '1 1 400px', lineHeight: 1.5 }}>
                Enterprise-grade procurement, batch-FIFO tracking, and multi-location inventory sync powering DGFY&apos;s operational backbone.
              </div>
            </div>
          </div>
        </section>
      </RevealSection>

      {/* ── 3. UNIFIED SYSTEM SECTION ── */}
      <RevealSection>
        <section style={{
          padding: '120px 20px',
          maxWidth: 1240,
          margin: '0 auto',
          display: 'grid',
          gap: '56px'
        }}>
          {/* Title */}
          <div style={{ textAlign: 'center', display: 'grid', gap: '12px', justifyItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#1A4E8D', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              WHY DGFY?
            </span>
            <h2 style={{ fontSize: 'min(38px, 8vw)', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
              One System. All Connected.
            </h2>
            <p style={{ fontSize: '16px', color: '#5F6B7A', margin: 0, maxWidth: '520px' }}>
              Traditional disconnected apps introduce data delays and sync issues. DGFY bridges everything automatically.
            </p>
          </div>

          {/* 2-column Comparison grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '40px',
            alignItems: 'stretch'
          }}>
            {/* Traditional Setup (Gray/Muted) */}
            <div style={{
              background: '#F8FAFC',
              borderRadius: '24px',
              border: '1px solid rgba(10,15,28,0.04)',
              padding: '36px',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px'
            }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#5F6B7A' }}>Traditional Setup</h3>
              <p style={{ margin: 0, fontSize: '14px', color: '#5F6B7A', lineHeight: 1.5 }}>
                Manual updates, delayed reports, and zero discoverability for nearby local shoppers.
              </p>
              <div style={{ display: 'grid', gap: '12px', marginTop: '8px' }}>
                {['Facebook Pages', 'Standalone Retail POS', 'Basic Store Website', 'Google Maps Locations', 'Manual Excel Inventory'].map((item) => (
                  <div key={item} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    fontSize: '14px',
                    color: '#5F6B7A',
                    padding: '10px 14px',
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid rgba(10,15,28,0.03)'
                  }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#94A3B8' }} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* DGFY Unified Setup (Vibrant/Active Blue) */}
            <div style={{
              background: 'rgba(26, 78, 141, 0.02)',
              borderRadius: '24px',
              border: '2px solid #1A4E8D',
              padding: '36px',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
              boxShadow: '0 20px 48px rgba(26, 78, 141, 0.05)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1A4E8D' }}>DGFY Unified Layer</h3>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#1A4E8D', background: 'rgba(26, 78, 141, 0.08)', padding: '4px 10px', borderRadius: '99px' }}>RECOMMENDED</span>
              </div>
              <p style={{ margin: 0, fontSize: '14px', color: '#5F6B7A', lineHeight: 1.5 }}>
                Immediate discoverability, live inventory synchronizations, and unified retail + food storefronts.
              </p>
              <div style={{ display: 'grid', gap: '12px', marginTop: '8px' }}>
                {[
                  'Discover local products & services instantly',
                  'Manage all walk-in and online transactions',
                  'Real-time inventory synchronization',
                  'Live map-based search visibility',
                  'One single operational database'
                ].map((item) => (
                  <div key={item} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    fontSize: '14px',
                    color: '#0A0F1C',
                    fontWeight: 600,
                    padding: '10px 14px',
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    boxShadow: '0 4px 12px rgba(26, 78, 141, 0.02)',
                    border: '1px solid rgba(26, 78, 141, 0.05)'
                  }}>
                    <CheckCircle2 size={16} color="#1A4E8D" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </RevealSection>

      {/* ── 4. FINAL CTA BANNER ── */}
      <RevealSection>
        <section style={{
          padding: '80px 20px 120px',
          maxWidth: 1240,
          margin: '0 auto'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #0A0F1C 0%, #0F172A 100%)',
            borderRadius: '32px',
            padding: '56px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '32px',
            boxShadow: '0 30px 60px rgba(10,15,28,0.15)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
              opacity: 0.8
            }} />

            {/* Left Text */}
            <div style={{ display: 'grid', gap: '14px', zIndex: 1, flex: '1 1 420px' }}>
              <h2 style={{ margin: 0, fontSize: 'min(36px, 8vw)', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
                Ready to Grow with DGFY?
              </h2>
              <p style={{ margin: 0, fontSize: '16px', color: '#94A3B8', maxWidth: '440px', lineHeight: 1.5 }}>
                Register your business, digitize your catalogs, and become discoverable on the main local map registry today.
              </p>
            </div>

            {/* Right Action Button */}
            <div style={{ zIndex: 1 }}>
              <button
                type="button"
                onClick={handleRegisterRedirect}
                style={{
                  background: '#1A4E8D',
                  color: '#FFFFFF',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '16px',
                  padding: '16px 36px',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 10px 30px rgba(26, 78, 141, 0.3)',
                  transition: 'all 200ms ease'
                }}
              >
                Register Your Business
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </section>
      </RevealSection>

      {/* ── 5. FOOTER ── */}
      <footer id="solutions-contact-anchor" style={{
        width: '100%',
        background: 'linear-gradient(180deg, #0c3c86 0%, #0a3475 38%, #082c63 100%)',
        color: '#fff',
        overflow: 'hidden',
        boxSizing: 'border-box',
        position: 'relative'
      }}>
        <div style={{ position: 'absolute', top: -42, left: '-4%', right: '-4%', height: 88, background: 'linear-gradient(90deg, rgba(59,130,246,.38) 0%, rgba(96,165,250,.18) 35%, rgba(59,130,246,.34) 100%)', borderBottomLeftRadius: '50% 100%', borderBottomRightRadius: '50% 100%', opacity: 0.9 }} />
        <div style={{ position: 'absolute', top: -20, left: '-8%', right: '-8%', height: 54, background: 'linear-gradient(90deg, rgba(255,255,255,.12) 0%, rgba(255,255,255,.04) 50%, rgba(255,255,255,.10) 100%)', borderBottomLeftRadius: '50% 100%', borderBottomRightRadius: '50% 100%', opacity: 0.75 }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto', padding: '108px 24px 48px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 36,
              justifyItems: 'stretch'
            }}
          >
            {[
              {
                title: 'Company',
                links: [
                  { label: 'Contact', href: '/contact' },
                  { label: 'Privacy Policy', href: '/privacy' },
                  { label: 'Terms & Conditions', href: '/terms' }
                ]
              },
              {
                title: 'Explore',
                links: [
                  { label: 'Products', href: '/' },
                  { label: 'Services', href: '/' },
                  { label: 'Merchants', href: '/' }
                ]
              },
              {
                title: 'For Business',
                links: [
                  { label: 'Register Your Business', href: buildBusinessRegistrationUrl() },
                  { label: 'Business Login', href: buildBusinessLoginUrl() }
                ]
              },
              {
                title: 'Contact',
                links: [
                  { label: 'Email', href: 'mailto:hello@dgfy.ph' },
                  { label: 'Facebook', href: 'https://facebook.com' },
                  { label: 'Instagram', href: 'https://instagram.com' },
                  { label: 'LinkedIn', href: 'https://linkedin.com' }
                ]
              }
            ].map((group) => (
              <div
                key={group.title}
                style={{
                  display: 'grid',
                  gap: 16,
                  alignContent: 'start',
                  justifyItems: 'start',
                  textAlign: 'left'
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ffffff' }}>
                  {group.title}
                </div>
                <div style={{ display: 'grid', gap: 12 }}>
                  {group.links.map((link) => (
                    <a
                      key={`${group.title}-${link.label}`}
                      href={link.href}
                      target={String(link.href).startsWith('http') ? '_blank' : undefined}
                      rel={String(link.href).startsWith('http') ? 'noreferrer' : undefined}
                      style={{ fontSize: 16, lineHeight: 1.55, color: 'rgba(226,232,240,.96)', textDecoration: 'none' }}
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 54, height: 1, background: 'rgba(226,232,240,.18)' }} />

          <div style={{ display: 'grid', justifyItems: 'center', textAlign: 'center', gap: 14, paddingTop: 34 }}>
            {logoSrc && (
              <img src={logoSrc} alt="DGFY logo" style={{ width: 340, maxWidth: '88%', height: 'auto', display: 'block' }} />
            )}
            <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.04em', color: '#ffffff' }}>
              <span style={{ color: '#aee8f4' }}>D</span>iscover{' '}
              <span style={{ color: '#aee8f4' }}>G</span>oods{' '}
              <span style={{ color: '#aee8f4' }}>F</span>or{' '}
              <span style={{ color: '#aee8f4' }}>Y</span>ou
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(226,232,240,.86)', maxWidth: 540 }}>
              Search nearby products, services, and businesses faster with a discovery experience built for modern local commerce.
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: 'rgba(203,213,225,.78)' }}>
              © {new Date().getFullYear()} DGFY. Powered by SKUpervisor. All Rights Reserved.
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}

export default SolutionsPage;
