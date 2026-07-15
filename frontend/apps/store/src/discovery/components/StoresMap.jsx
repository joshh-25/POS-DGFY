import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { MapPin } from 'lucide-react';
import {
  makePinElement,
  makeUserLocationElement
} from '../../features/discovery/utils/discoveryMapMarkers.js';
import {
  DISCOVERY_DENSITY_CLUSTER_ACTIVATION_LAYER_ID,
  DISCOVERY_DENSITY_CLUSTER_SOURCE_ID,
  buildAddressGroups,
  buildClusterInputFeatures,
  ensureClusterActivationLayer,
  ensureClusterSource,
  getClusterStores,
  getClustersForViewport,
  getExpansionZoom
} from '../../features/discovery/utils/discoveryMapClustering.js';
import {
  DEFAULT_CENTER,
  TILING_SERVER,
  tileTransformRequest
} from '../../app/runtime/storefrontMapRuntime.js';
import { withAssetOrigin } from '../../app/runtime/storefrontRuntime.js';
import {
  createSharedCoordinatePreviewNode,
  getDiscoveryMarkerKey,
  makeClusterElement,
  makeDensityClusterElement
} from '../../discoveryMapDom.js';
import { getDiscoveryPinScaleForZoom } from '../model/discoveryMapPresentation.js';
import { createStoreMarkerPreviewNode } from '../../storefrontMarkerPreview.js';

const DEFAULT_CLUSTER_MIN_DATA_POINTS = 8;

const getStoreResultKey = (store) => (
  getDiscoveryMarkerKey(store)
  || store?.slug
  || store?.tenant_slug
  || store?.storefront_slug
  || store?.id
  || store?.tenant_id
  || `${store?.latitude || 'lat'}:${store?.longitude || 'lng'}:${store?.tenant_name || store?.store_name || 'store'}`
);

