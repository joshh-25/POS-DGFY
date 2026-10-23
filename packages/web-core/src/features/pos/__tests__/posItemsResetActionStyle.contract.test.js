import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cn } from '../../../lib/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(__dirname, '../components');
const stylesheetPath = path.resolve(__dirname, '../../../index.css');

describe('POS > Items Reset All styling', () => {
  it('uses the reference default and hover colors for every Reset All action in Items', () => {
    const itemsWorkspace = fs.readFileSync(path.join(workspaceDir, 'PosItemsWorkspace.jsx'), 'utf8');
    const stylesheet = fs.readFileSync(stylesheetPath, 'utf8');

    expect((itemsWorkspace.match(/Reset All/g) || [])).toHaveLength(2);
    expect((itemsWorkspace.match(/pos-items-reset-action/g) || [])).toHaveLength(2);

    const resetDefaultStyles = stylesheet.match(/\.pos-items-reset-action\s*\{([^}]*)\}/)?.[1] || '';
    expect(resetDefaultStyles).toContain('border: 1px solid #fda4af;');
    expect(resetDefaultStyles).toContain('background-color: #fff9fa;');
    expect(resetDefaultStyles).toContain('color: #be123c;');

    const outlineResetClassNames = [
      ...itemsWorkspace.matchAll(/className="([^"]*pos-items-reset-action[^"]*)"/g),
    ].map((match) => match[1]);
    expect(outlineResetClassNames).toHaveLength(2);
    outlineResetClassNames.forEach((className) => {
      expect(className).toContain('hover:bg-[#fff1f2]');
      expect(className).toContain('hover:text-[#9f1239]');

      const mergedClassName = cn('hover:bg-slate-50 hover:text-slate-900', className);
      expect(mergedClassName).toContain('hover:bg-[#fff1f2]');
      expect(mergedClassName).toContain('hover:text-[#9f1239]');
      expect(mergedClassName).not.toContain('hover:bg-slate-50');
      expect(mergedClassName).not.toContain('hover:text-slate-900');
    });

    const resetHoverStyles = stylesheet.slice(
      stylesheet.indexOf('.pos-items-reset-action:hover,'),
      stylesheet.indexOf('/* Keep every Items metric card consistent', stylesheet.indexOf('.pos-items-reset-action:hover,'))
    );
    expect(resetHoverStyles).toContain('border-color: #fb7185;');
    expect(resetHoverStyles).toContain('background-color: #fff1f2;');
    expect(resetHoverStyles).toContain('color: #9f1239;');
  });
});
