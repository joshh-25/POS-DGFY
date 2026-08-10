import React from 'react';
import { ShoppingBag } from 'lucide-react';

export function StorefrontCartFlyAnimations({
  animations = [],
  accentColor = '#0f766e',
  accentSoft = 'rgba(15,118,110,0.16)',
  accentStrong = 'rgba(45,212,191,0.32)',
  borderColor = 'rgba(15,118,110,0.22)',
  icon: Icon = ShoppingBag
}) {
  if (!animations.length) return null;

  return (
    <>
      <style>{`
        @keyframes service-cart-fly-anim {
          0% {
            transform: translate3d(0, 0, 0) scale(1);
            opacity: 0.96;
          }
          70% {
            transform: translate3d(var(--service-cart-fly-x), var(--service-cart-fly-y), 0) scale(0.48);
            opacity: 0.88;
          }
          100% {
            transform: translate3d(var(--service-cart-fly-x), var(--service-cart-fly-y), 0) scale(0.2);
            opacity: 0;
          }
        }
      `}</style>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 2195 }}>
        {animations.map((animation) => {
          const iconSize = Math.max(18, Math.round(animation.size * 0.38));
          return (
            <div
              key={animation.id}
              style={{
                position: 'fixed',
                left: animation.startX,
                top: animation.startY,
                width: animation.size,
                height: animation.size,
                borderRadius: 18,
                background: `linear-gradient(135deg, ${accentSoft}, ${accentStrong})`,
                border: `1px solid ${borderColor}`,
                boxShadow: '0 18px 38px rgba(15,23,42,0.16)',
                backdropFilter: 'blur(8px)',
                animation: 'service-cart-fly-anim 620ms cubic-bezier(.2,.8,.2,1) forwards',
                '--service-cart-fly-x': `${animation.deltaX}px`,
                '--service-cart-fly-y': `${animation.deltaY}px`
              }}
            >
              <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: accentColor }}>
                <Icon size={iconSize} strokeWidth={2.2} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
