import React from 'react';
import { Sparkles } from 'lucide-react';

const ServicesHeroDesktopWhyChooseUs = ({
  servicesBodyFont,
  servicesPrimary,
  servicesPrimarySoft,
  visibleWhyChooseUs
}) => (
  <div style={{ display: 'grid', gap: 14, alignContent: 'start', alignItems: 'start', paddingLeft: 26, borderLeft: '1px solid #eef2f6' }}>
    <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: servicesBodyFont }}>Why Choose Us?</div>
    <div style={{ display: 'grid', gap: 16, alignContent: 'start', paddingTop: 4 }}>
      {visibleWhyChooseUs.map((item, index) => (
        <div key={`why-${index}`} style={{ display: 'grid', gridTemplateColumns: '30px minmax(0, 1fr)', alignItems: 'center', columnGap: 12, fontSize: 13, color: '#111827', lineHeight: 1.4, fontFamily: servicesBodyFont }}>
          <div style={{ width: 30, height: 30, borderRadius: 999, background: servicesPrimarySoft, color: servicesPrimary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Sparkles size={14} />
          </div>
          <div style={{ color: '#334155', fontWeight: 600 }}>{item}</div>
        </div>
      ))}
    </div>
  </div>
);

export { ServicesHeroDesktopWhyChooseUs };
