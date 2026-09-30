import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

// This test lives in packages/web-core, but the standalone POS app it asserts
// against is a sibling app post-split (issue #322) -- apps/dgfy-pos, not
// anything under web-core itself.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const manifestPath = path.resolve(repoRoot, 'apps/dgfy-pos/manifest.webmanifest');
const publicRoot = path.resolve(repoRoot, 'apps/dgfy-pos/public');
const appShellPath = path.resolve(repoRoot, 'apps/dgfy-pos/index.html');
const serviceWorkerPath = path.resolve(publicRoot, 'sw.js');

const readManifest = () => JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

describe('POS PWA manifest identity contracts', () => {
  it('uses and offline-caches the provided POS browser favicon', () => {
    const appShell = fs.readFileSync(appShellPath, 'utf8');
    const serviceWorker = fs.readFileSync(serviceWorkerPath, 'utf8');
    const requiredShellAssets = serviceWorker.match(/const REQUIRED_SHELL_ASSETS = \[([\s\S]*?)\];/)?.[1] || '';

    expect(appShell).toMatch(/<link rel="icon" type="image\/png" href="\.\/favicon\.png"\s*\/>/);
    expect(fs.existsSync(path.join(publicRoot, 'favicon.png'))).toBe(true);
    expect(requiredShellAssets).toContain('${BASE_PATH}favicon.png');
  });

  it('identifies the standalone application exclusively as DGFY POS', () => {
    const manifest = readManifest();

    expect(manifest).toMatchObject({
      id: '/',
      name: 'DGFY POS',
      short_name: 'DGFY POS',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#1A4E8D'
    });
    expect(manifest.name).not.toMatch(/SKUpervisor/i);
    expect(manifest.short_name).not.toMatch(/SKU/i);
  });

  it('declares existing square any-purpose and maskable icon assets', () => {
    const manifest = readManifest();
    const icons = Array.isArray(manifest.icons) ? manifest.icons : [];

    expect(icons).toEqual(expect.arrayContaining([
      expect.objectContaining({
        src: '/pos-icon-192.png',
        sizes: '192x192',
        type: 'image/png'
      }),
      expect.objectContaining({
        src: '/pos-icon-512.png',
        sizes: '512x512',
        type: 'image/png'
      }),
      expect.objectContaining({
        src: '/pos-icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      })
    ]));

    for (const icon of icons) {
      expect(icon.src.startsWith('/')).toBe(true);
      expect(fs.existsSync(path.join(publicRoot, icon.src.slice(1)))).toBe(true);
    }
  });
});
