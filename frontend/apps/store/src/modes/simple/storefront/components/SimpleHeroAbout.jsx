import React from 'react';

const SimpleHeroAbout = ({
  STYLES,
  aboutText,
  hasAboutToggle,
  heroTheme
}) => (
  <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
    <div style={{ fontSize: 13, fontWeight: 800, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: heroTheme.bodyFont }}>About Us</div>
    <div style={{ display: 'grid', gap: 10 }}>
      <p style={{
        fontSize: 13,
        lineHeight: 1.7,
        color: '#475569',
        margin: 0,
        display: '-webkit-box',
        WebkitLineClamp: hasAboutToggle ? 3 : 'unset',
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        fontFamily: heroTheme.bodyFont
      }}>
        {aboutText}
      </p>
    </div>
  </div>
);

export { SimpleHeroAbout };

