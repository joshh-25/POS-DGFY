export const BUSINESS_MODE_PIN_META = Object.freeze({
  retail: { icon: 'ShoppingBag', label: 'Retail', color: '#2563eb' },
  services: { icon: 'CalendarCheck', label: 'Services', color: '#0f766e' },
  food_manufacturing: { icon: 'Factory', label: 'Food Manufacturing', color: '#b45309' },
  manufacturing: { icon: 'Factory', label: 'Food Manufacturing', color: '#b45309' },
  fnb: { icon: 'Utensils', label: 'F&B', color: '#dc2626' },
  hospitality: { icon: 'Hotel', label: 'Hospitality', color: '#7c3aed' },
  healthcare: { icon: 'HeartPulse', label: 'Healthcare', color: '#be123c' },
  ticketing_transport: { icon: 'Ticket', label: 'Ticketing & Transport', color: '#0891b2' },
  logistics_distribution: { icon: 'Truck', label: 'Logistics & Distribution', color: '#475569' },
  education_institutions: { icon: 'GraduationCap', label: 'Education & Institutions', color: '#4f46e5' },
  msme: { icon: 'Store', label: 'Simple (MSME)', color: '#16a34a' }
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

export const renderBusinessModePinSvg = (mode, selected = false) => {
  const meta = getBusinessModePinMeta(mode);
  const color = selected ? meta.color : '#334155';
  const size = selected ? 38 : 34;
  return `
    <div style="position:relative;width:${size}px;height:${size + 10}px;display:flex;align-items:flex-start;justify-content:center;">
      <div style="width:${size}px;height:${size}px;border-radius:999px;border:3px solid #fff;box-shadow:0 8px 18px rgba(15,23,42,.35);background:${color};display:flex;align-items:center;justify-content:center;">
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="${meta.label}">
          ${iconPath(meta.icon)}
        </svg>
      </div>
      <div style="position:absolute;bottom:1px;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:11px solid ${color};"></div>
    </div>
  `;
};
