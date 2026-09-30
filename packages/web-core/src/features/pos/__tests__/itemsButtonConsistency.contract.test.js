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
    const workspace = read('src/features/pos/components/TerminalOperationsWorkspace.jsx');

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
    expect(css).toContain('.dgfy-pos-shell[data-pos-items-view="true"] .pos-items-mobile-import-button');
    expect(css).toContain('font-size: 0.875rem;');
    expect(css).toContain('text-overflow: ellipsis;');
    expect(css).toContain('background: #1a4e8d;');
    expect(css).toContain('.pos-items-mobile-search > svg');
    expect(css).toContain('left: 0.75rem;');
    expect(workspace).toContain('<Filter className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />');
    expect(workspace).toContain('<Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#1A4E8D]" aria-hidden="true" />');
    expect(workspace).toContain('<Filter aria-hidden="true" />');
  });
});
