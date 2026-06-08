import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const readStoreCss = () => {
  const directPath = path.resolve(process.cwd(), 'apps/store/src/index.css');
  const repoPath = path.resolve(process.cwd(), 'frontend/apps/store/src/index.css');
  return fs.readFileSync(fs.existsSync(directPath) ? directPath : repoPath, 'utf8');
};

describe('Storefront marker CSS contract', () => {
  it('keeps the MapLibre marker root as a fixed coordinate anchor box', () => {
    const css = readStoreCss();
    const rootRule = css.match(/\.discovery-result-pin\s*\{[^}]+\}/)?.[0] || '';
    const visualRule = css.match(/\.discovery-result-pin-visual\s*\{[^}]+\}/)?.[0] || '';

    expect(rootRule).toContain('width: 38px');
    expect(rootRule).toContain('height: 48px');
    expect(rootRule).toContain('overflow: visible');
    expect(visualRule).toContain('position: absolute');
    expect(visualRule).toContain('inset: 0');
    expect(visualRule).toContain('width: 38px');
    expect(visualRule).toContain('height: 48px');
  });

  it('keeps search-active pulse from scaling the marker body', () => {
    const css = readStoreCss();
    const glowRule = css.match(/\.discovery-result-pin-visual\.is-glowing\s*\{[^}]+\}/)?.[0] || '';
    const markerGlowKeyframes = css.match(/@keyframes discoveryPinMarkerGlow\s*\{[\s\S]*?\n\}/)?.[0] || '';

    expect(glowRule).toContain('discoveryPinMarkerGlow');
    expect(glowRule).not.toContain('scale(');
    expect(markerGlowKeyframes).toContain('filter: drop-shadow');
    expect(markerGlowKeyframes).not.toContain('scale(');
    expect(css).not.toContain('discoveryPinMarkerBreath');
  });
});
