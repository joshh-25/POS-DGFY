import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { MapPin } from 'lucide-react';
import {
  DISCOVERY_PIN_LAYER_ID,
  DISCOVERY_PIN_SOURCE_ID,
  DISCOVERY_USER_SOURCE_ID,
  buildDiscoveryPinLayerModel,
  buildUserLocationSourceData,
  ensureDiscoveryMapLayers,
  ensureMapImage,
  setGeoJsonSourceData
} from '../../discoveryMapLayers.js';
import {
  DEFAULT_CENTER,
  TILING_SERVER,
  tileTransformRequest
} from '../../app/runtime/storefrontMapRuntime.js';
import { withAssetOrigin } from '../../app/runtime/storefrontRuntime.js';
import { getDiscoveryMarkerKey } from '../../discoveryMapDom.js';
import { createStoreMarkerPreviewNode } from '../../storefrontMarkerPreview.js';

const toSlug = (value) => String(value || '').trim().toLowerCase();

const EMPTY_HIGHLIGHTED_MARKER_KEYS = [];
const STORE_MARKER_POPUP_OFFSET = { bottom: [0, -58], top: [0, 58], left: [58, 0], right: [-58, 0] };
const STORE_MARKER_FIT_PADDING = { top: 76, right: 76, bottom: 104, left: 76 };
const STORE_MARKER_AUTO_OPEN_FIT_PADDING = { top: 96, right: 96, bottom: 120, left: 96 };

