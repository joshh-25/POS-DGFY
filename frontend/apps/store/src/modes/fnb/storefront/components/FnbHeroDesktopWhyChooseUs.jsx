import React from 'react';
import { Sparkles } from 'lucide-react';

const FnbHeroDesktopWhyChooseUs = ({
  STYLES,
  heroTheme,
  visibleWhyChooseUs
}) => (
  <div style={{ display: 'grid', gap: 14, alignContent: 'start', alignItems: 'start', paddingLeft: 26, borderLeft: '1px solid #eef2f6' }}>
    <div style={{ fontSize: 13, fontWeight: 800, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: heroTheme.bodyFont }}>Why Choose Us?</div>
    <div style={{ display: 'grid', gap: 16, alignContent: 'start', paddingTop: 4 }}>
      {visibleWhyChooseUs.map((item, index) => (
        <div key={`${item}-${index}`} style={{ display: 'grid', gridTemplateColumns: '30px minmax(0, 1fr)', alignItems: 'center', columnGap: 12, fontSize: 13, color: '#111827', lineHeight: 1.4, fontFamily: heroTheme.bodyFont }}>
          <div style={{ width: 30, height: 30, borderRadius: 999, background: '#fff4ec', color: '#f97316', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Sparkles size={14} />
          </div>
          <div style={{ color: '#334155', fontWeight: 600 }}>{item}</div>
        </div>
      ))}
    </div>
  </div>
);

export { FnbHeroDesktopWhyChooseUs };

