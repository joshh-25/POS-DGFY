import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { MapPin } from 'lucide-react';
import {
  getSpreadMarkerCoordinate,
  haversineDistanceKm,
  toNumberOrNull
} from '../../features/discovery/utils/discoveryMapMath.js';
import {
  makePinElement,
  makeUserLocationElement
} from '../../features/discovery/utils/discoveryMapMarkers.js';
import {
  DEFAULT_CENTER,
  TILING_SERVER,
  tileTransformRequest
} from '../../app/runtime/storefrontMapRuntime.js';
import { withAssetOrigin } from '../../app/runtime/storefrontRuntime.js';
import { createSharedCoordinatePreviewNode, getDiscoveryMarkerKey, makeClusterElement } from '../../discoveryMapDom.js';
import { getDiscoveryPinScaleForZoom } from '../model/discoveryMapPresentation.js';
import { createStoreMarkerPreviewNode } from '../../storefrontMarkerPreview.js';

const getStoreResultKey = (store) => (
  getDiscoveryMarkerKey(store)
  || store?.slug
  || store?.tenant_slug
  || store?.storefront_slug
  || store?.id
  || store?.tenant_id
  || `${store?.latitude || 'lat'}:${store?.longitude || 'lng'}:${store?.tenant_name || store?.store_name || 'store'}`
);

