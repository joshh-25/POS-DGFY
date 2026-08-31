// #475 RF-1 -- regression test for the pinch-gesture fix.
//
// pr-reviewer's blocker on PR #1188 was specific and correct: MapLibre's
// TouchZoomRotateHandler binds its touch listeners to map.getCanvasContainer() and
// (per maplibre-gl's own handler_manager.ts, `_getMapTouches`) only accepts a touch
// whose *original* DOM target is a descendant of that container
// (`this._el.contains(target)`). Setting `touch-action: none` on an overlay chip that
// is merely a CSS sibling of `.maplibregl-map` stops the *browser's* default
// page-zoom gesture on that chip, but cannot make a touch that started on a sibling
// retarget into the map -- a DOM touch event keeps the element it started on for the
// whole gesture and never bubbles sideways to a sibling.
//
// This test proves that empirically, with a real browser, real WebGL, real
// maplibre-gl, and a real two-finger touch sequence dispatched over CDP:
//   - a chip that is a plain DOM sibling of the map root does NOT cause the map to
//     zoom when a pinch starts on it (reproduces the exact defect RF-1 described);
//   - the same chip, made a DOM descendant of map.getCanvasContainer() -- which is
//     what DeliveryPinMap.jsx / StoresMap.jsx / DiscoveryHeroMapStage.jsx now do via
//     ReactDOM.createPortal -- DOES cause the map to zoom on the same gesture.
//
// It intentionally does not render the real React components (that would need a
// running dev server + backend, see playwright.pinch-gesture.config.js's header
// comment); it isolates the one DOM relationship the fix actually changes and proves
// MapLibre's real, unmodified touch handling treats the two shapes differently.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAPLIBRE_JS = path.resolve(__dirname, '../../node_modules/maplibre-gl/dist/maplibre-gl.js');
const MAPLIBRE_CSS = path.resolve(__dirname, '../../node_modules/maplibre-gl/dist/maplibre-gl.css');

function pageHtml(mode) {
  // mode: 'sibling' reproduces the pre-fix DOM shape (chip is a sibling of the
  // MapLibre root); 'portal' reproduces the post-fix shape (chip is a child of
  // map.getCanvasContainer(), as ReactDOM.createPortal now places it).
  return `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="/maplibre-gl.css">
<style>
  html, body { margin: 0; padding: 0; }
  #outer { position: relative; width: 400px; height: 400px; }
  #root { position: absolute; inset: 0; }
  #chip { position: absolute; left: 20px; bottom: 20px; width: 80px; height: 40px; background: #fff; touch-action: none; z-index: 10; }
</style>
</head>
<body>
<div id="outer">
  <div id="root"></div>
  ${mode === 'sibling' ? '<div id="chip"></div>' : ''}
</div>
<script src="/maplibre-gl.js"></script>
<script>
  window.__ready = new Promise((resolve) => {
    const map = new maplibregl.Map({
      container: document.getElementById('root'),
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eee' } }] },
      center: [0, 0],
      zoom: 4
    });
    window.__map = map;
    map.on('load', () => {
      if ('${mode}' === 'portal') {
        const chip = document.createElement('div');
        chip.id = 'chip';
        Object.assign(chip.style, {
          position: 'absolute', left: '20px', bottom: '20px', width: '80px',
          height: '40px', background: '#fff', touchAction: 'none', zIndex: '10'
        });
        // This appendChild into getCanvasContainer() is exactly what
        // ReactDOM.createPortal(overlay, canvasContainerEl) achieves in the real
        // components -- a real DOM descendant relationship, not a visual overlay.
        map.getCanvasContainer().appendChild(chip);
      }
      resolve();
    });
  });
</script>
</body></html>`;
}

function startServer(mode) {
  const server = http.createServer((req, res) => {
    if (req.url === '/maplibre-gl.js') {
      res.setHeader('Content-Type', 'application/javascript');
      fs.createReadStream(MAPLIBRE_JS).pipe(res);
      return;
    }
    if (req.url === '/maplibre-gl.css') {
      res.setHeader('Content-Type', 'text/css');
      fs.createReadStream(MAPLIBRE_CSS).pipe(res);
      return;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(pageHtml(mode));
  });
  return new Promise((resolve) => {
    server.listen(0, () => resolve(server));
  });
}

// Dispatches a real two-finger pinch-out gesture (zoom-in) centered on `center`,
// via CDP -- Playwright's own `page.touchscreen` API only supports single-point
// taps, so multi-touch needs the CDP session directly, same mechanism DevTools'
// touch emulation uses.
async function dispatchPinchOut(page, center) {
  const cdp = await page.context().newCDPSession(page);
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const spread = 4 + i * 6; // 4px apart growing to 52px apart
    const touchPoints = [
      { x: center.x - spread, y: center.y },
      { x: center.x + spread, y: center.y }
    ];
    await cdp.send('Input.dispatchTouchEvent', {
      type: i === 0 ? 'touchStart' : 'touchMove',
      touchPoints
    });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function runPinchCase(page, mode) {
  const server = await startServer(mode);
  const { port } = server.address();
  try {
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.evaluate(() => window.__ready);

    const chipCenter = await page.evaluate(() => {
      const rect = document.getElementById('chip').getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });

    const zoomBefore = await page.evaluate(() => window.__map.getZoom());
    await dispatchPinchOut(page, chipCenter);
    await page.waitForTimeout(300);
    const zoomAfter = await page.evaluate(() => window.__map.getZoom());

    return { zoomBefore, zoomAfter };
  } finally {
    server.close();
  }
}

test.describe('#475 RF-1: pinch gesture reaches the map only when the overlay is inside canvasContainer', () => {
  test('a chip that is a DOM sibling of the map root does not zoom the map (reproduces the pre-fix defect)', async ({ page }) => {
    const { zoomBefore, zoomAfter } = await runPinchCase(page, 'sibling');
    expect(zoomAfter).toBeCloseTo(zoomBefore, 2);
  });

  test('the same chip, portaled into map.getCanvasContainer(), zooms the map on the same gesture (the fix)', async ({ page }) => {
    const { zoomBefore, zoomAfter } = await runPinchCase(page, 'portal');
    expect(zoomAfter).toBeGreaterThan(zoomBefore + 0.5);
  });
});
