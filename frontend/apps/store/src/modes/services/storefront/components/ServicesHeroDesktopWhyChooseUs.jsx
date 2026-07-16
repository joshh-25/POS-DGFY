import React from 'react';
import { CheckCircle2 } from 'lucide-react';

const ServicesHeroDesktopWhyChooseUs = ({
  servicesBodyFont,
  servicesPrimary,
  visibleWhyChooseUs
}) => (
  <div style={{ display: 'grid', gap: 14, paddingLeft: 26, borderLeft: '1px solid #eef2f6', alignContent: 'start' }}>
    <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: servicesBodyFont }}>Why Choose Us?</div>
    <div style={{ display: 'grid', gap: 12, paddingTop: 4 }}>
      {visibleWhyChooseUs.map((item, index) => (
        <div key={`why-${index}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ color: servicesPrimary, marginTop: 2, display: 'flex' }}><CheckCircle2 size={16} /></div>
          <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.4, fontFamily: servicesBodyFont }}>{item}</div>
        </div>
      ))}
    </div>
  </div>
);

export { ServicesHeroDesktopWhyChooseUs };

