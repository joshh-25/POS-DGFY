import { getBusinessModePinMeta, renderBusinessModePinSvg } from '../../../discovery/model/businessModePins.js';

export const makePinElement = (mode, selected = false, ariaLabel = 'Store marker', glow = false) => {
  const el = document.createElement('div');
  el.style.cssText = `--pin-scale:1;width:${selected ? 38 : 34}px;height:${selected ? 48 : 44}px;display:flex;align-items:center;justify-content:center;cursor:pointer;`;
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', ariaLabel);
  el.classList.add('discovery-result-pin');
  const visual = document.createElement('div');
  visual.className = (selected || glow) ? 'discovery-result-pin-visual is-glowing' : 'discovery-result-pin-visual';
  const pinHex = String(getBusinessModePinMeta(mode)?.color || '#1a4e8d').trim();
  const hex = pinHex.startsWith('#') ? pinHex.slice(1) : pinHex;
  const normalizedHex = hex.length === 3 ? hex.split('').map((char) => `${char}${char}`).join('') : hex;
  if (/^[0-9a-fA-F]{6}$/.test(normalizedHex)) {
    const r = Number.parseInt(normalizedHex.slice(0, 2), 16);
    const g = Number.parseInt(normalizedHex.slice(2, 4), 16);
    const b = Number.parseInt(normalizedHex.slice(4, 6), 16);
    visual.style.setProperty('--pin-glow-rgb', `${r}, ${g}, ${b}`);
  }
  visual.innerHTML = renderBusinessModePinSvg(mode, selected);
  el.appendChild(visual);
  return el;
};

export const makeUserLocationElement = () => {
  const el = document.createElement('div');
  el.style.cssText = 'width:34px;height:42px;display:flex;align-items:flex-start;justify-content:center;filter:drop-shadow(0 8px 16px rgba(15,23,42,.24));transform:translateY(-4px);cursor:grab;';
  el.innerHTML = `
    <svg width="34" height="42" viewBox="0 0 34 42" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M17 1.75C9.54416 1.75 3.5 7.79416 3.5 15.25C3.5 25.1401 15.3627 37.2171 16.1881 38.0441C16.6318 38.4878 17.3682 38.4878 17.8119 38.0441C18.6373 37.2171 30.5 25.1401 30.5 15.25C30.5 7.79416 24.4558 1.75 17 1.75Z" fill="#2563EB" stroke="white" stroke-width="2.2"/>
      <circle cx="17" cy="15" r="5.2" fill="white"/>
      <circle cx="17" cy="15" r="2.7" fill="#93C5FD"/>
    </svg>
  `;
  return el;
};
