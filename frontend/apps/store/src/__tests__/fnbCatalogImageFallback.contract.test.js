import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = () => fs.readFileSync(path.join(appRoot, 'StorefrontApp.jsx'), 'utf8');

describe('F&B catalog image fallback contract', () => {
  it('uses the existing category placeholder after a catalog image fails to load', () => {
    const source = appSource();

    expect(source).toContain('const [hasImageError, setHasImageError] = useState(false);');
    expect(source).toContain('const canRenderImage = Boolean(imageUrl) && !hasImageError;');
    expect(source.match(/onError=\{\(\) => setHasImageError\(true\)\}/g)).toHaveLength(2);
    expect(source.match(/<CategoryIcon size=\{/g).length).toBeGreaterThanOrEqual(2);
    expect(source).toContain('setHasImageError(false);');
  });
});
