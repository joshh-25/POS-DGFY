import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readAppSource = (relativePath) => fs.readFileSync(path.join(appRoot, relativePath), 'utf8');

const sharedPickerImport = 'shared/components/checkout/StorefrontScheduledDateTimePicker.jsx';

describe('scheduled date/time picker mode contract', () => {
  it('uses the same shared picker implementation in F&B, Retail, and Simple checkout', () => {
    const modeSources = [
      readAppSource('modes/fnb/checkout/components/FnbCheckoutFulfillmentChoices.jsx'),
      readAppSource('modes/retail/checkout/components/RetailOrderFulfillmentStep.jsx'),
      readAppSource('modes/simple/checkout/components/SimpleCheckoutFulfillmentChoices.jsx')
    ];

    for (const source of modeSources) {
      expect(source).toContain(sharedPickerImport);
    }
  });

  it('does not retain an unused F&B-only picker that could drift from the shared UI', () => {
    expect(fs.existsSync(path.join(
      appRoot,
      'modes/fnb/checkout/components/FnbDineInDateTimePicker.jsx'
    ))).toBe(false);
  });
});
