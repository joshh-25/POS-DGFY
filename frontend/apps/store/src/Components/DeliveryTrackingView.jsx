import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { 
  Check, 
  CheckCircle2, 
  MapPin, 
  MessageSquare, 
  Phone, 
  Clock, 
  Store, 
  ChefHat, 
  Bike, 
  PackageCheck,
  ShieldCheck,
  ThumbsUp,
  HelpCircle,
  Receipt,
  Copy
} from 'lucide-react';

const createMarkerElement = (color, iconHtml) => {
  const el = document.createElement('div');
  el.style.width = '36px';
  el.style.height = '36px';
  el.style.backgroundColor = color;
  el.style.borderRadius = '50%';
  el.style.border = '3px solid #fff';
  el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.color = '#fff';
  el.innerHTML = iconHtml;
  return el;
};

// Map backend statuses to the 5-step timeline
const getTimelineIndex = (status) => {
  switch (status) {
    case 'placed': return 0;
    case 'confirmed': return 1;
    case 'preparing': return 2;
    case 'ready': 
    case 'out_for_delivery': return 3;
    case 'completed':
    case 'delivered': return 4;
    default: return 0;
  }
};

export const DeliveryTrackingView = ({
  result,
  mapProps,
  formatting,
  onBackToMenu
}) => {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const markersRef = useRef([]);

  const isMobileViewport = window.innerWidth <= 768;
  const currentStatus = result?.order?.status || result?.order?.fulfillment_status || 'placed';
  const currentIndex = getTimelineIndex(currentStatus);

  const steps = [
    { label: 'Order placed', time: formatting.scheduleLabel !== 'ASAP' ? formatting.scheduleLabel : 'Just now' },
    { label: 'Confirmed by store', time: currentIndex >= 1 ? 'Updated' : '-' },
    { label: 'Preparing', time: currentIndex >= 2 ? 'Updated' : '-' },
    { label: 'Out for delivery', time: currentIndex >= 3 ? 'Updated' : '-' },
    { label: 'Delivered', time: currentIndex >= 4 ? 'Updated' : '-' }
  ];

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const { TILING_SERVER, tileTransformRequest, startPin, endPin } = mapProps;
    if (!startPin || !endPin) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: TILING_SERVER,
      transformRequest: tileTransformRequest,
      bounds: [
        [Math.min(startPin.longitude, endPin.longitude), Math.min(startPin.latitude, endPin.latitude)],
        [Math.max(startPin.longitude, endPin.longitude), Math.max(startPin.latitude, endPin.latitude)]
      ],
      fitBoundsOptions: { padding: 40 }
    });
    mapRef.current = map;

    map.on('load', () => {
      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [startPin.longitude, startPin.latitude],
              [endPin.longitude, endPin.latitude]
            ]
          }
        }
      });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#1a4e8d',
          'line-width': 4,
          'line-dasharray': [2, 2]
        }
      });

      const storeMarker = new maplibregl.Marker({ 
        element: createMarkerElement('#1a4586', '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>') 
      })
        .setLngLat([startPin.longitude, startPin.latitude])
        .addTo(map);
      
      const customerMarker = new maplibregl.Marker({ 
        element: createMarkerElement('#f97316', '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>') 
      })
        .setLngLat([endPin.longitude, endPin.latitude])
        .addTo(map);

      markersRef.current = [storeMarker, customerMarker];
    });

    return () => {
      markersRef.current.forEach(m => m.remove());
      map.remove();
      mapRef.current = null;
    };
  }, [mapProps]);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobileViewport ? 0 : '20px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 400px', gap: 24, alignItems: 'start' }}>
        
        {/* Left Column: Live Tracking */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a' }}>Track Your Order</h2>
              <p style={{ margin: '4px 0 0', fontSize: 14, color: '#64748b' }}>Live updates from store to your doorstep</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f1f5f9', padding: '6px 12px', borderRadius: 999 }}>
              <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Order PIN: <strong>{result?.tracking_pin}</strong></span>
              <button style={{ border: 'none', background: 'transparent', color: '#1a4e8d', fontWeight: 800, fontSize: 13, cursor: 'pointer', padding: 0 }}>Copy</button>
            </div>
          </div>

          {/* Hero Banner */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 20, padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#eff6ff', color: '#1a4e8d', display: 'grid', placeItems: 'center' }}>
                {currentIndex === 0 && <Clock size={28} />}
                {currentIndex === 1 && <Store size={28} />}
                {currentIndex === 2 && <ChefHat size={28} />}
                {currentIndex === 3 && <Bike size={28} />}
                {currentIndex === 4 && <PackageCheck size={28} />}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estimated arrival</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', margin: '2px 0 4px' }}>
                  {result?.order?.estimated_wait_minutes ? `${Math.max(10, result.order.estimated_wait_minutes - 5)}–${result.order.estimated_wait_minutes + 5} mins` : 'Pending'}
                </div>
                <div style={{ fontSize: 14, color: '#64748b' }}>{formatting.fulfillmentGuidanceText}</div>
              </div>
            </div>
            {/* Minimalist illustration placeholder based on state */}
            {!isMobileViewport && (
              <div style={{ color: '#cbd5e1' }}>
                {currentIndex <= 1 ? <Store size={80} strokeWidth={1} /> : currentIndex === 2 ? <ChefHat size={80} strokeWidth={1} /> : <Bike size={80} strokeWidth={1} />}
              </div>
            )}
          </div>

          {/* 5-Step Timeline */}
          <div style={{ padding: '16px 8px', display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 32, left: 30, right: 30, height: 3, background: '#e2e8f0', zIndex: 0 }} />
            <div style={{ position: 'absolute', top: 32, left: 30, width: `${(currentIndex / 4) * 100}%`, height: 3, background: '#1a4e8d', zIndex: 1, transition: 'width 0.5s ease' }} />
            
            {steps.map((step, idx) => (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 2, flex: 1 }}>
                <div style={{ 
                  width: 32, height: 32, borderRadius: '50%', 
                  background: idx <= currentIndex ? '#1a4e8d' : '#fff',
                  border: `3px solid ${idx <= currentIndex ? '#1a4e8d' : '#e2e8f0'}`,
                  color: idx <= currentIndex ? '#fff' : '#94a3b8',
                  display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 800,
                  boxShadow: idx === currentIndex ? '0 0 0 4px rgba(26, 78, 141, 0.15)' : 'none'
                }}>
                  {idx < currentIndex ? <Check size={16} strokeWidth={3} /> : (idx + 1)}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: idx <= currentIndex ? '#0f172a' : '#64748b' }}>{step.label}</div>
                  <div style={{ fontSize: 11, color: idx === currentIndex ? '#1a4e8d' : '#94a3b8', fontWeight: 600 }}>{step.time}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Status Alert */}
          <div style={{ border: '1px solid #bfdbfe', borderRadius: 16, background: '#eff6ff', padding: 20, display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ color: '#1a4e8d' }}><CheckCircle2 size={32} /></div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#1e3a8a' }}>{steps[currentIndex].label}</div>
              <div style={{ fontSize: 14, color: '#1a4586', marginTop: 2 }}>{formatting.fulfillmentGuidanceText}</div>
            </div>
          </div>

          {/* Map */}
          <div style={{ position: 'relative' }}>
            <div 
              ref={containerRef} 
              style={{ height: 320, borderRadius: 20, border: '1px solid #e2e8f0', overflow: 'hidden', background: '#f1f5f9' }} 
            />
          </div>

          {/* Rider / Driver Profile (Mocked since we don't have real riders yet) */}
          {currentIndex >= 3 && (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 20, padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f1f5f9', display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 900, color: '#64748b' }}>
                  RD
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Delivery Rider</div>
                  <div style={{ fontSize: 14, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                    Your Rider • 4.9 <span style={{ color: '#f59e0b' }}>★</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button style={{ width: 48, height: 48, borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', color: '#0f172a', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><MessageSquare size={20} /></button>
                <button style={{ width: 48, height: 48, borderRadius: 12, border: '1px solid #1a4e8d', background: '#eff6ff', color: '#1a4e8d', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Phone size={20} /></button>
              </div>
            </div>
          )}

          {/* Trust Badges */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(3, 1fr)', gap: 16, marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ color: '#1a4e8d' }}><MapPin size={24} /></div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>Live tracking</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Real-time updates on your order</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ color: '#1a4e8d' }}><ShieldCheck size={24} /></div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>Your safety matters</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Verified and secure transactions</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ color: '#1a4e8d' }}><ThumbsUp size={24} /></div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>Top-rated support</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>We're here to help anytime</div>
              </div>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', margin: '24px 0' }}>
            <button onClick={onBackToMenu} style={{ minWidth: 160, padding: '14px 24px', borderRadius: 14, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>Back to Menu</button>
            <button style={{ minWidth: 160, padding: '14px 24px', borderRadius: 14, border: 'none', background: '#1a4e8d', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>{currentIndex >= 4 ? 'Order Again' : 'Need Help?'}</button>
          </div>

        </div>

        {/* Right Column: Order Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* Receipt Card */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 24, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Order Details</h3>
              <span style={{ fontSize: 13, color: '#1a4e8d', fontWeight: 700, cursor: 'pointer' }}>View receipt</span>
            </div>
            
            <div style={{ display: 'grid', gap: 16, marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Order PIN</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{result?.tracking_pin}</div>
                  <span style={{ fontSize: 13, color: '#1a4e8d', fontWeight: 700, cursor: 'pointer' }}>Copy</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Order time</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{formatting.scheduleLabel !== 'ASAP' ? formatting.scheduleLabel : 'Just now'}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 16, borderTop: '1px dashed #e2e8f0', borderBottom: '1px dashed #e2e8f0', padding: '20px 0' }}>
              {(Array.isArray(result?.cart_lines) ? result.cart_lines : []).map((line) => (
                <div key={`track-line-${line.item_id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                      {line.image_url ? (
                        <img src={line.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#cbd5e1' }}><Receipt size={20} /></div>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{line.name} × {Math.max(1, Number(line.quantity || 1))}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                    {formatting.money((Number(line.quantity || 0) || 0) * (Number(line.price || 0) || 0))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gap: 12, marginTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#64748b' }}>
                <span>Subtotal</span>
                <span>{formatting.totalLabel}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#64748b' }}>
                <span>Delivery fee</span>
                <span>Calculated at store</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 900, color: '#0f172a', marginTop: 8 }}>
                <span>Total</span>
                <span>{formatting.totalLabel}</span>
              </div>
            </div>
          </div>

          {/* Delivery To Card */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 20, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Delivery To</h3>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ color: '#f97316', marginTop: 2 }}><MapPin size={20} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', lineHeight: 1.4 }}>
                  {result?.order?.delivery_address || 'Customer location'}
                </div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                  Pinned map coordinate: {mapProps.endPin.latitude}, {mapProps.endPin.longitude}
                </div>
              </div>
              <span style={{ fontSize: 13, color: '#1a4e8d', fontWeight: 700, cursor: 'pointer' }}>Change</span>
            </div>
          </div>

          {/* Need Help Card */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 20, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Need Help?</h3>
            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ color: '#64748b' }}><MessageSquare size={20} /></div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>Chat with support</span>
                </div>
                <span style={{ color: '#94a3b8' }}>›</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ color: '#64748b' }}><HelpCircle size={20} /></div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>View help center</span>
                </div>
                <span style={{ color: '#94a3b8' }}>›</span>
              </div>
            </div>
          </div>

          {/* Thank You Footer Note */}
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 16, padding: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 24 }}>🛍️</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#14532d' }}>Thank you for your order!</div>
              <div style={{ fontSize: 13, color: '#166534' }}>We'll update you as your order progresses.</div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
