import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
// Issue #282, Phase E: colocated with the library import instead of a
// blanket StorefrontApp.jsx-level import -- this file is now only reached
// via StoresMapLazy.jsx's dynamic import(), so the CSS loads only when a
// stores map actually renders instead of on every storefront page.
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapPin } from 'lucide-react';
import {
  DISCOVERY_DENSITY_CLUSTER_LAYER_ID,
  DISCOVERY_PIN_LAYER_ID,
  DISCOVERY_PIN_SOURCE_ID,
  DISCOVERY_USER_SOURCE_ID,
  buildDiscoveryPinLayerModel,
  buildUserLocationSourceData,
  ensureDiscoveryMapLayers,
  ensureMapImage,
  ensureRouteLineLayer,
  hasPlottableCoordinate,
  setGeoJsonSourceData,
  setRouteLineData
} from '../model/discoveryMapLayers.js';
import {
  DEFAULT_CENTER,
  TILING_SERVER,
  tileTransformRequest
} from '../../app/runtime/storefrontMapRuntime.js';
import { withAssetOrigin } from '../../app/runtime/storefrontRuntime.js';
import { getDiscoveryMarkerKey } from '../model/discoveryMapDom.js';
import { createStoreMarkerPreviewNode } from '../model/storefrontMarkerPreview.js';
import { useStoreRoute } from '../../shared/hooks/useStoreRoute.js';

const toSlug = (value) => String(value || '').trim().toLowerCase();

