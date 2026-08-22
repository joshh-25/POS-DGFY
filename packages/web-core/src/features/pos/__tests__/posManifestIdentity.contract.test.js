import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const frontendRoot = process.cwd();
const manifestPath = path.resolve(frontendRoot, 'apps/pos/manifest.webmanifest');
const publicRoot = path.resolve(frontendRoot, 'apps/pos/public');

const readManifest = () => JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

describe('POS PWA manifest identity contracts', () => {
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
