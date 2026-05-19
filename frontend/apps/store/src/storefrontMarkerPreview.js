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

const appendImage = (parent, { src, alt, className = '', style = {}, onMissing }) => {
  if (!src) return null;
  const image = document.createElement('img');
  image.src = src;
  image.alt = alt || '';
  if (className) image.className = className;
  Object.assign(image.style, style);
  image.onerror = () => {
    image.remove();
    if (typeof onMissing === 'function') onMissing();
  };
  parent.appendChild(image);
  return image;
};

const joinContextLabels = (labels) => labels.filter(Boolean).join(' | ');

const coordinateBucketKey = (store) => {
  const lat = Number(store?.latitude);
  const lng = Number(store?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  return `${lat.toFixed(5)}:${lng.toFixed(5)}`;
};

const markerIdentityKey = (store, fallbackIndex) => String(
  store?.marker_key || store?.slug || store?.location_id || fallbackIndex
);

export const buildMarkerDisplayOffsets = (stores = [], {
  radius = 18,
  coordinateKey = coordinateBucketKey
} = {}) => {
  const groups = new Map();
  const offsets = new Map();

  (Array.isArray(stores) ? stores : []).forEach((store, index) => {
    const key = coordinateKey(store);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ store, index, identityKey: markerIdentityKey(store, index) });
  });

  groups.forEach((entries) => {
    if (entries.length <= 1) {
      offsets.set(entries[0].identityKey, [0, 0]);
      return;
    }

    entries.forEach((entry, groupIndex) => {
      const angle = (Math.PI * 2 * groupIndex) / entries.length - Math.PI / 2;
      const ringRadius = radius + Math.max(0, entries.length - 4) * 2;
      offsets.set(entry.identityKey, [
        Math.round(Math.cos(angle) * ringRadius),
        Math.round(Math.sin(angle) * ringRadius)
      ]);
    });
  });

  return offsets;
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
  onAction = null,
  onClose = null
} = {}) => {
  const model = buildStoreMarkerPreviewModel(store, { resolveAssetUrl });
  const card = document.createElement('article');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', `${model.tenantName} location preview`);
  card.className = 'store-marker-preview-card';

  const cover = document.createElement('div');
  cover.className = 'store-marker-preview-cover';
  appendImage(cover, {
    src: model.coverImageUrl,
    alt: `${model.tenantName} cover`,
    className: 'store-marker-preview-coverImage'
  });
  const coverOverlay = document.createElement('div');
  coverOverlay.className = 'store-marker-preview-coverOverlay';
  cover.appendChild(coverOverlay);
  const status = document.createElement('span');
  status.textContent = model.statusLabel;
  status.className = `store-marker-preview-status ${model.isOpen ? 'store-marker-preview-statusOpen' : 'store-marker-preview-statusClosed'}`;
  cover.appendChild(status);
  if (typeof onClose === 'function') {
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'store-marker-preview-close';
    closeButton.setAttribute('aria-label', `Close ${model.tenantName} preview`);
    closeButton.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>';
    closeButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    });
    cover.appendChild(closeButton);
  }
  card.appendChild(cover);

  const body = document.createElement('div');
  body.className = 'store-marker-preview-body';

  const identity = document.createElement('div');
  identity.className = 'store-marker-preview-identity';
  const avatar = document.createElement('div');
  avatar.className = 'store-marker-preview-avatar';
  const fallbackInitial = trimText(model.tenantName).charAt(0).toUpperCase() || 'S';
  const fallback = document.createElement('span');
  fallback.textContent = fallbackInitial;
  fallback.className = 'store-marker-preview-avatarInitial';
  avatar.appendChild(fallback);
  appendImage(avatar, {
    src: model.profileImageUrl,
    alt: `${model.tenantName} profile`,
    className: 'store-marker-preview-avatarImage'
  });
  identity.appendChild(avatar);

  const titleWrap = document.createElement('div');
  titleWrap.className = 'store-marker-preview-titleWrap';
  appendText(titleWrap, 'strong', model.tenantName).className = 'store-marker-preview-title';
  appendText(titleWrap, 'span', model.branchName).className = 'store-marker-preview-branch';
  identity.appendChild(titleWrap);
  body.appendChild(identity);

  appendText(body, 'div', model.address).className = 'store-marker-preview-address';

  const context = [model.branchLabel, model.distanceLabel, model.catalogLabel, model.matchingLabel].filter(Boolean);
  if (context.length > 0) {
    appendText(body, 'div', joinContextLabels(context)).className = 'store-marker-preview-context';
  }

  if (model.matchBadges.length > 0) {
    const badges = document.createElement('div');
    badges.className = 'store-marker-preview-badges';
    model.matchBadges.slice(0, 2).forEach((badge) => {
      const chip = document.createElement('span');
      chip.textContent = badge.label;
      chip.className = 'store-marker-preview-badge';
      badges.appendChild(chip);
    });
    body.appendChild(badges);
  }

  if (typeof onAction === 'function') {
    const action = document.createElement('button');
    action.type = 'button';
    action.textContent = model.actionLabel;
    action.className = 'store-marker-preview-action';
    let actionTriggered = false;
    const triggerAction = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (actionTriggered) return;
      actionTriggered = true;
      onAction(store);
      window.setTimeout(() => {
        actionTriggered = false;
      }, 0);
    };
    action.addEventListener('pointerdown', triggerAction);
    action.addEventListener('click', triggerAction);
    body.appendChild(action);
  }

  card.appendChild(body);
  return card;
};
