import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mainSource = () => fs.readFileSync(path.join(appRoot, 'main.jsx'), 'utf8');
const panelSource = () => fs.readFileSync(path.join(appRoot, 'FnbReservationPanel.jsx'), 'utf8');

describe('Food & Beverage storefront contract', () => {
  it('renders restaurant menu metadata and carries modifiers into checkout lines', () => {
    const source = mainSource();

    expect(source).toContain('fnb_modifier_groups');
    expect(source).toContain('Allergens:');
    expect(source).toContain('getDefaultFnbLineModifiers');
    expect(source).toContain('line_modifiers');
  });

  it('exposes the public reservation request tab for F&B storefronts', () => {
    const source = mainSource();
    const panel = panelSource();

    expect(source).toContain("id: 'reservation'");
    expect(source).toContain('/api/v1/store/fnb/reservations');
    expect(panel).toContain('Reservation Request');
    expect(panel).toContain('Send Request');
  });
});
