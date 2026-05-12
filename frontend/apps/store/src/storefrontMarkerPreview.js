import { getDiscoveryMatchBadges } from './discoveryPresentation.js';

const trimText = (value, fallback = '') => {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
};

const toNumberOrNull = (value) => {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const appendText = (parent, tagName, text, style = {}) => {
  const node = document.createElement(tagName);
  node.textContent = String(text || '');
  Object.assign(node.style, style);
  parent.appendChild(node);
  return node;
};

const appendImage = (parent, { src, alt, style = {}, onMissing }) => {
  if (!src) return null;
  const image = document.createElement('img');
  image.src = src;
  image.alt = alt || '';
  Object.assign(image.style, style);
  image.onerror = () => {
    image.remove();
    if (typeof onMissing === 'function') onMissing();
  };
  parent.appendChild(image);
  return image;
};

export const formatMarkerDistance = (distanceKm) => {
  const distance = toNumberOrNull(distanceKm);
  if (distance == null) return '';
  if (distance < 1) return `${Math.round(distance * 1000)} m away`;
  return `${distance.toFixed(distance < 10 ? 1 : 0)} km away`;
};

export const buildStoreMarkerPreviewModel = (store = {}, {
  resolveAssetUrl = (value) => value
} = {}) => {
  const matchBadges = getDiscoveryMatchBadges(store, Array.isArray(store?.match_reasons) && store.match_reasons.length > 0);
  const distanceLabel = formatMarkerDistance(store?.distance_km ?? store?.nearest_distance_km);
  const catalogCount = Number(store?.catalog_count);
  const matchingItemCount = Number(store?.matching_item_count);
  const statusLabel = store?.storefront_open === false || store?.is_open === false ? 'Closed' : 'Open';
  const branchName = trimText(store?.location_name, trimText(store?.branch_label, 'Storefront location'));
  const tenantName = trimText(store?.tenant_name, 'Storefront');

  return {
    tenantName,
    branchName,
    address: trimText(store?.address_line, 'Address unavailable'),
    coverImageUrl: resolveAssetUrl(store?.storefront_cover_image_url) || '',
    profileImageUrl: resolveAssetUrl(store?.storefront_profile_image_url) || '',
    statusLabel,
    isOpen: statusLabel === 'Open',
    branchLabel: store?.is_primary_storefront === true ? 'Primary branch' : trimText(store?.branch_label, 'Branch'),
    locationId: store?.location_id ?? null,
    distanceLabel,
    catalogLabel: Number.isFinite(catalogCount) && catalogCount > 0 ? `${catalogCount} storefront item(s)` : '',
    matchingLabel: Number.isFinite(matchingItemCount) && matchingItemCount > 0 ? `${matchingItemCount} matching item(s)` : '',
    matchBadges,
    actionLabel: 'Open storefront'
  };
};

export const createStoreMarkerPreviewNode = (store = {}, {
  resolveAssetUrl = (value) => value,
  onAction = null
} = {}) => {
  const model = buildStoreMarkerPreviewModel(store, { resolveAssetUrl });
  const card = document.createElement('article');
  card.setAttribute('aria-label', `${model.tenantName} location preview`);
  card.style.cssText = [
    'width:280px',
    'overflow:hidden',
    'border-radius:14px',
    'background:#ffffff',
    'box-shadow:0 18px 42px rgba(15,23,42,.24)',
    'border:1px solid #dbe5ee',
    'font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'color:#0f172a'
  ].join(';');

  const cover = document.createElement('div');
  cover.style.cssText = 'height:96px;background:linear-gradient(135deg,#dbeafe,#ecfeff 70%,#f8fafc);position:relative;overflow:hidden;';
  appendImage(cover, {
    src: model.coverImageUrl,
    alt: `${model.tenantName} cover`,
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      display: 'block'
    }
  });
  const coverOverlay = document.createElement('div');
  coverOverlay.style.cssText = 'position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,23,42,.05),rgba(15,23,42,.50));';
  cover.appendChild(coverOverlay);
  const status = document.createElement('span');
  status.textContent = model.statusLabel;
  status.style.cssText = `position:absolute;left:10px;top:10px;border-radius:999px;padding:4px 9px;font-size:11px;font-weight:800;color:#fff;background:${model.isOpen ? '#16a34a' : '#b45309'};`;
  cover.appendChild(status);
  card.appendChild(cover);

  const body = document.createElement('div');
  body.style.cssText = 'padding:12px;display:grid;gap:9px;';

  const identity = document.createElement('div');
  identity.style.cssText = 'display:flex;align-items:center;gap:10px;min-width:0;';
  const avatar = document.createElement('div');
  avatar.style.cssText = 'width:42px;height:42px;border-radius:999px;overflow:hidden;border:2px solid #ffffff;background:#f8fafc;box-shadow:0 4px 12px rgba(15,23,42,.18);display:grid;place-items:center;flex:0 0 auto;margin-top:-28px;position:relative;';
  const fallbackInitial = trimText(model.tenantName).charAt(0).toUpperCase() || 'S';
  const fallback = document.createElement('span');
  fallback.textContent = fallbackInitial;
  fallback.style.cssText = 'font-size:14px;font-weight:900;color:#475569;';
  avatar.appendChild(fallback);
  appendImage(avatar, {
    src: model.profileImageUrl,
    alt: `${model.tenantName} profile`,
    style: {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  });
  identity.appendChild(avatar);

  const titleWrap = document.createElement('div');
  titleWrap.style.cssText = 'display:grid;gap:2px;min-width:0;';
  appendText(titleWrap, 'strong', model.tenantName, {
    fontSize: '15px',
    lineHeight: '1.2',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  });
  appendText(titleWrap, 'span', model.branchName, {
    fontSize: '12px',
    color: '#475569',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  });
  identity.appendChild(titleWrap);
  body.appendChild(identity);

  appendText(body, 'div', model.address, {
    fontSize: '12px',
    color: '#334155',
    lineHeight: '1.35'
  });

  const context = [model.branchLabel, model.distanceLabel, model.catalogLabel, model.matchingLabel].filter(Boolean);
  if (context.length > 0) {
    appendText(body, 'div', context.join(' · '), {
      fontSize: '11px',
      color: '#0f766e',
      fontWeight: '700',
      lineHeight: '1.35'
    });
  }

  if (model.matchBadges.length > 0) {
    const badges = document.createElement('div');
    badges.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;';
    model.matchBadges.slice(0, 2).forEach((badge) => {
      const chip = document.createElement('span');
      chip.textContent = badge.label;
      chip.style.cssText = 'border-radius:999px;border:1px solid #cbd5e1;background:#f8fafc;color:#334155;font-size:10px;font-weight:800;padding:3px 7px;';
      badges.appendChild(chip);
    });
    body.appendChild(badges);
  }

  if (typeof onAction === 'function') {
    const action = document.createElement('button');
    action.type = 'button';
    action.textContent = model.actionLabel;
    action.style.cssText = 'min-height:38px;border:none;border-radius:10px;background:#1d4ed8;color:#fff;font-size:13px;font-weight:800;cursor:pointer;';
    action.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onAction(store);
    });
    body.appendChild(action);
  }

  card.appendChild(body);
  return card;
};
