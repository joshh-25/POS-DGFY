import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const poCreatePath = path.resolve(__dirname, '../../../Components/po/POCreateWizard.jsx');
const joCreatePath = path.resolve(__dirname, '../../../Components/jo/JOCreateModal.jsx');
const joDetailsPath = path.resolve(__dirname, '../../../Components/jo/JODetailsModal.jsx');
const uomDisplayPath = path.resolve(__dirname, '../../utils/uomDisplay.js');

describe('PO/JO quantity UX contracts', () => {
  let poCreateContent = '';
  let joCreateContent = '';
  let joDetailsContent = '';
  let uomDisplayContent = '';

  beforeAll(() => {
    poCreateContent = fs.readFileSync(poCreatePath, 'utf8');
    joCreateContent = fs.readFileSync(joCreatePath, 'utf8');
    joDetailsContent = fs.readFileSync(joDetailsPath, 'utf8');
    uomDisplayContent = fs.readFileSync(uomDisplayPath, 'utf8');
  });

  it('uses shared NumberStepper with right-vertical controls in PO + JO create/edit flows', () => {
    expect(poCreateContent).toContain('import NumberStepper');
    expect(poCreateContent).toContain('controlsPosition="right-vertical"');
    expect(poCreateContent).toContain('size="sm"');

    expect(joCreateContent).toContain('import NumberStepper');
    expect(joCreateContent).toContain('controlsPosition="right-vertical"');
    expect(joCreateContent).toContain('size="sm"');
  });

  it('avoids legacy in-input absolute UOM overlays in PO/JO create quantity controls', () => {
    expect(poCreateContent).not.toContain('absolute right-7');
    expect(joCreateContent).not.toContain('absolute right-7');
  });

  it('centralizes strict UOM abbreviation formatting and uses it in PO/JO surfaces', () => {
    expect(uomDisplayContent).toContain('STRICT_SHORT_MAP');
    expect(uomDisplayContent).toContain("units: 'u'");

    expect(poCreateContent).toContain('toUomAbbreviation');
    expect(joCreateContent).toContain('toUomAbbreviation');
    expect(joDetailsContent).toContain('toUomAbbreviation');
  });
});
