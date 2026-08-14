import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const readFrontendFile = (relativePath) => fs.readFileSync(path.resolve(webCoreRoot, relativePath), 'utf8');

describe('item Senior/PWD discount eligibility controls', () => {
  it('wires POS item create and edit controls to the persisted field', () => {
    const workspace = readFrontendFile('src/features/pos/components/TerminalOperationsWorkspace.jsx');

    expect(workspace).toContain('Senior/PWD Eligible');
    expect(workspace).toContain('aria-checked={createForm.senior_pwd_discount_eligible}');
    expect(workspace).toContain('aria-checked={editForm.senior_pwd_discount_eligible}');
    expect(workspace).toContain('Number(item?.senior_pwd_discount_eligible) === 1');
    expect(workspace).toContain('senior_pwd_discount_eligible: createForm.senior_pwd_discount_eligible === true');
    expect(workspace).toContain('senior_pwd_discount_eligible: editForm.senior_pwd_discount_eligible === true');
  });

  it('keeps the full inventory item editor consistent', () => {
    const itemForm = readFrontendFile('Components/items/ItemFormModal.jsx');

    expect(itemForm).toContain("'senior_pwd_discount_eligible'");
    expect(itemForm).toContain('Senior/PWD Eligible');
    expect(itemForm).toContain('Number(item.senior_pwd_discount_eligible) === 1');
    expect(itemForm).toContain('senior_pwd_discount_eligible: cleanedData.senior_pwd_discount_eligible === true');
    expect(itemForm).toContain("handleChange('senior_pwd_discount_eligible', Boolean(checked))");
  });

  it('copies Senior/PWD eligibility from catalog items into POS cart lines', () => {
    const checkoutTerminal = readFrontendFile('src/features/pos/components/POSCheckoutTerminal.jsx');

    expect(checkoutTerminal).toContain('isSeniorPwdDiscountEligible(item.senior_pwd_discount_eligible)');
    expect(checkoutTerminal).toContain('isCartLineSeniorPwdEligible');
    expect(checkoutTerminal).toContain('safeCart.filter(isCartLineSeniorPwdEligible)');
    expect(checkoutTerminal).toContain('No eligible items are in this cart.');
    expect(checkoutTerminal).toContain('remove and re-add it to this cart.');
    expect(checkoutTerminal).toContain('Eligible quantity for ${line.item_name}');
    expect(checkoutTerminal).toContain('eligible_quantity: eligibleQuantity');
    expect(checkoutTerminal).toContain('eligible_items: statutory ? safeEligibleDiscountItems : []');
  });
});
