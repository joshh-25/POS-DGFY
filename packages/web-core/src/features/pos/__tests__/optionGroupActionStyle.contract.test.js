import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const managerPath = path.resolve(__dirname, '../components/PosFnbModifierManager.jsx');
const buttonPath = path.resolve(__dirname, '../../../../Components/ui/button.jsx');

describe('POS Items option-group creation action styling', () => {
  it('uses a compact icon-only mobile action and preserves the primary button states', () => {
    const manager = fs.readFileSync(managerPath, 'utf8');
    const buttonPrimitive = fs.readFileSync(buttonPath, 'utf8');
    const addButtonStart = manager.indexOf('aria-label="Create option group"');
    const addButtonEnd = manager.indexOf('</Button>', addButtonStart);
    const addButton = manager.slice(addButtonStart, addButtonEnd);

    expect(addButtonStart).toBeGreaterThanOrEqual(0);
    expect(addButton).toContain('<ListPlus className="h-4 w-4 min-[1200px]:mr-2"');
    expect(addButton).toContain('w-11 shrink-0 justify-center p-0');
    expect(addButton).toContain('min-[1200px]:w-auto min-[1200px]:px-4');
    expect(addButton).toContain('bg-[#1A4E8D] text-white hover:bg-[#123B6D] active:bg-[#123B6D]');
    expect(addButton).toContain('<span className="sr-only min-[1200px]:not-sr-only">New Group</span>');
    expect(buttonPrimitive).toContain('focus-visible:ring-2 focus-visible:ring-offset-2');
  });
});
