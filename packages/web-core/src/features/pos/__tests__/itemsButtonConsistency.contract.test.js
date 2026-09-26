import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const webCoreRoot = path.resolve(testDirectory, '../../../..');
const read = (relativePath) => fs.readFileSync(path.resolve(webCoreRoot, relativePath), 'utf8');

describe('POS Items button consistency contract', () => {
  it('uses one History-style control contract across all Items tabs and responsive views', () => {
    const css = read('src/index.css');

    expect(css).toContain('.pos-items-catalog-workspace :where(');
    expect(css).toContain('.pos-items-desktop-actions > button');
    expect(css).toContain('.pos-categories-mobile-card-actions button');
    expect(css).toContain('.pos-items-mobile-card-actions button');
    expect(css).toContain('.pos-items-options-group-actions button');
    expect(css).toContain('height: 2.25rem;');
    expect(css).toContain('border-radius: 0.5rem;');
    expect(css).toContain('box-shadow: 0 1px 2px rgb(15 23 42 / 0.08);');
    expect(css).toContain('@media (max-width: 1023.98px)');
    expect(css).toContain('height: 2.5rem;');
    expect(css).toContain('body[data-pos-text-size="large"] .pos-items-catalog-workspace');
    expect(css).toContain('height: auto;');
  });
});
