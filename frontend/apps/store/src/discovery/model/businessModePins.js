export const BUSINESS_MODE_PIN_META = Object.freeze({
  retail: { icon: 'ShoppingBag', label: 'Retail', color: '#ea580c' },
  services: { icon: 'CalendarCheck', label: 'Services', color: '#1a4e8d' },
  food_manufacturing: { icon: 'Factory', label: 'Food Manufacturing', color: '#16a34a' },
  manufacturing: { icon: 'Factory', label: 'Food Manufacturing', color: '#16a34a' },
  fnb: { icon: 'Utensils', label: 'Food & Beverage', color: '#dc2626' },
  hospitality: { icon: 'Hotel', label: 'Hospitality', color: '#d97706' },
  healthcare: { icon: 'HeartPulse', label: 'Healthcare', color: '#0f766e' },
  ticketing_transport: { icon: 'Ticket', label: 'Ticketing & Transport', color: '#1a4e8d' },
  logistics_distribution: { icon: 'Truck', label: 'Logistics & Distribution', color: '#1e3a8a' },
  education_institutions: { icon: 'GraduationCap', label: 'Education & Institutions', color: '#4338ca' },
  msme: { icon: 'Store', label: 'Simple (MSME)', color: '#0f766e' }
});

const aliases = Object.freeze({ manufacturing: 'food_manufacturing' });

export const normalizeBusinessMode = (mode) => {
  const normalized = String(mode || '').trim().toLowerCase();
  if (BUSINESS_MODE_PIN_META[normalized]) return aliases[normalized] || normalized;
  return 'food_manufacturing';
};

export const getBusinessModePinMeta = (mode) => {
  const raw = String(mode || '').trim().toLowerCase();
  return BUSINESS_MODE_PIN_META[raw] || BUSINESS_MODE_PIN_META[normalizeBusinessMode(mode)];
};

const iconPath = (icon) => {
  switch (icon) {
    case 'CalendarCheck':
      return '<path d="M7 3v3M17 3v3M4 9h16"/><rect x="4" y="5" width="16" height="15" rx="2"/><path d="m8 15 2 2 5-5"/>';
    case 'ShoppingBag':
      return '<path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/>';
    case 'Factory':
      return '<path d="M3 21V9l6 4V9l6 4h6v8H3Z"/><path d="M7 17h2M12 17h2M17 17h2"/>';
    case 'Utensils':
      return '<path d="M7 3v8M5 3v8M9 3v8M5 11h4v10"/><path d="M16 3v18M16 3c3 2 4 5 2 8h-2"/>';
    case 'Hotel':
      return '<path d="M4 21V5h10v16"/><path d="M14 11h6v10"/><path d="M7 9h2M7 13h2M7 17h2"/>';
    case 'HeartPulse':
      return '<path d="M20 8c0 6-8 12-8 12S4 14 4 8a4 4 0 0 1 7-2 4 4 0 0 1 9 2Z"/><path d="M7 12h3l1-2 2 4 1-2h3"/>';
    case 'Ticket':
      return '<path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V8Z"/><path d="M12 8v8"/>';
    case 'Truck':
      return '<path d="M3 7h11v9H3Z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>';
    case 'GraduationCap':
      return '<path d="M3 9 12 5l9 4-9 4-9-4Z"/><path d="M7 11v4c3 2 7 2 10 0v-4"/>';
    case 'Store':
    default:
      return '<path d="M4 10h16l-2-5H6l-2 5Z"/><path d="M5 10v10h14V10"/><path d="M9 20v-5h6v5"/>';
  }
};

const normalizePinHex = (value, fallback = '#1a4e8d') => {
  const raw = String(value || fallback).trim();
  const hex = raw.startsWith('#') ? raw.slice(1) : raw;
  const normalized = hex.length === 3 ? hex.split('').map((char) => `${char}${char}`).join('') : hex;
  return /^[0-9a-fA-F]{6}$/.test(normalized) ? `#${normalized}` : fallback;
};

export const renderBusinessModePinSpriteSvg = (mode, selected = false) => {
  const meta = getBusinessModePinMeta(mode);
  const color = normalizePinHex(meta.color);
  const circleSize = selected ? 38 : 34;
  const circleX = 19;
  const circleY = selected ? 19 : 17;
  const radius = circleSize / 2 - 2;
  const shadowOpacity = selected ? '0.38' : '0.28';
  const shadowY = selected ? '7' : '6';
  const tailTop = selected ? 38 : 35;
  const paths = iconPath(meta.icon);
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="38" height="48" viewBox="0 0 38 48">
      <defs>
        <filter id="pinShadow" x="-40%" y="-30%" width="180%" height="180%" color-interpolation-filters="sRGB">
          <feDropShadow dx="0" dy="${shadowY}" stdDeviation="4" flood-color="#0f172a" flood-opacity="${shadowOpacity}"/>
        </filter>
      </defs>
      <g filter="url(#pinShadow)">
        <circle cx="${circleX}" cy="${circleY}" r="${radius}" fill="${color}" stroke="#fff" stroke-width="3"/>
        <path d="M12 ${tailTop} L19 47 L26 ${tailTop} Z" fill="${color}"/>
        <svg x="8.5" y="${circleY - 10.5}" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          ${paths}
        </svg>
      </g>
    </svg>
  `.trim();
};

export const renderClusterPinSpriteSvg = (count, selected = false) => {
  const displayCount = Number.isFinite(Number(count)) ? Math.max(1, Math.min(99, Number(count))) : 1;
  const circleSize = selected ? 38 : 34;
  const circleY = selected ? 19 : 17;
  const radius = circleSize / 2 - 2;
  const shadowOpacity = selected ? '0.38' : '0.28';
  const tailTop = selected ? 38 : 35;
  const fontSize = displayCount > 9 ? 15 : 18;
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="38" height="48" viewBox="0 0 38 48">
      <defs>
        <filter id="clusterShadow" x="-40%" y="-30%" width="180%" height="180%" color-interpolation-filters="sRGB">
          <feDropShadow dx="0" dy="7" stdDeviation="4" flood-color="#0f172a" flood-opacity="${shadowOpacity}"/>
        </filter>
      </defs>
      <g filter="url(#clusterShadow)">
        <circle cx="19" cy="${circleY}" r="${radius}" fill="#1a4e8d" stroke="#fff" stroke-width="3"/>
        <path d="M12 ${tailTop} L19 47 L26 ${tailTop} Z" fill="#1a4e8d"/>
        <text x="19" y="${circleY + 6}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="800" fill="#fff">${displayCount}</text>
      </g>
    </svg>
  `.trim();
};

export const renderBusinessModePinSvg = (mode, selected = false) => {
  const meta = getBusinessModePinMeta(mode);
  const color = meta.color;
  const outerSize = 38;
  const outerHeight = 48;
  const size = selected ? 38 : 34;
  return `
    <div style="position:relative;width:${outerSize}px;height:${outerHeight}px;display:flex;align-items:flex-start;justify-content:center;">
      <div style="width:${size}px;height:${size}px;border-radius:999px;border:3px solid #fff;box-shadow:${selected ? '0 10px 22px rgba(15,23,42,.40)' : '0 8px 18px rgba(15,23,42,.28)'};background:${color};display:flex;align-items:center;justify-content:center;">
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="${meta.label}">
          ${iconPath(meta.icon)}
        </svg>
      </div>
      <div style="position:absolute;bottom:1px;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:11px solid ${color};"></div>
    </div>
  `;
};
