export const makeClusterElement = (count, selected = false, ariaLabel = 'Shared store marker') => {
  const el = document.createElement('div');
  el.className = `discovery-result-cluster${selected ? ' is-selected' : ''}`;
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', ariaLabel);
  el.textContent = String(count);
  return el;
};

export const getDiscoveryMarkerKey = (pin = {}) => {
  const explicitKey = String(pin?.marker_key || '').trim();
  if (explicitKey) return explicitKey;

  const slug = String(pin?.slug || pin?.tenant_slug || pin?.tenant_id || '').trim();
  const locationId = pin?.location_id ?? pin?.nearest_location_id ?? null;
  const numericLocationId = Number(locationId);
  if (slug && Number.isInteger(numericLocationId) && numericLocationId > 0) {
    return `${slug}:loc:${numericLocationId}`;
  }

  const lat = Number(pin?.latitude);
  const lng = Number(pin?.longitude);
  if (slug && Number.isFinite(lat) && Number.isFinite(lng)) {
    return `${slug}:coord:${lat.toFixed(6)}:${lng.toFixed(6)}`;
  }
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `coord:${lat.toFixed(6)}:${lng.toFixed(6)}`;
  }

  return slug;
};

export const createSharedCoordinatePreviewNode = (stores = [], {
  onSelect = null,
  onClose = null
} = {}) => {
  const entries = Array.isArray(stores) ? stores.filter(Boolean) : [];
  const card = document.createElement('article');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', `${entries.length} storefronts at this location`);
  card.className = 'discovery-cluster-preview-card';

  const header = document.createElement('div');
  header.className = 'discovery-cluster-preview-header';
  const title = document.createElement('strong');
  title.textContent = `${entries.length} storefronts here`;
  header.appendChild(title);
  if (typeof onClose === 'function') {
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'discovery-cluster-preview-close';
    closeButton.setAttribute('aria-label', 'Close shared location list');
    closeButton.textContent = 'x';
    closeButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    });
    header.appendChild(closeButton);
  }
  card.appendChild(header);

  const summary = document.createElement('div');
  summary.className = 'discovery-cluster-preview-summary';
  summary.textContent = entries.length > 8
    ? `Showing all ${entries.length} storefronts at this exact pin`
    : 'Choose a storefront at this exact pin';
  card.appendChild(summary);

  const list = document.createElement('div');
  list.className = `discovery-cluster-preview-list${entries.length > 8 ? ' is-scrollable' : ''}`;
  entries.forEach((store) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'discovery-cluster-preview-entry';
    const tenantName = String(store?.tenant_name || 'Storefront').trim();
    const rawBranchName = String(store?.location_name || store?.nearest_location_name || 'Main Branch').trim();
    const branchName = rawBranchName === 'Main' ? 'Main Branch' : rawBranchName;
    button.setAttribute('aria-label', `Select ${tenantName} at ${branchName}`);
    button.innerHTML = `<strong></strong><span></span>`;
    button.querySelector('strong').textContent = tenantName;
    button.querySelector('span').textContent = branchName;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onSelect?.(store);
    });
    list.appendChild(button);
  });
  card.appendChild(list);
  return card;
};

export default {
  createSharedCoordinatePreviewNode,
  getDiscoveryMarkerKey,
  makeClusterElement
};
