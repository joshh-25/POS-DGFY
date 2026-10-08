import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => fs.readFileSync(path.resolve(testDirectory, relativePath), 'utf8');

const createModalSource = readSource('../../../../Components/movements/MovementCreateModal.jsx');
const detailsModalSource = readSource('../../../../Components/movements/MovementDetailsModal.jsx');
const stockMovementsPageSource = readSource('../pages/StockMovementsPage.jsx');

describe('Stock Movement dialog presentation contract', () => {
  it('keeps the create dialog usable on narrow screens with persistent actions', () => {
    expect(createModalSource).toContain('DialogDescription');
    expect(createModalSource).toContain('Choose the movement, item, and quantity, then confirm the location.');
    expect(createModalSource).toContain('Choose the movement');
    expect(createModalSource).toContain('Select item and quantity');
    expect(createModalSource).toContain('Confirm location');
    expect(createModalSource).toContain('Add details');
    expect(createModalSource).toContain('id="movement-step-heading"');
    expect(createModalSource).toContain('id="movement-item-step-heading"');
    expect(createModalSource).toContain('id="movement-location-step-heading"');
    expect(createModalSource).toContain('id="movement-details-step-heading"');
    expect(createModalSource).toContain('Fast item lookup');
    expect(createModalSource).toContain('aria-label="Close record stock movement"');
    expect(createModalSource).toContain('h-[min(92vh,52rem)]');
    expect(createModalSource).toContain('max-h-[calc(100vh-1rem)]');
    expect(createModalSource).toContain('overscroll-contain');
    expect(createModalSource).toContain('min-h-0 flex-1 overflow-y-auto');
    expect(createModalSource).toContain('portal');
    expect(createModalSource).toContain('matchTriggerWidth');
    expect(createModalSource).toContain('const [itemPickerOpen, setItemPickerOpen]');
    expect(createModalSource).toContain('setItemPickerOpen(false)');
    expect(createModalSource).toContain('filteredItems.length === 0');
    expect(createModalSource).toContain('max-h-none flex-1');
    expect(createModalSource).toContain('id="movement-scan-code"');
    expect(createModalSource).toContain('id="movement-item"');
    expect(createModalSource).toContain('id="movement-quantity"');
    expect(createModalSource).toContain('id="movement-location"');
    expect(createModalSource).toContain('id="movement-notes"');
    expect(createModalSource).toContain('type="button"');
    expect(createModalSource).toContain('onClick={handleResolveBarcodeScan}');
    expect(createModalSource).toContain('onClick={handleSubmit}');
    expect(createModalSource).toContain('onSubmit(payload)');
  });

  it('keeps movement details readable while preserving item navigation and void access', () => {
    expect(detailsModalSource).toContain('DialogDescription');
    expect(detailsModalSource).toContain('Stock movement');
    expect(detailsModalSource).toContain('See what changed, where, and when.');
    expect(detailsModalSource).toContain('Stock change');
    expect(detailsModalSource).toContain('aria-label="Close movement details"');
    expect(detailsModalSource).toContain('min-h-0 flex-1 overflow-y-auto');
    expect(detailsModalSource).toContain('aria-label="Open item in Catalog Editor"');
    expect(detailsModalSource).toContain('createPageUrl("Items")');
    expect(detailsModalSource).toContain('onVoid(movement)');
    expect(detailsModalSource).toContain('movement.reference_type !== \'VOID\'');
    expect(detailsModalSource).toContain('movement.notes?.includes(\'Voided by\')');
    expect(detailsModalSource).toContain('type="button"');
    expect(detailsModalSource).toContain('movement.reference_id');
    expect(detailsModalSource).toContain('lossReasonLabel');
  });

  it('keeps the void confirmation warning, reason validation, and pending-state lock intact', () => {
    expect(stockMovementsPageSource).toContain('Void stock movement');
    expect(stockMovementsPageSource).toContain('Selected movement');
    expect(stockMovementsPageSource).toContain('This action restores the previous stock balance.');
    expect(stockMovementsPageSource).toContain("'Void movement'");
    expect(stockMovementsPageSource).toContain('aria-label="Close void movement dialog"');
    expect(stockMovementsPageSource).toContain('role="alert"');
    expect(stockMovementsPageSource).toContain('id="voidReason"');
    expect(stockMovementsPageSource).toContain('aria-required="true"');
    expect(stockMovementsPageSource).toContain('if (!movementToVoid || !voidReason.trim()) return;');
    expect(stockMovementsPageSource).toContain('onClick={confirmVoid}');
    expect(stockMovementsPageSource).toContain('disabled={!voidReason.trim() || isVoiding}');
    expect(stockMovementsPageSource).toContain('disabled={isVoiding}');
    expect(stockMovementsPageSource).toContain('voidFeatureMovement');
  });
});
