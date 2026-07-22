import React from 'react';
import { Sparkles } from 'lucide-react';

const SimpleHeroWhyShopHere = ({
  STYLES,
  heroTheme,
  isMobileViewport,
  visibleWhyChooseUs
}) => (
  <div style={{ display: 'grid', gap: 14, alignContent: 'start', alignItems: 'start', paddingLeft: isMobileViewport ? 0 : 26, borderLeft: isMobileViewport ? 'none' : '1px solid #eef2f6' }}>
    <div style={{ fontSize: 13, fontWeight: 800, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: heroTheme.bodyFont }}>Why Shop Here?</div>
    <div style={{ display: 'grid', gap: 16, alignContent: 'start', paddingTop: 4 }}>
      {visibleWhyChooseUs.map((item, index) => (
        <div key={`${item}-${index}`} style={{ display: 'grid', gridTemplateColumns: '30px minmax(0, 1fr)', alignItems: 'center', columnGap: 12, fontSize: 13, color: '#334155', lineHeight: 1.35 }}>
          <div style={{ width: 30, height: 30, borderRadius: 999, background: '#ecfeff', color: heroTheme.accent || '#0f766e', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Sparkles size={14} />
          </div>
          <div>{item}</div>
        </div>
      ))}
    </div>
  </div>
);

export { SimpleHeroWhyShopHere };