export function StoresMap({
  stores,
  selectedKey,
  highlightedKeys = EMPTY_HIGHLIGHTED_MARKER_KEYS,
  onSelectStore,
  userLocation = null,
  height = 360,
  autoOpenPopups = false,
  openPopupOnHover = false,
  onSelectCluster = null,
  viewportPolicy = 'auto',
  viewportSignal = ''
}) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const popupsRef = useRef([]);
  const layerEventCleanupRef = useRef(null);
  const onSelectStoreRef = useRef(onSelectStore);
  const onSelectClusterRef = useRef(onSelectCluster);
  const autoOpenFrameRef = useRef(null);
  const popupGenerationRef = useRef(0);
  const markerSignatureRef = useRef('');
  const viewportHasFitRef = useRef(false);
  const lastViewportLocationSignatureRef = useRef('');
  const lastViewportSignalRef = useRef('');
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [mapStyleReady, setMapStyleReady] = useState(false);

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
    const markReady = () => setMapStyleReady(true);
    if (typeof map.isStyleLoaded === 'function') {
      if (map.isStyleLoaded()) {
        markReady();
      } else if (typeof map.once === 'function') {
        map.once('load', markReady);
      } else {
        map.on('load', markReady);
      }
    } else {
      markReady();
    }

    return () => {
      if (typeof map.off === 'function') {
        try { map.off('load', markReady); } catch {
          // MapLibre cleanup is best-effort across mocked and real maps.
        }
      }
      map.remove();
      mapRef.current = null;
      setMapStyleReady(false);
    };
  }, []);
  useEffect(() => () => {
    if (typeof window !== 'undefined' && autoOpenFrameRef.current != null) {
      window.cancelAnimationFrame(autoOpenFrameRef.current);
      autoOpenFrameRef.current = null;
    }
    popupsRef.current.forEach((popup) => {
      try { popup?.remove?.(); } catch {
        // Cleanup is best-effort when MapLibre has already detached the popup.
      }
    });
    popupsRef.current = [];
    if (typeof layerEventCleanupRef.current === 'function') {
      layerEventCleanupRef.current();
      layerEventCleanupRef.current = null;
    }
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapStyleReady) return undefined;
    const generation = popupGenerationRef.current + 1;
    popupGenerationRef.current = generation;
    let cancelled = false;
    if (typeof window !== 'undefined' && autoOpenFrameRef.current != null) {
      window.cancelAnimationFrame(autoOpenFrameRef.current);
      autoOpenFrameRef.current = null;
    }

    const rows = Array.isArray(stores) ? stores : [];
    const nextMarkerSignature = rows
      .map((store) => {
        const markerKey = getDiscoveryMarkerKey(store);
        const lat = Number(store?.latitude);
        const lng = Number(store?.longitude);
        return [
          markerKey || toSlug(store?.slug || store?.tenant_name),
          Number.isFinite(lat) ? lat.toFixed(6) : '',
          Number.isFinite(lng) ? lng.toFixed(6) : '',
          store?.location_id ?? ''
        ].join(':');
      })
      .join('|');
    const markerSetChanged = markerSignatureRef.current !== nextMarkerSignature;
    markerSignatureRef.current = nextMarkerSignature;
    const normalizedViewportSignal = String(viewportSignal || '').trim();
    const viewportSignalChanged = lastViewportSignalRef.current !== normalizedViewportSignal;
    lastViewportSignalRef.current = normalizedViewportSignal;
    const userLocationSignature = userLocation?.latitude != null && userLocation?.longitude != null
      ? `${Number(userLocation.latitude).toFixed(6)}:${Number(userLocation.longitude).toFixed(6)}`
      : '';
    const userLocationChanged = lastViewportLocationSignatureRef.current !== userLocationSignature;
    lastViewportLocationSignatureRef.current = userLocationSignature;

    const retainedPopupKeys = new Set();
    const retainedPopups = [];
    popupsRef.current.forEach((popup) => {
      const isOpen = typeof popup?.isOpen === 'function'
        ? popup.isOpen()
        : Boolean(popup?.node?.isConnected);
      if (!markerSetChanged && isOpen) {
        const popupMarkerKey = String(popup?.__dgfyMarkerKey || '').trim();
        if (popupMarkerKey) retainedPopupKeys.add(popupMarkerKey);
        retainedPopups.push(popup);
        return;
      }
      try { popup?.remove?.(); } catch {
        // Cleanup is best-effort when MapLibre has already detached the popup.
      }
    });
    popupsRef.current = retainedPopups;
    if (typeof layerEventCleanupRef.current === 'function') {
      layerEventCleanupRef.current();
      layerEventCleanupRef.current = null;
    }

    const layerModel = buildDiscoveryPinLayerModel({ stores: rows, selectedKey, highlightedKeys });
    const userSourceData = buildUserLocationSourceData(userLocation);
    const userFeature = userSourceData.features[0];
    const bounds = [...layerModel.bounds];
    if (userFeature) bounds.push(userFeature.geometry.coordinates);

    const layerReady = ensureDiscoveryMapLayers(map);
    if (layerReady) {
      setGeoJsonSourceData(map, DISCOVERY_USER_SOURCE_ID, userSourceData);
    }

    const popupEntries = new globalThis.Map();
    let activeHoverEntry = null;
    const createPopupForEntry = (entry) => {
      const existing = popupEntries.get(entry.coordinateKey);
      if (existing) return existing;
      const { group, isCluster, lat, lng, markerKey } = entry;
      if (isCluster) {
        const clusterEntry = {
          markerKey,
          coordinateKey: entry.coordinateKey,
          highlighted: entry.highlighted,
          isCluster: true,
          group,
          open: (mode = 'click') => {
            if (mode !== 'click') return;
            onSelectClusterRef.current?.(group, entry);
          },
          setMarkerHovered: () => {}
        };
        popupEntries.set(entry.coordinateKey, clusterEntry);
        return clusterEntry;
      }
      const popup = new maplibregl.Popup({
        anchor: 'bottom',
        offset: STORE_MARKER_POPUP_OFFSET,
        closeOnClick: false,
        focusAfterOpen: false
      });
      popup.__dgfyMarkerKey = markerKey;
      popupsRef.current.push(popup);

      let closeTimer = null;
      let markerHovered = false;
      let popupOpening = false;
      let popupOpenMode = 'idle';
      let previewNodeRef = null;
      const clearCloseTimer = () => {
        if (closeTimer) {
          window.clearTimeout(closeTimer);
          closeTimer = null;
        }
      };
      const closeHoverPopup = () => {
        if (popupGenerationRef.current !== generation || popupOpenMode !== 'hover') return;
        markerHovered = false;
        popupOpenMode = 'idle';
        clearCloseTimer();
        if (previewNodeRef?.style) {
          previewNodeRef.style.pointerEvents = '';
        }
        popup.remove();
      };
      const schedulePopupClose = () => {
        clearCloseTimer();
        closeTimer = window.setTimeout(() => {
          if (!markerHovered) closeHoverPopup();
        }, 40);
      };
      const bindPreviewHover = (node) => {
        node.addEventListener('mouseenter', () => {
          if (popupOpenMode === 'click') {
            clearCloseTimer();
          }
        });
        node.addEventListener('mouseleave', () => {
          if (popupOpenMode === 'hover') {
            schedulePopupClose();
          }
        });
        node.addEventListener('focusin', () => {
          if (popupOpenMode === 'click') {
            clearCloseTimer();
          }
        });
        node.addEventListener('focusout', (event) => {
          const nextFocused = event.relatedTarget;
          if (nextFocused && node.contains(nextFocused)) return;
          if (popupOpenMode === 'hover') {
            schedulePopupClose();
          }
        });
      };
      const [singleStore] = group;
      const previewNode = createStoreMarkerPreviewNode(singleStore, {
        resolveAssetUrl: withAssetOrigin,
        onAction: () => onSelectStoreRef.current?.(singleStore),
        onClose: () => {
          markerHovered = false;
          clearCloseTimer();
          popupOpenMode = 'idle';
          if (previewNodeRef?.style) {
            previewNodeRef.style.pointerEvents = '';
          }
          popup.remove();
        }
      });
      previewNodeRef = previewNode;
      bindPreviewHover(previewNode);
      previewNode.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          popupOpenMode = 'idle';
          if (previewNodeRef?.style) {
            previewNodeRef.style.pointerEvents = '';
          }
          popup.remove();
        }
      });
      popup.setDOMContent(previewNode);
      const open = (mode = 'click') => {
        popupOpenMode = mode === 'click' || popupOpenMode === 'click' ? 'click' : 'hover';
        clearCloseTimer();
        if (previewNodeRef?.style) {
          previewNodeRef.style.pointerEvents = popupOpenMode === 'hover' ? 'none' : '';
        }
        const popupAlreadyOpen = typeof popup.isOpen === 'function' ? popup.isOpen() : false;
        if (popupOpening || popupAlreadyOpen) return;
        popupOpening = true;
        try {
          popup.setLngLat([lng, lat]).addTo(map);
        } finally {
          popupOpening = false;
        }
      };
      popupEntries.set(entry.coordinateKey, {
        markerKey,
        coordinateKey: entry.coordinateKey,
        highlighted: entry.highlighted,
        isCluster: false,
        open,
        closeHoverPopup,
        setMarkerHovered: (value) => {
          markerHovered = Boolean(value);
          if (markerHovered) {
            clearCloseTimer();
          } else if (popupOpenMode === 'hover') {
            schedulePopupClose();
          }
        }
      });
      return popupEntries.get(entry.coordinateKey);
    };

    layerModel.groups.forEach((entry) => createPopupForEntry(entry));

    const getEventEntry = (event) => {
      const feature = Array.isArray(event?.features) ? event.features[0] : null;
      const coordinateKey = String(feature?.properties?.coordinateKey || '').trim();
      return coordinateKey ? popupEntries.get(coordinateKey) : null;
    };
    const clickHandler = (event) => {
      event?.preventDefault?.();
      const entry = getEventEntry(event);
      entry?.open?.('click');
    };
    const hoverPreviewEnabled = openPopupOnHover
      && typeof window !== 'undefined'
      && window.matchMedia?.('(hover: hover)').matches;
    const mouseEnterHandler = (event) => {
      if (typeof map.getCanvas === 'function') {
        map.getCanvas().style.cursor = 'pointer';
      }
      if (!hoverPreviewEnabled) return;
      const entry = getEventEntry(event);
      if (activeHoverEntry && activeHoverEntry !== entry) {
        activeHoverEntry.closeHoverPopup?.();
      }
      activeHoverEntry = entry || null;
      entry?.setMarkerHovered?.(true);
      entry?.open?.('hover');
    };
    const mouseLeaveHandler = (event) => {
      if (typeof map.getCanvas === 'function') {
        map.getCanvas().style.cursor = '';
      }
      if (!hoverPreviewEnabled) return;
      const entry = getEventEntry(event);
      if (activeHoverEntry === entry) {
        activeHoverEntry = null;
      }
      entry?.setMarkerHovered?.(false);
    };
    const mapMouseMoveHandler = (event) => {
      if (!hoverPreviewEnabled || !activeHoverEntry || typeof map.queryRenderedFeatures !== 'function') return;
      const renderedFeatures = map.queryRenderedFeatures(event?.point, { layers: [DISCOVERY_PIN_LAYER_ID] }) || [];
      const stillOnActiveMarker = renderedFeatures.some((feature) => (
        String(feature?.properties?.coordinateKey || '').trim() === activeHoverEntry.coordinateKey
      ));
      if (stillOnActiveMarker) return;
      activeHoverEntry.setMarkerHovered?.(false);
      activeHoverEntry = null;
      if (typeof map.getCanvas === 'function') {
        map.getCanvas().style.cursor = '';
      }
    };
    if (layerReady && typeof map.on === 'function') {
      map.on('click', DISCOVERY_PIN_LAYER_ID, clickHandler);
      map.on('mouseenter', DISCOVERY_PIN_LAYER_ID, mouseEnterHandler);
      map.on('mouseleave', DISCOVERY_PIN_LAYER_ID, mouseLeaveHandler);
      map.on('mousemove', mapMouseMoveHandler);
      layerEventCleanupRef.current = () => {
        if (typeof map.off !== 'function') return;
        try { map.off('click', DISCOVERY_PIN_LAYER_ID, clickHandler); } catch {
          // Cleanup is best-effort across mocked and real maps.
        }
        try { map.off('mouseenter', DISCOVERY_PIN_LAYER_ID, mouseEnterHandler); } catch {
          // Cleanup is best-effort across mocked and real maps.
        }
        try { map.off('mouseleave', DISCOVERY_PIN_LAYER_ID, mouseLeaveHandler); } catch {
          // Cleanup is best-effort across mocked and real maps.
        }
        try { map.off('mousemove', mapMouseMoveHandler); } catch {
          // Cleanup is best-effort across mocked and real maps.
        }
      };
    }

    Promise.all(layerModel.requiredImages.map(({ id, svg }) => ensureMapImage(map, id, svg)))
      .then(() => {
        if (cancelled || popupGenerationRef.current !== generation) return;
        if (layerReady) {
          setGeoJsonSourceData(map, DISCOVERY_PIN_SOURCE_ID, layerModel.sourceData);
        }
      });

    const shouldFitViewport = viewportPolicy !== 'search-stable'
      || !viewportHasFitRef.current
      || viewportSignalChanged
      || userLocationChanged;
    if (shouldFitViewport && bounds.length === 1) {
      map.flyTo({ center: bounds[0], zoom: autoOpenPopups ? 14 : 15 });
      viewportHasFitRef.current = true;
    }
    if (shouldFitViewport && bounds.length > 1) {
      const lngs = bounds.map((b) => b[0]);
      const lats = bounds.map((b) => b[1]);
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: autoOpenPopups ? STORE_MARKER_AUTO_OPEN_FIT_PADDING : STORE_MARKER_FIT_PADDING, maxZoom: autoOpenPopups ? 13.5 : 14 }
      );
      viewportHasFitRef.current = true;
    }
    const autoOpenEntries = Array.from(popupEntries.values()).filter((entry) => entry.highlighted);
    if (autoOpenPopups && autoOpenEntries.length > 0 && typeof window !== 'undefined') {
      autoOpenFrameRef.current = window.requestAnimationFrame(() => {
        autoOpenFrameRef.current = null;
        if (popupGenerationRef.current !== generation) return;
        const openedMarkerKeys = new Set();
        autoOpenEntries.forEach((entry) => {
          const markerKey = String(entry?.markerKey || '');
          if (!markerKey || retainedPopupKeys.has(markerKey) || openedMarkerKeys.has(markerKey)) return;
          openedMarkerKeys.add(markerKey);
          entry?.open?.();
        });
      });
    }
    return () => {
      cancelled = true;
      if (typeof window !== 'undefined' && autoOpenFrameRef.current != null) {
        window.cancelAnimationFrame(autoOpenFrameRef.current);
        autoOpenFrameRef.current = null;
      }
      if (typeof layerEventCleanupRef.current === 'function') {
        layerEventCleanupRef.current();
        layerEventCleanupRef.current = null;
      }
    };
  }, [stores, selectedKey, highlightedKeys, userLocation, autoOpenPopups, openPopupOnHover, viewportPolicy, viewportSignal, mapStyleReady]);

  if (mapUnavailable) {
    return (
      <div style={{ minHeight: height, border: '1px solid #d6e2e8', borderRadius: 24, overflow: 'hidden', background: '#f8fafc', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#1f5f9f', fontWeight: 900 }}>
          <MapPin size={18} />
          Store map unavailable
        </div>
        <p style={{ margin: '8px 0 16px', color: '#64748b', fontSize: 13 }}>
          Map rendering is unavailable on this device, but storefront discovery and account access still work from the list.
        </p>
        <div style={{ display: 'grid', gap: 8 }}>
          {(stores || []).slice(0, 6).map((store) => (
            <button
              key={getDiscoveryMarkerKey(store)}
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