const EMPTY_HIGHLIGHTED_MARKER_KEYS = [];
const STORE_MARKER_POPUP_OFFSET = { bottom: [0, -58], top: [0, 58], left: [58, 0], right: [-58, 0] };
const STORE_MARKER_FIT_PADDING = { top: 76, right: 76, bottom: 104, left: 76 };
const STORE_MARKER_AUTO_OPEN_FIT_PADDING = { top: 96, right: 96, bottom: 120, left: 96 };
// The pin symbol layer anchors each icon at its bottom tip ('icon-anchor: bottom' in
// ensureDiscoveryMapLayers), so the marker's geographic coordinate sits at the very
// bottom of the ~48px-tall glyph, not at the visible round badge. Centering the camera
// directly on that coordinate (as a plain `center` would) leaves the badge rendered well
// above the container's true center. This offset shifts the camera target down by the
// badge's distance above the anchor so the visible pin lands in the middle of the view.
const STORE_MARKER_SINGLE_PIN_CENTER_OFFSET = [0, 30];

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
  viewportSignal = '',
  focusSelectedKey = false
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
  const lastSelectedMarkerKeyRef = useRef('');
  const lastViewportLocationSignatureRef = useRef('');
  const lastViewportSignalRef = useRef('');
  const resizeTimersRef = useRef([]);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [mapStyleReady, setMapStyleReady] = useState(false);
  const [containerResizeTick, setContainerResizeTick] = useState(0);

  // Some callers (e.g. the storefront's Contact & Location card) mount this
  // component as part of the hero's initial page load, where cover/profile images
  // and web fonts can still be loading and reflowing the surrounding layout well
  // after the first paint — unlike the expanded map modal, which only mounts once
  // the user clicks to open it, by which point the page has already settled. Without
  // an explicit resize once the container's *final* size is known, MapLibre keeps
  // using whatever (possibly stale) dimensions it read earlier, so the flyTo/
  // fitBounds centering math below lands the pin somewhere other than the middle of
  // the eventual, settled container. The staggered timers plus a `window.load`
  // listener mirror (and extend) the resize handling already proven in
  // features/locations/components/DeliveryPinMap.jsx for this same class of
  // dynamically-sized map containers.
  const scheduleMapResize = useCallback(() => {
    resizeTimersRef.current.forEach((cancel) => cancel());
    resizeTimersRef.current = [];
    const runResize = () => {
      const map = mapRef.current;
      const container = ref.current;
      if (!map || !container) return;
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      map.resize();
      setContainerResizeTick((tick) => tick + 1);
    };
    if (typeof window === 'undefined') return;
    const rafId = window.requestAnimationFrame(runResize);
    const timers = [60, 220, 500, 1000].map((delay) => window.setTimeout(runResize, delay));
    resizeTimersRef.current = [
      () => window.cancelAnimationFrame(rafId),
      ...timers.map((timerId) => () => window.clearTimeout(timerId))
    ];
  }, []);

  const selectedStore = useMemo(() => {
    const rows = Array.isArray(stores) ? stores : [];
    const normalizedSelectedKey = String(selectedKey || '').trim();
    if (!normalizedSelectedKey) return null;
    const directMatch = rows.find((store) => getDiscoveryMarkerKey(store) === normalizedSelectedKey);
    if (directMatch) return directMatch;
    const locationMatch = normalizedSelectedKey.match(/^loc-(\d+)$/);
    if (!locationMatch) return null;
    return rows.find((store) => Number(store?.location_id) === Number(locationMatch[1])) || null;
  }, [stores, selectedKey]);
  const selectedMarkerKey = selectedStore ? getDiscoveryMarkerKey(selectedStore) : selectedKey;

  const routeEnabled = Boolean(
    userLocation
    && selectedStore
    && hasPlottableCoordinate(selectedStore.latitude, selectedStore.longitude, { allowProvisionedPlaceholder: focusSelectedKey })
  );
  const routeDestination = routeEnabled
    ? { latitude: selectedStore.latitude, longitude: selectedStore.longitude }
    : null;
  const { geometry: routeGeometry, distanceKm: routeDistanceKm, durationMinutes: routeDurationMinutes, loading: routeLoading } = useStoreRoute({
    origin: userLocation,
    destination: routeDestination,
    enabled: routeEnabled
  });

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
        // The default compact attribution control renders as a small "i" toggle
        // that expands into a text box covering most of the map at these small
        // embed sizes (110-156px tall). Disable it outright rather than just
        // hiding the toggle affordance.
        attributionControl: false,
      });
    } catch (error) {
      console.warn('[MapLibre init unavailable]', error);
      setMapUnavailable(true);
      return undefined;
    }
    mapRef.current = map;

    map.on('error', (e) => console.error('[MapLibre error]', e));
    map.on('tileerror', (e) => console.error('[MapLibre] tile error', e));
    const markReady = () => {
      setMapStyleReady(true);
      scheduleMapResize();
    };
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
    scheduleMapResize();

    return () => {
      resizeTimersRef.current.forEach((cancel) => cancel());
      resizeTimersRef.current = [];
      if (typeof map.off === 'function') {
        try { map.off('load', markReady); } catch {
          // MapLibre cleanup is best-effort across mocked and real maps.
        }
      }
      map.remove();
      mapRef.current = null;
      setMapStyleReady(false);
    };
  }, [scheduleMapResize]);

  useEffect(() => {
    const container = ref.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => scheduleMapResize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [scheduleMapResize]);

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
    const normalizedSelectedMarkerKey = String(selectedMarkerKey || '').trim();
    const selectedMarkerChanged = lastSelectedMarkerKeyRef.current !== normalizedSelectedMarkerKey;
    lastSelectedMarkerKeyRef.current = normalizedSelectedMarkerKey;
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

    const layerModel = buildDiscoveryPinLayerModel({
      stores: rows,
      selectedKey: selectedMarkerKey,
      highlightedKeys,
      allowProvisionedPlaceholder: focusSelectedKey
    });
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

    const groupsByCoordinateKey = new globalThis.Map();
    layerModel.groups.forEach((entry) => {
      groupsByCoordinateKey.set(entry.coordinateKey, entry);
      // Highlighted entries are built eagerly: autoOpenPopups needs them to exist
      // before the user interacts. Everything else is built lazily on first
      // hover/click below, so up to ~100 pins don't all fire preview-image
      // fetches and build DOM subtrees on every stores/search change.
      if (entry.highlighted) createPopupForEntry(entry);
    });

    const getEventEntry = (event) => {
      const feature = Array.isArray(event?.features) ? event.features[0] : null;
      const coordinateKey = String(feature?.properties?.coordinateKey || '').trim();
      if (!coordinateKey) return null;
      const existing = popupEntries.get(coordinateKey);
      if (existing) return existing;
      const rawEntry = groupsByCoordinateKey.get(coordinateKey);
      return rawEntry ? createPopupForEntry(rawEntry) : null;
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
    const densityClusterClickHandler = (event) => {
      event?.preventDefault?.();
      const feature = Array.isArray(event?.features) ? event.features[0] : null;
      const clusterId = feature?.properties?.cluster_id;
      const coordinates = feature?.geometry?.coordinates;
      if (clusterId == null || !Array.isArray(coordinates)) return;
      const source = typeof map.getSource === 'function' ? map.getSource(DISCOVERY_PIN_SOURCE_ID) : null;
      if (!source || typeof source.getClusterExpansionZoom !== 'function') return;
      // getClusterExpansionZoom is Promise-based in MapLibre GL JS v5 (not callback-based).
      Promise.resolve(source.getClusterExpansionZoom(clusterId))
        .then((zoom) => {
          if (typeof zoom === 'number' && typeof map.easeTo === 'function') {
            map.easeTo({ center: coordinates, zoom });
          }
        })
        .catch(() => {
          // Cluster expansion is a convenience interaction; ignore failures.
        });
    };
    const densityClusterMouseEnterHandler = () => {
      if (typeof map.getCanvas === 'function') {
        map.getCanvas().style.cursor = 'pointer';
      }
    };
    const densityClusterMouseLeaveHandler = () => {
      if (typeof map.getCanvas === 'function') {
        map.getCanvas().style.cursor = '';
      }
    };
    if (layerReady && typeof map.on === 'function') {
      map.on('click', DISCOVERY_PIN_LAYER_ID, clickHandler);
      map.on('mouseenter', DISCOVERY_PIN_LAYER_ID, mouseEnterHandler);
      map.on('mouseleave', DISCOVERY_PIN_LAYER_ID, mouseLeaveHandler);
      map.on('mousemove', mapMouseMoveHandler);
      map.on('click', DISCOVERY_DENSITY_CLUSTER_LAYER_ID, densityClusterClickHandler);
      map.on('mouseenter', DISCOVERY_DENSITY_CLUSTER_LAYER_ID, densityClusterMouseEnterHandler);
      map.on('mouseleave', DISCOVERY_DENSITY_CLUSTER_LAYER_ID, densityClusterMouseLeaveHandler);
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
        try { map.off('click', DISCOVERY_DENSITY_CLUSTER_LAYER_ID, densityClusterClickHandler); } catch {
          // Cleanup is best-effort across mocked and real maps.
        }
        try { map.off('mouseenter', DISCOVERY_DENSITY_CLUSTER_LAYER_ID, densityClusterMouseEnterHandler); } catch {
          // Cleanup is best-effort across mocked and real maps.
        }
        try { map.off('mouseleave', DISCOVERY_DENSITY_CLUSTER_LAYER_ID, densityClusterMouseLeaveHandler); } catch {
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

    const shouldFocusSelected = Boolean(
      focusSelectedKey
      && selectedStore
      && hasPlottableCoordinate(selectedStore.latitude, selectedStore.longitude, { allowProvisionedPlaceholder: focusSelectedKey })
      && (selectedMarkerChanged || !viewportHasFitRef.current || viewportSignalChanged)
    );
    const shouldFitViewport = focusSelectedKey
      ? (!viewportHasFitRef.current || selectedMarkerChanged || viewportSignalChanged || userLocationChanged)
      : (viewportPolicy !== 'search-stable'
        || !viewportHasFitRef.current
        || viewportSignalChanged
        || userLocationChanged);
    if (shouldFocusSelected) {
      map.flyTo({
        center: [Number(selectedStore.longitude), Number(selectedStore.latitude)],
        zoom: autoOpenPopups ? 14 : 15,
        offset: STORE_MARKER_SINGLE_PIN_CENTER_OFFSET
      });
      viewportHasFitRef.current = true;
    } else if (shouldFitViewport && bounds.length === 1) {
      map.flyTo({
        center: bounds[0],
        zoom: autoOpenPopups ? 14 : 15,
        offset: STORE_MARKER_SINGLE_PIN_CENTER_OFFSET
      });
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
  }, [stores, selectedKey, selectedMarkerKey, selectedStore, highlightedKeys, userLocation, autoOpenPopups, openPopupOnHover, viewportPolicy, viewportSignal, focusSelectedKey, mapStyleReady, containerResizeTick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapStyleReady) return;
    ensureRouteLineLayer(map, { width: 4 });
    setRouteLineData(map, routeGeometry || null);
  }, [routeGeometry, mapStyleReady]);

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

  const showRouteChip = routeEnabled && (routeLoading || Number.isFinite(routeDistanceKm));

  return (
    <div style={{ position: 'relative', height, border: '1px solid #d6e2e8', borderRadius: 24, overflow: 'hidden' }}>
      <div ref={ref} style={{ height: '100%' }} />
      {showRouteChip && (
        <div style={{ position: 'absolute', left: 12, bottom: 12, display: 'flex', alignItems: 'center', gap: 6, background: '#fff', borderRadius: 999, padding: '6px 14px', boxShadow: '0 2px 10px rgba(15,23,42,0.16)', fontSize: 12, fontWeight: 800, color: '#0f172a' }}>
          {routeLoading
            ? 'Calculating route…'
            : `${routeDistanceKm.toFixed(1)} km · ${routeDurationMinutes} min drive`}
        </div>
      )}
    </div>
  );
}
