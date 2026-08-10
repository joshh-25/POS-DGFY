import React, { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
// Issue #282, Phase E: colocated with the library import instead of a
// blanket StorefrontApp.jsx-level import -- this file is now only reached
// via DeliveryPinMapLazy.jsx's dynamic import(), so the CSS loads only when
// a delivery-pin map actually renders instead of on every storefront page.
import 'maplibre-gl/dist/maplibre-gl.css';

import {
  DEFAULT_CENTER,
  TILING_SERVER,
  tileTransformRequest
} from '../../../app/runtime/storefrontMapRuntime.js';
import { makeUserLocationElement } from '../../discovery/utils/discoveryMapMarkers.js';

export function DeliveryPinMap({
  pin = null,
  onPinChange,
  disabled = false,
  height = 260,
  highlighted = false,
  highlightColor = '#f97316',
  highlightGlow = 'rgba(249,115,22,0.14)',
  overlayControls = null
}) {
  const frameRef = useRef(null);
  const ref = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const resolvedHeight = typeof height === 'number' ? `${height}px` : String(height || '260px');

  const scheduleMapResize = useCallback((reason = 'layout') => {
    const map = mapRef.current;
    const frame = frameRef.current;
    if (!map || !frame) return undefined;

    const runResize = () => {
      const rect = frame.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const canvas = map.getCanvas?.();
      const canvasContainer = map.getCanvasContainer?.();
      if (canvasContainer?.style) {
        canvasContainer.style.width = '100%';
        canvasContainer.style.height = '100%';
      }
      if (canvas?.style) {
        canvas.style.zIndex = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
      }
      map.resize();
    };

    const rafId = window.requestAnimationFrame(runResize);
    const earlyTimer = window.setTimeout(runResize, reason === 'visible' ? 60 : 40);
    const settleTimer = window.setTimeout(runResize, 220);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(earlyTimer);
      window.clearTimeout(settleTimer);
    };
  }, []);

  useEffect(() => {
    if (!ref.current || mapRef.current) return undefined;
    let map;
    try {
      map = new maplibregl.Map({
        container: ref.current,
        style: TILING_SERVER,
        transformRequest: tileTransformRequest,
        center: [DEFAULT_CENTER.longitude, DEFAULT_CENTER.latitude],
        zoom: 13
      });
    } catch (error) {
      console.warn('[DeliveryPinMap] MapLibre init unavailable', error);
      window.setTimeout(() => setMapUnavailable(true), 0);
      return undefined;
    }
    const canvasContainer = map.getCanvasContainer?.();
    if (canvasContainer?.style) {
      canvasContainer.style.width = '100%';
      canvasContainer.style.height = '100%';
    }
    const canvas = map.getCanvas();
    canvas.style.zIndex = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    map.on('error', (event) => console.error('[DeliveryPinMap] MapLibre error', event));
    map.on('load', () => {
      scheduleMapResize('load');
    });
    mapRef.current = map;
    const cleanupInitialResize = scheduleMapResize('init');
    return () => {
      cleanupInitialResize?.();
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
  }, [scheduleMapResize]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }

    if (pin?.latitude != null && pin?.longitude != null) {
      const lat = Number(pin.latitude);
      const lng = Number(pin.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const el = makeUserLocationElement();
        markerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom', draggable: !disabled })
          .setLngLat([lng, lat])
          .addTo(map);
        if (!disabled) {
          markerRef.current.on('dragstart', () => {
            if (markerRef.current?._element) markerRef.current._element.style.cursor = 'grabbing';
          });
          markerRef.current.on('dragend', () => {
            const nextLngLat = markerRef.current?.getLngLat?.();
            if (markerRef.current?._element) markerRef.current._element.style.cursor = 'grab';
            const nextLat = Number(nextLngLat?.lat);
            const nextLng = Number(nextLngLat?.lng);
            if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) return;
            onPinChange?.({
              latitude: Number(nextLat.toFixed(6)),
              longitude: Number(nextLng.toFixed(6))
            });
          });
        }
        map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 15) });
      }
    }
  }, [disabled, onPinChange, pin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (disabled) return undefined;

    const handleClick = (event) => {
      const lat = Number(event?.lngLat?.lat);
      const lng = Number(event?.lngLat?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      onPinChange?.({
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6))
      });
    };

    map.on('click', handleClick);
    return () => map.off('click', handleClick);
  }, [disabled, onPinChange]);

  useEffect(() => {
    if (!mapRef.current || !frameRef.current) return undefined;
    const cleanupTasks = [];
    cleanupTasks.push(scheduleMapResize('visible'));

    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        const cleanup = scheduleMapResize('observer');
        if (cleanup) cleanupTasks.push(cleanup);
      });
      resizeObserver.observe(frameRef.current);
    }

    const handleViewportResize = () => {
      const cleanup = scheduleMapResize('viewport');
      if (cleanup) cleanupTasks.push(cleanup);
    };
    window.addEventListener('resize', handleViewportResize);
    window.addEventListener('orientationchange', handleViewportResize);
    window.visualViewport?.addEventListener?.('resize', handleViewportResize);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleViewportResize);
      window.removeEventListener('orientationchange', handleViewportResize);
      window.visualViewport?.removeEventListener?.('resize', handleViewportResize);
      cleanupTasks.splice(0).forEach((cleanup) => cleanup?.());
    };
  }, [disabled, resolvedHeight, scheduleMapResize]);

  if (mapUnavailable) {
    return (
      <div
        data-delivery-map-frame="fallback"
        style={{
          marginBottom: 10,
          width: '100%',
          height: resolvedHeight,
          minHeight: resolvedHeight,
          border: `2px solid ${highlighted ? highlightColor : '#cbd5e1'}`,
          borderRadius: 16,
          background: '#f8fafc',
          padding: 16,
          color: '#475569',
          fontSize: 13,
          boxShadow: highlighted ? `0 12px 28px ${highlightGlow}` : 'none'
        }}
      >
        Map pin selection is unavailable on this device. Use the delivery address fields instead.
      </div>
    );
  }

  return (
    <div
      ref={frameRef}
      data-delivery-map-frame="true"
      style={{
        position: 'relative',
        marginBottom: 10,
        width: '100%',
        maxWidth: '100%',
        height: resolvedHeight,
        minHeight: resolvedHeight,
        overflow: 'hidden',
        border: `1.5px solid ${highlighted ? highlightColor : '#dbe5ee'}`,
        borderRadius: 18,
        isolation: 'isolate',
        zIndex: 0,
        boxShadow: highlighted ? `0 0 0 4px ${highlightGlow}` : '0 10px 28px rgba(15,23,42,0.06)',
        transition: 'all 200ms ease'
      }}
    >
      <div
        ref={ref}
        data-delivery-map-root="true"
        style={{
          position: 'absolute',
          inset: 0,
          height: '100%',
          width: '100%',
          minHeight: 0
        }}
      />
      {overlayControls && (
        <div
          data-delivery-map-controls="true"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 10
          }}
        >
          {overlayControls}
        </div>
      )}
      {disabled && (
        <div style={{ position: 'absolute', inset: 0, borderRadius: 10, background: 'rgba(255,255,255,.6)', zIndex: 20 }} />
      )}
    </div>
  );
}
