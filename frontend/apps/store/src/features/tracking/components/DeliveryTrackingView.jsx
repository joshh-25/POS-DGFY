import React, { useEffect, useRef, useState } from 'react';
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
  Receipt
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

export const DeliveryTrackingView = ({ result, mapProps, formatting, onBackToMenu }) => {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const markersRef = useRef([]);
  const [copiedField, setCopiedField] = useState('');

  const isMobileViewport = typeof window !== 'undefined' ? window.innerWidth <= 768 : false;
  const currentStatus = result?.order?.status || result?.order?.fulfillment_status || 'placed';
  const currentIndex = getTimelineIndex(currentStatus);
  const trackingPin = String(result?.tracking_pin || '').trim();

  const steps = [
    { label: 'Order placed', time: formatting.scheduleLabel !== 'ASAP' ? formatting.scheduleLabel : 'Just now' },
    { label: 'Confirmed by store', time: currentIndex >= 1 ? 'Updated' : '-' },
    { label: 'Preparing', time: currentIndex >= 2 ? 'Updated' : '-' },
    { label: 'Out for delivery', time: currentIndex >= 3 ? 'Updated' : '-' },
    { label: 'Delivered', time: currentIndex >= 4 ? 'Updated' : '-' }
  ];

  const copyText = async (value, field) => {
    const content = String(value || '').trim();
    if (!content || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopiedField(field);
      setTimeout(() => setCopiedField((prev) => (prev === field ? '' : prev)), 1400);
    } catch {
      // no-op
    }
  };

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
        paint: { 'line-color': '#1a4e8d', 'line-width': 4, 'line-dasharray': [2, 2] }
      });

      const storeMarker = new maplibregl.Marker({
        element: createMarkerElement('#1a4586', '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>')
      }).setLngLat([startPin.longitude, startPin.latitude]).addTo(map);

      const customerMarker = new maplibregl.Marker({
        element: createMarkerElement('#f97316', '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>')
      }).setLngLat([endPin.longitude, endPin.latitude]).addTo(map);

      markersRef.current = [storeMarker, customerMarker];
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      map.remove();
      mapRef.current = null;
    };
  }, [mapProps]);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobileViewport ? 0 : '20px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 400px', gap: 24, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a' }}>Track Your Order</h2>
              <p style={{ margin: '4px 0 0', fontSize: 14, color: '#64748b' }}>Live updates from store to your doorstep</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f1f5f9', padding: '6px 12px', borderRadius: 999 }}>
              <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Order PIN: <strong>{trackingPin || 'N/A'}</strong></span>
              <button type="button" onClick={() => copyText(trackingPin, 'pin:header')} style={{ border: 'none', background: 'transparent', color: '#1a4e8d', fontWeight: 800, fontSize: 13, cursor: 'pointer', padding: 0 }}>
                {copiedField === 'pin:header' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

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
                  {result?.order?.estimated_wait_minutes ? `${Math.max(10, result.order.estimated_wait_minutes - 5)}-${result.order.estimated_wait_minutes + 5} mins` : 'Pending'}
                </div>
                <div style={{ fontSize: 14, color: '#64748b' }}>{formatting.fulfillmentGuidanceText}</div>
              </div>
            </div>
          </div>

          <div style={{ padding: '16px 8px', display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 32, left: 30, right: 30, height: 3, background: '#e2e8f0', zIndex: 0 }} />
            <div style={{ position: 'absolute', top: 32, left: 30, width: `${(currentIndex / 4) * 100}%`, height: 3, background: '#1a4e8d', zIndex: 1, transition: 'width 0.5s ease' }} />
            {steps.map((step, idx) => (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 2, flex: 1 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: idx <= currentIndex ? '#1a4e8d' : '#fff', border: `3px solid ${idx <= currentIndex ? '#1a4e8d' : '#e2e8f0'}`, color: idx <= currentIndex ? '#fff' : '#94a3b8', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 800 }}>
                  {idx < currentIndex ? <Check size={16} strokeWidth={3} /> : (idx + 1)}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: idx <= currentIndex ? '#0f172a' : '#64748b' }}>{step.label}</div>
                  <div style={{ fontSize: 11, color: idx === currentIndex ? '#1a4e8d' : '#94a3b8', fontWeight: 600 }}>{step.time}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ border: '1px solid #bfdbfe', borderRadius: 16, background: '#eff6ff', padding: 20, display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ color: '#1a4e8d' }}><CheckCircle2 size={32} /></div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#1e3a8a' }}>{steps[currentIndex].label}</div>
              <div style={{ fontSize: 14, color: '#1a4586', marginTop: 2 }}>{formatting.fulfillmentGuidanceText}</div>
            </div>
          </div>

          <div ref={containerRef} style={{ height: 320, borderRadius: 20, border: '1px solid #e2e8f0', overflow: 'hidden', background: '#f1f5f9' }} />

          {currentIndex >= 3 && (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 20, padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f1f5f9', display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 900, color: '#64748b' }}>RD</div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Delivery rider</div>
                  <div style={{ fontSize: 14, color: '#64748b' }}>Rider details pending</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button type="button" style={{ width: 48, height: 48, borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', color: '#0f172a', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><MessageSquare size={20} /></button>
                <button type="button" style={{ width: 48, height: 48, borderRadius: 12, border: '1px solid #1a4e8d', background: '#eff6ff', color: '#1a4e8d', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Phone size={20} /></button>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(3, 1fr)', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12 }}><MapPin size={24} color="#1a4e8d" /><div><div style={{ fontSize: 14, fontWeight: 800 }}>Live tracking</div><div style={{ fontSize: 12, color: '#64748b' }}>Real-time updates on your order</div></div></div>
            <div style={{ display: 'flex', gap: 12 }}><ShieldCheck size={24} color="#1a4e8d" /><div><div style={{ fontSize: 14, fontWeight: 800 }}>Your safety matters</div><div style={{ fontSize: 12, color: '#64748b' }}>Verified and secure transactions</div></div></div>
            <div style={{ display: 'flex', gap: 12 }}><ThumbsUp size={24} color="#1a4e8d" /><div><div style={{ fontSize: 14, fontWeight: 800 }}>Top-rated support</div><div style={{ fontSize: 12, color: '#64748b' }}>We&apos;re here to help anytime</div></div></div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Order Details</h3>
            <div style={{ display: 'grid', gap: 16, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Order PIN</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{trackingPin || 'N/A'}</div>
                  <button type="button" onClick={() => copyText(trackingPin, 'pin:details')} style={{ border: 'none', background: 'transparent', fontSize: 13, color: '#1a4e8d', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                    {copiedField === 'pin:details' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 12, borderTop: '1px dashed #e2e8f0', borderBottom: '1px dashed #e2e8f0', padding: '16px 0' }}>
              {(Array.isArray(result?.cart_lines) ? result.cart_lines : []).map((line) => (
                <div key={`track-line-${line.item_id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                      {line.image_url ? <img src={line.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#cbd5e1' }}><Receipt size={20} /></div>}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{line.name} x {Math.max(1, Number(line.quantity || 1))}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{formatting.money((Number(line.quantity || 0) || 0) * (Number(line.price || 0) || 0))}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#64748b' }}><span>Subtotal</span><span>{formatting.totalLabel}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 900, color: '#0f172a' }}><span>Total</span><span>{formatting.totalLabel}</span></div>
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 20 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Need Help?</h3>
            <div style={{ display: 'grid', gap: 12 }}>
              <button type="button" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 14, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#0f172a', fontWeight: 700 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><MessageSquare size={18} /> Chat with support</span><span>&rsaquo;</span></button>
              <button type="button" onClick={onBackToMenu} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 14, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#0f172a', fontWeight: 700 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><HelpCircle size={18} /> Back to menu</span><span>&rsaquo;</span></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