// Renders one address group (a single store, or a same-address cluster badge
// with its picker popup) as a maplibregl.Marker + optional Popup pair.
// Module-level and argument-driven (no closures over React state) so it can
// be called both from the synchronous below-threshold render path and from
// the async, viewport-driven density-cluster marker sync.
function renderAddressGroupMarker(map, addressGroup, {
  selectedKey,
  generation,
  popupGenerationRef,
  autoOpenPopups,
  openPopupOnHover,
  onSelectStoreRef,
  onSelectClusterRef
}) {
  const { groupKey: coordinateKey, latitude: lat, longitude: lng, stores: groupStores } = addressGroup;
  const clusterSelected = selectedKey
    ? groupStores.some((entry) => String(getDiscoveryMarkerKey(entry) || '') === String(selectedKey))
    : groupStores.some((entry) => entry?.is_primary_storefront === true);

  if (groupStores.length > 1) {
    const clusterElement = makeClusterElement(groupStores.length, clusterSelected, `${groupStores.length} storefronts at this location`);
    clusterElement.style.touchAction = 'none';
    clusterElement.style.setProperty('--pin-scale', '1');
    const clusterPopup = new maplibregl.Popup({
      anchor: 'bottom',
      offset: { bottom: [0, -54], top: [0, 16], left: [16, 0], right: [-16, 0] },
      closeOnClick: false,
      focusAfterOpen: false
    });
    const clusterNode = createSharedCoordinatePreviewNode(groupStores, {
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
        onSelectClusterRef.current(groupStores, {
          coordinateKey,
          lat,
          lng,
          markerKey: getDiscoveryMarkerKey(groupStores[0]) || coordinateKey
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
    return { key: coordinateKey, marker: clusterMarker, popup: clusterPopup, scalableElement: clusterElement, openPopup: null };
  }

  const [singleStore] = groupStores;
  const markerKey = getDiscoveryMarkerKey(singleStore) || `${lat}:${lng}`;
  const highlighted = selectedKey
    ? markerKey === String(selectedKey)
    : singleStore.is_primary_storefront === true;
  const branchName = String(singleStore?.location_name || singleStore?.nearest_location_name || 'Branch');
  const tenantName = String(singleStore?.tenant_name || 'Storefront');
  const markerAriaLabel = `Preview ${tenantName} at ${branchName}`;
  const element = makePinElement(singleStore.workflow_mode || singleStore.business_mode, highlighted, markerAriaLabel);
  const popup = new maplibregl.Popup({
    anchor: 'bottom',
    offset: { bottom: [0, -64], top: [0, 16], left: [16, 0], right: [-16, 0] },
    closeOnClick: false,
    focusAfterOpen: false
  });
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
  return { key: markerKey, marker, popup, scalableElement: element, openPopup };
}

export function StoresMap({
  stores,
  selectedKey,
  onSelectStore,
  userLocation = null,
  height = 360,
  autoOpenPopups = false,
  openPopupOnHover = false,
  onSelectCluster = null,
  pinGlow = false,
  clusterMinDataPoints = DEFAULT_CLUSTER_MIN_DATA_POINTS
}) {
  void pinGlow;

  const ref = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const popupsRef = useRef([]);
  const userMarkerRef = useRef(null);
  const onSelectStoreRef = useRef(onSelectStore);
  const onSelectClusterRef = useRef(onSelectCluster);
  const autoOpenFrameRef = useRef(null);
  const popupGenerationRef = useRef(0);
  const densityMarkersRef = useRef(new Map());
  const densityGroupsByKeyRef = useRef(new Map());
  const densityMoveListenerRef = useRef(null);
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

    if (densityMoveListenerRef.current) {
      map.off('moveend', densityMoveListenerRef.current);
      densityMoveListenerRef.current = null;
    }
    densityMarkersRef.current.forEach((entry) => {
      entry?.marker?.remove?.();
      entry?.popup?.remove?.();
    });
    densityMarkersRef.current.clear();
    // addSource/addLayer/removeSource/removeLayer all throw "style is not
    // done loading" if called before the map's style has finished loading
    // (only relevant on the very first effect run right after mount) — skip
    // teardown entirely in that case, since nothing could have been added
    // yet either (setup below defers behind the same isStyleLoaded check).
    const styleReady = typeof map.isStyleLoaded === 'function' && map.isStyleLoaded();
    if (styleReady) {
      if (typeof map.getLayer === 'function' && map.getLayer(DISCOVERY_DENSITY_CLUSTER_ACTIVATION_LAYER_ID) && typeof map.removeLayer === 'function') {
        try {
          map.removeLayer(DISCOVERY_DENSITY_CLUSTER_ACTIVATION_LAYER_ID);
        } catch {
          // Layer may already be mid-removal from a prior effect run.
        }
      }
      if (typeof map.getSource === 'function' && map.getSource(DISCOVERY_DENSITY_CLUSTER_SOURCE_ID) && typeof map.removeSource === 'function') {
        try {
          map.removeSource(DISCOVERY_DENSITY_CLUSTER_SOURCE_ID);
        } catch {
          // Source may already be mid-removal from a prior effect run.
        }
      }
    }

    const addressGroups = buildAddressGroups(stores);
    const bounds = [];
    const autoOpenCallbacks = [];
    const scalableMarkerElements = [];
    const applyMarkerScale = () => {
      const scale = getDiscoveryPinScaleForZoom(map.getZoom?.());
      scalableMarkerElements.forEach((element) => {
        element?.style?.setProperty?.('--pin-scale', String(scale));
      });
      densityMarkersRef.current.forEach((entry) => {
        entry?.scalableElement?.style?.setProperty?.('--pin-scale', String(scale));
      });
    };

    const markerOptions = {
      selectedKey,
      generation,
      popupGenerationRef,
      autoOpenPopups,
      openPopupOnHover,
      onSelectStoreRef,
      onSelectClusterRef
    };

    const safeClusterMinDataPoints = Number.isFinite(Number(clusterMinDataPoints))
      ? Number(clusterMinDataPoints)
      : DEFAULT_CLUSTER_MIN_DATA_POINTS;
    const clusteringActive = addressGroups.length >= Math.max(0, safeClusterMinDataPoints);

    if (!clusteringActive) {
      addressGroups.forEach((addressGroup) => {
        const rendered = renderAddressGroupMarker(map, addressGroup, markerOptions);
        if (!rendered) return;
        scalableMarkerElements.push(rendered.scalableElement);
        markersRef.current.push(rendered.marker);
        if (rendered.popup) popupsRef.current.push(rendered.popup);
        if (autoOpenPopups && rendered.openPopup) {
          autoOpenCallbacks.push({ key: rendered.key, open: rendered.openPopup });
        }
        bounds.push([addressGroup.longitude, addressGroup.latitude]);
      });
    } else {
      addressGroups.forEach((addressGroup) => {
        bounds.push([addressGroup.longitude, addressGroup.latitude]);
      });

      const addressGroupsByKey = new Map(addressGroups.map((addressGroup) => [addressGroup.groupKey, addressGroup]));
      const { featureCollection, groupsByKey } = buildClusterInputFeatures(addressGroups);
      densityGroupsByKeyRef.current = groupsByKey;

      let hasSyncedOnce = false;
      const syncDensityMarkers = () => {
        if (popupGenerationRef.current !== generation) return;
        const { clusters, leaves } = getClustersForViewport(map, DISCOVERY_DENSITY_CLUSTER_SOURCE_ID);
        const desiredKeys = new Set();
        const syncAutoOpenCallbacks = [];

        leaves.forEach((feature) => {
          const addressGroup = addressGroupsByKey.get(feature?.properties?.groupKey);
          if (!addressGroup) return;
          desiredKeys.add(addressGroup.groupKey);
          if (densityMarkersRef.current.has(addressGroup.groupKey)) return;
          const rendered = renderAddressGroupMarker(map, addressGroup, {
            ...markerOptions,
            autoOpenPopups: !hasSyncedOnce && autoOpenPopups
          });
          if (!rendered) return;
          densityMarkersRef.current.set(addressGroup.groupKey, {
            marker: rendered.marker,
            popup: rendered.popup,
            scalableElement: rendered.scalableElement
          });
          if (!hasSyncedOnce && autoOpenPopups && rendered.openPopup) {
            syncAutoOpenCallbacks.push({ key: rendered.key, open: rendered.openPopup });
          }
        });

        clusters.forEach((feature) => {
          const clusterId = feature?.properties?.cluster_id;
          const pointCount = Number(feature?.properties?.point_count) || 0;
          const coordinates = feature?.geometry?.coordinates || [];
          const [lng, lat] = coordinates;
          if (clusterId == null || !Number.isFinite(lng) || !Number.isFinite(lat)) return;
          const clusterKey = `density:${lng.toFixed(4)}:${lat.toFixed(4)}:${pointCount}`;
          desiredKeys.add(clusterKey);
          if (densityMarkersRef.current.has(clusterKey)) return;

          const clusterElement = makeDensityClusterElement(pointCount, false, `${pointCount} nearby storefronts, tap to zoom in`);
          const openDensityCluster = async (event) => {
            event?.preventDefault?.();
            event?.stopPropagation?.();
            const [expansionZoom, clusterStores] = await Promise.all([
              getExpansionZoom(map, DISCOVERY_DENSITY_CLUSTER_SOURCE_ID, clusterId),
              getClusterStores(map, DISCOVERY_DENSITY_CLUSTER_SOURCE_ID, clusterId, pointCount, densityGroupsByKeyRef.current)
            ]);
            if (popupGenerationRef.current !== generation) return;
            if (Number.isFinite(expansionZoom)) {
              map.easeTo({ center: [lng, lat], zoom: expansionZoom });
            }
            if (typeof onSelectClusterRef.current === 'function' && clusterStores.length > 0) {
              onSelectClusterRef.current(clusterStores, {
                coordinateKey: clusterKey,
                lat,
                lng,
                markerKey: clusterKey
              });
            }
          };
          clusterElement.addEventListener('click', openDensityCluster);
          clusterElement.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openDensityCluster(event);
            }
          });
          const clusterMarker = new maplibregl.Marker({ element: clusterElement, anchor: 'center' })
            .setLngLat([lng, lat])
            .addTo(map);
          densityMarkersRef.current.set(clusterKey, { marker: clusterMarker, popup: null, scalableElement: null });
        });

        Array.from(densityMarkersRef.current.keys()).forEach((key) => {
          if (desiredKeys.has(key)) return;
          const entry = densityMarkersRef.current.get(key);
          entry?.marker?.remove?.();
          entry?.popup?.remove?.();
          densityMarkersRef.current.delete(key);
        });

        applyMarkerScale();

        if (!hasSyncedOnce) {
          hasSyncedOnce = true;
          if (syncAutoOpenCallbacks.length > 0 && typeof window !== 'undefined') {
            autoOpenFrameRef.current = window.requestAnimationFrame(() => {
              autoOpenFrameRef.current = null;
              if (popupGenerationRef.current !== generation) return;
              const openedMarkerKeys = new Set();
              syncAutoOpenCallbacks.forEach((entry) => {
                const markerKey = String(entry?.key || '');
                if (!markerKey || openedMarkerKeys.has(markerKey)) return;
                openedMarkerKeys.add(markerKey);
                entry?.open?.();
              });
            });
          }
        }
      };

      const setupClusterSource = () => {
        if (popupGenerationRef.current !== generation) return;
        ensureClusterSource(map, DISCOVERY_DENSITY_CLUSTER_SOURCE_ID, featureCollection);
        ensureClusterActivationLayer(map, DISCOVERY_DENSITY_CLUSTER_SOURCE_ID);
        map.once('idle', syncDensityMarkers);
        map.on('moveend', syncDensityMarkers);
        densityMoveListenerRef.current = syncDensityMarkers;
      };

      if (styleReady) {
        setupClusterSource();
      } else {
        map.once('load', setupClusterSource);
      }
    }

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
      if (densityMoveListenerRef.current) {
        map.off('moveend', densityMoveListenerRef.current);
        densityMoveListenerRef.current = null;
      }
      if (typeof window !== 'undefined' && autoOpenFrameRef.current != null) {
        window.cancelAnimationFrame(autoOpenFrameRef.current);
        autoOpenFrameRef.current = null;
      }
    };
  }, [stores, selectedKey, userLocation, autoOpenPopups, openPopupOnHover, clusterMinDataPoints]);

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