export function StoresMap({
  stores,
  selectedKey,
  onSelectStore,
  userLocation = null,
  height = 360,
  autoOpenPopups = false,
  openPopupOnHover = false,
  onSelectCluster = null,
  pinGlow = false
}) {
  void getSpreadMarkerCoordinate;
  void haversineDistanceKm;
  void pinGlow;
  void toNumberOrNull;

  const ref = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const popupsRef = useRef([]);
  const userMarkerRef = useRef(null);
  const onSelectStoreRef = useRef(onSelectStore);
  const onSelectClusterRef = useRef(onSelectCluster);
  const autoOpenFrameRef = useRef(null);
  const popupGenerationRef = useRef(0);
  const [mapUnavailable, setMapUnavailable] = useState(false);

  useEffect(() => {
    onSelectStoreRef.current = onSelectStore;
  }, [onSelectStore]);

  useEffect(() => {
    onSelectClusterRef.current = onSelectCluster;
  }, [onSelectCluster]);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    let map;
    try {
      map = new maplibregl.Map({
        container: ref.current,
        style: TILING_SERVER,
        transformRequest: tileTransformRequest,
        center: [DEFAULT_CENTER.longitude, DEFAULT_CENTER.latitude],
        zoom: 11,
        bearing: 0,
        pitch: 0,
      });
    } catch (error) {
      console.warn('[MapLibre init unavailable]', error);
      setMapUnavailable(true);
      return undefined;
    }
    mapRef.current = map;

    map.on('error', (e) => console.error('[MapLibre error]', e));
    map.on('tileerror', (e) => console.error('[MapLibre] tile error', e));

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const generation = popupGenerationRef.current + 1;
    popupGenerationRef.current = generation;
    if (typeof window !== 'undefined' && autoOpenFrameRef.current != null) {
      window.cancelAnimationFrame(autoOpenFrameRef.current);
      autoOpenFrameRef.current = null;
    }

    popupsRef.current.forEach((popup) => {
      try {
        popup?.remove?.();
      } catch {
        // MapLibre can detach popups during rapid map rerenders.
      }
    });
    popupsRef.current = [];
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    const rows = Array.isArray(stores) ? stores : [];
    const uniqueRows = [];
    const seenMarkerKeys = new Set();
    rows.forEach((store) => {
      if (!store) return;
      const markerKey = getDiscoveryMarkerKey(store);
      if (!markerKey) {
        uniqueRows.push(store);
        return;
      }
      if (seenMarkerKeys.has(markerKey)) return;
      seenMarkerKeys.add(markerKey);
      uniqueRows.push(store);
    });
    const bounds = [];
    const autoOpenCallbacks = [];
    const scalableMarkerElements = [];
    const applyMarkerScale = () => {
      const scale = getDiscoveryPinScaleForZoom(map.getZoom?.());
      scalableMarkerElements.forEach((element) => {
        element?.style?.setProperty?.('--pin-scale', String(scale));
      });
    };
    const coordinateGroups = uniqueRows.reduce((acc, store) => {
      const lat = Number(store?.latitude);
      const lng = Number(store?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return acc;
      const key = `${lat.toFixed(6)}:${lng.toFixed(6)}`;
      if (!Array.isArray(acc[key])) {
        acc[key] = [];
      }
      acc[key].push(store);
      return acc;
    }, {});
    const renderedCoordinateGroups = new Set();

    uniqueRows.forEach((store) => {
      if (!store) return;
      const lat = Number(store?.latitude);
      const lng = Number(store?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const coordinateKey = `${lat.toFixed(6)}:${lng.toFixed(6)}`;
      if (renderedCoordinateGroups.has(coordinateKey)) return;
      renderedCoordinateGroups.add(coordinateKey);
      const group = Array.isArray(coordinateGroups[coordinateKey]) ? coordinateGroups[coordinateKey] : [];
      if (group.length === 0) return;
      const clusterSelected = selectedKey
        ? group.some((entry) => String(getDiscoveryMarkerKey(entry) || '') === String(selectedKey))
        : group.some((entry) => entry?.is_primary_storefront === true);

      if (group.length > 1) {
        const clusterElement = makeClusterElement(group.length, clusterSelected, `${group.length} storefronts at this location`);
        clusterElement.style.touchAction = 'none';
        clusterElement.style.setProperty('--pin-scale', '1');
        scalableMarkerElements.push(clusterElement);
        const clusterPopup = new maplibregl.Popup({
          anchor: 'bottom',
          offset: { bottom: [0, -54], top: [0, 16], left: [16, 0], right: [-16, 0] },
          closeOnClick: false,
          focusAfterOpen: false
        });
        popupsRef.current.push(clusterPopup);
        const clusterNode = createSharedCoordinatePreviewNode(group, {
          onSelect: (selectedStorefront) => {
            clusterPopup.remove();
            onSelectStoreRef.current?.(selectedStorefront);
          },
          onClose: () => {
            clusterPopup.remove();
          }
        });
        clusterPopup.setDOMContent(clusterNode);
        const stopClusterMapEvent = (event) => {
          event?.preventDefault?.();
          event?.stopPropagation?.();
          event?.stopImmediatePropagation?.();
        };
        const openClusterPopup = (event) => {
          stopClusterMapEvent(event);
          if (typeof onSelectClusterRef.current === 'function') {
            onSelectClusterRef.current(group, {
              coordinateKey,
              lat,
              lng,
              markerKey: getDiscoveryMarkerKey(group[0]) || coordinateKey
            });
            return;
          }
          clusterPopup.setLngLat([lng, lat]).addTo(map);
        };
        clusterElement.addEventListener('pointerdown', stopClusterMapEvent, { capture: true });
        clusterElement.addEventListener('mousedown', stopClusterMapEvent, { capture: true });
        clusterElement.addEventListener('touchstart', stopClusterMapEvent, { capture: true, passive: false });
        clusterElement.addEventListener('dblclick', stopClusterMapEvent, { capture: true });
        clusterElement.addEventListener('click', openClusterPopup, { capture: true });
        clusterElement.addEventListener('pointerup', openClusterPopup, { capture: true });
        clusterElement.addEventListener('mouseup', openClusterPopup, { capture: true });
        clusterElement.addEventListener('touchend', openClusterPopup, { capture: true, passive: false });
        clusterElement.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openClusterPopup(event);
          }
        });
        const clusterMarker = new maplibregl.Marker({ element: clusterElement, anchor: 'center' })
          .setLngLat([lng, lat])
          .addTo(map);
        markersRef.current.push(clusterMarker);
        bounds.push([lng, lat]);
        return;
      }

      const [singleStore] = group;
      const markerKey = getDiscoveryMarkerKey(singleStore) || `${lat}:${lng}`;
      const highlighted = selectedKey
        ? markerKey === String(selectedKey)
        : singleStore.is_primary_storefront === true;
      const branchName = String(singleStore?.location_name || singleStore?.nearest_location_name || 'Branch');
      const tenantName = String(singleStore?.tenant_name || 'Storefront');
      const markerAriaLabel = `Preview ${tenantName} at ${branchName}`;
      const element = makePinElement(singleStore.workflow_mode || singleStore.business_mode, highlighted, markerAriaLabel);
      scalableMarkerElements.push(element);
      const popup = new maplibregl.Popup({
        anchor: 'bottom',
        offset: { bottom: [0, -64], top: [0, 16], left: [16, 0], right: [-16, 0] },
        closeOnClick: false,
        focusAfterOpen: false
      });
      popupsRef.current.push(popup);
      let closeTimer = null;
      let markerHovered = false;
      let previewHovered = false;
      let popupOpening = false;
      const clearCloseTimer = () => {
        if (closeTimer) {
          window.clearTimeout(closeTimer);
          closeTimer = null;
        }
      };
      const openPopup = () => {
        clearCloseTimer();
        const popupAlreadyOpen = typeof popup.isOpen === 'function' ? popup.isOpen() : false;
        if (popupGenerationRef.current !== generation || popupOpening || popupAlreadyOpen) return;
        popupOpening = true;
        try {
          if (popupGenerationRef.current !== generation) return;
          popup.setLngLat([lng, lat]).addTo(map);
        } finally {
          popupOpening = false;
        }
      };
      const schedulePopupClose = () => {
        clearCloseTimer();
        closeTimer = window.setTimeout(() => {
          if (popupGenerationRef.current === generation && !markerHovered && !previewHovered) {
            popup.remove();
          }
        }, 120);
      };
      const previewNode = createStoreMarkerPreviewNode(singleStore, {
        resolveAssetUrl: withAssetOrigin,
        onAction: () => onSelectStoreRef.current?.(singleStore),
        onClose: () => {
          markerHovered = false;
          previewHovered = false;
          clearCloseTimer();
          popup.remove();
        }
      });
      previewNode.addEventListener('mouseenter', () => {
        previewHovered = true;
        clearCloseTimer();
      });
      previewNode.addEventListener('mouseleave', () => {
        previewHovered = false;
        schedulePopupClose();
      });
      previewNode.addEventListener('focusin', () => {
        previewHovered = true;
        clearCloseTimer();
      });
      previewNode.addEventListener('focusout', (event) => {
        const nextFocused = event.relatedTarget;
        if (nextFocused && previewNode.contains(nextFocused)) return;
        previewHovered = false;
        schedulePopupClose();
      });
      previewNode.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          popup.remove();
          element.focus();
        }
      });
      popup.setDOMContent(previewNode);
      const hoverPreviewEnabled = openPopupOnHover
        && typeof window !== 'undefined'
        && window.matchMedia?.('(hover: hover)').matches;
      const openPopupFromPointer = (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        openPopup();
      };
      element.addEventListener('click', openPopupFromPointer);
      element.addEventListener('pointerup', openPopupFromPointer);
      element.addEventListener('touchend', openPopupFromPointer, { passive: false });
      element.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openPopup();
        }
      });
      if (hoverPreviewEnabled) {
        element.addEventListener('mouseenter', () => {
          markerHovered = true;
          openPopup();
        });
        element.addEventListener('mouseleave', () => {
          markerHovered = false;
          schedulePopupClose();
        });
        element.addEventListener('focus', () => {
          markerHovered = true;
          openPopup();
        });
        element.addEventListener('blur', () => {
          markerHovered = false;
          schedulePopupClose();
        });
      }
      const marker = new maplibregl.Marker({ element, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(map);
      if (autoOpenPopups) {
        autoOpenCallbacks.push({ key: markerKey, open: openPopup });
      }
      markersRef.current.push(marker);
      bounds.push([lng, lat]);
    });

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
    if (userLocation?.latitude != null && userLocation?.longitude != null) {
      const userLatitude = Number(userLocation.latitude);
      const userLongitude = Number(userLocation.longitude);
      if (Number.isFinite(userLatitude) && Number.isFinite(userLongitude)) {
        const element = makeUserLocationElement();
        userMarkerRef.current = new maplibregl.Marker({ element })
          .setLngLat([userLongitude, userLatitude])
          .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML('<strong>Your location</strong>'))
          .addTo(map);
        bounds.push([userLongitude, userLatitude]);
      }
    }

    applyMarkerScale();
    map.on('zoom', applyMarkerScale);
    map.on('zoomend', applyMarkerScale);

    if (bounds.length === 1) map.flyTo({ center: bounds[0], zoom: autoOpenPopups ? 14 : 15 });
    if (bounds.length > 1) {
      const lngs = bounds.map((entry) => entry[0]);
      const lats = bounds.map((entry) => entry[1]);
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: autoOpenPopups ? 56 : 24, maxZoom: autoOpenPopups ? 13.5 : 14 }
      );
    }
    if (autoOpenCallbacks.length > 0 && typeof window !== 'undefined') {
      autoOpenFrameRef.current = window.requestAnimationFrame(() => {
        autoOpenFrameRef.current = null;
        if (popupGenerationRef.current !== generation) return;
        const openedMarkerKeys = new Set();
        autoOpenCallbacks.forEach((entry) => {
          const markerKey = String(entry?.key || '');
          if (!markerKey || openedMarkerKeys.has(markerKey)) return;
          openedMarkerKeys.add(markerKey);
          entry?.open?.();
        });
      });
    }
    return () => {
      map.off('zoom', applyMarkerScale);
      map.off('zoomend', applyMarkerScale);
      if (typeof window !== 'undefined' && autoOpenFrameRef.current != null) {
        window.cancelAnimationFrame(autoOpenFrameRef.current);
        autoOpenFrameRef.current = null;
      }
    };
  }, [stores, selectedKey, userLocation, autoOpenPopups, openPopupOnHover]);

  if (mapUnavailable) {
    return (
      <div style={{ minHeight: height, border: '1px solid #d6e2e8', borderRadius: 24, overflow: 'hidden', background: '#f8fafc', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#1f5f9f', fontWeight: 900 }}>
          <MapPin size={15} />
          Store map unavailable
        </div>
        <p style={{ margin: '8px 0 16px', color: '#64748b', fontSize: 13 }}>
          Map rendering is unavailable on this device, but storefront discovery and account access still work from the list.
        </p>
        <div style={{ display: 'grid', gap: 8 }}>
          {(stores || []).slice(0, 6).map((store) => (
            <button
              key={getStoreResultKey(store)}
              type="button"
              onClick={() => onSelectStoreRef.current?.(store)}
              style={{ textAlign: 'left', border: '1px solid #dbeafe', background: '#fff', borderRadius: 12, padding: '10px 12px', color: '#0f172a', fontWeight: 800, cursor: 'pointer' }}
            >
              {store?.tenant_name || store?.store_name || store?.slug || 'Storefront'}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return <div ref={ref} style={{ height, border: '1px solid #d6e2e8', borderRadius: 24, overflow: 'hidden' }} />;
}
