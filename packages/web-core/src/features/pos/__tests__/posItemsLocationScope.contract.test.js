import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const componentsDirectory = path.resolve(testDirectory, '../components');
const terminalPagePath = path.resolve(testDirectory, '../pages/TerminalPage.jsx');
const readComponent = (fileName) => fs.readFileSync(path.join(componentsDirectory, fileName), 'utf8');

describe('POS Items location-scoped catalog contract', () => {
  it('does not fall back to the tenant-wide inventory endpoint', () => {
    const itemsWorkspace = readComponent('PosItemsWorkspace.jsx');
    const optionsWorkspace = readComponent('PosFnbModifiersWorkspace.jsx');

    expect(itemsWorkspace).not.toContain('getItems({ limit: 1000 })');
    expect(itemsWorkspace).not.toContain('loadLegacyItems');
    expect(optionsWorkspace).not.toContain("from '@/services/itemService.js'");
    expect(optionsWorkspace).not.toContain('fetchPosCatalog({ limit: 500 })');
  });

  it('requires an authorized location for both catalog surfaces', () => {
    const itemsWorkspace = readComponent('PosItemsWorkspace.jsx');
    const optionsWorkspace = readComponent('PosFnbModifiersWorkspace.jsx');

    expect(itemsWorkspace).toContain('fetchPosCatalogPage({');
    expect(itemsWorkspace).toContain('location_id: scopedLocationId');
    expect(itemsWorkspace).toContain('scopedItemsCache');
    expect(optionsWorkspace).toContain('fetchPosCatalog({ limit: 500, location_id: scopedLocationId })');
    expect(optionsWorkspace).toContain('scopedCatalogCache');
  });

  it('waits for initial location resolution only in the POS Items catalog', () => {
    const terminalPage = fs.readFileSync(terminalPagePath, 'utf8');
    const locationsStateStart = terminalPage.indexOf('const [locationsState, setLocationsState] = useState({');
    const locationsStateEnd = terminalPage.indexOf('});', locationsStateStart);
    const initialLocationsState = terminalPage.slice(locationsStateStart, locationsStateEnd);
    const itemsWorkspace = readComponent('PosItemsWorkspace.jsx');
    const terminalWorkspace = readComponent('TerminalOperationsWorkspace.jsx');

    expect(locationsStateStart).toBeGreaterThan(-1);
    expect(initialLocationsState).toContain('loading: false');
    expect(initialLocationsState).toContain('locations: []');
    expect(terminalPage).toContain('const [itemsLocationScopeLoading, setItemsLocationScopeLoading] = useState(true);');
    expect(terminalPage).toContain('setItemsLocationScopeLoading(false);');
    expect(terminalPage).toContain('itemsLocationScopeLoading={itemsLocationScopeLoading}');
    expect(terminalWorkspace).toContain('itemsLocationScopeLoading = false');
    expect(terminalWorkspace).toContain('locationsLoading={(locationsState?.loading === true) || itemsLocationScopeLoading}');
  });
});
