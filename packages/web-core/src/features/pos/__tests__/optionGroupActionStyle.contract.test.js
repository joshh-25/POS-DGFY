import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const managerPath = path.resolve(__dirname, '../components/PosFnbModifierManager.jsx');
const stylesheetPath = path.resolve(__dirname, '../../../index.css');

describe('POS Items option-group creation action styling', () => {
  it('uses the reference hover while preserving focus and pressed colors at every viewport', () => {
    const manager = fs.readFileSync(managerPath, 'utf8');
    const stylesheet = fs.readFileSync(stylesheetPath, 'utf8');
    const stylesStart = stylesheet.indexOf('.pos-items-options-workspace .pos-items-options-add-button {');
    const stylesEnd = stylesheet.indexOf('/* Reset actions in POS > Items', stylesStart);
    const actionStyles = stylesheet.slice(stylesStart, stylesEnd);
    const addButtonStart = manager.indexOf('aria-label="Add an Option Group"');
    const addButtonEnd = manager.indexOf('</button>', addButtonStart);
    const addButton = manager.slice(addButtonStart, addButtonEnd);

    expect(addButton).toContain('pos-items-options-add-button');
    expect(stylesStart).toBeGreaterThanOrEqual(0);
    expect(actionStyles).toContain('.pos-items-options-add-button:focus-visible,');
    expect(actionStyles).toContain('.pos-items-options-add-button:active');
    expect(actionStyles).toContain('background-color: #143f73;');
    expect(actionStyles).toContain('.pos-items-options-add-button:hover:not([aria-pressed="true"]):not(:active):not(:focus-visible)');
    expect(actionStyles).toContain('background-color: #eff6ff;');
    expect(actionStyles).toContain('color: #0f172a;');
    expect(actionStyles).toContain('border-color: #1a4e8d;');
  });
});
