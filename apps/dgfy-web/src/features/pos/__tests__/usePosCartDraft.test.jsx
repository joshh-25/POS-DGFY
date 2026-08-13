// @vitest-environment jsdom

import React, { useState } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { usePosCartDraft } from '../hooks/usePosCartDraft.js';
import { loadPosCartDraft, loadPosCartDraftState, savePosCartDraft } from '../services/posCartDraftStore.js';

const scope = {
  tenantId: 'company-a',
  terminalId: 'COUNTER-01',
  locationId: 9,
  userId: 7
};
const catalog = [{ item_id: 4, name: 'Beef Meal', vat_type: 'vatable' }];

const CartDraftHarness = () => {
  const [cart, setCart] = useState([]);
  usePosCartDraft({
    activeShiftId: 81,
    cart,
    catalog,
    catalogReady: true,
    enabled: true,
    scope,
    setCart
  });
  return <div>{cart.map((line) => line.item_name).join(', ') || 'Empty'}</div>;
};

describe('usePosCartDraft', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('restores the existing shift cart without clearing the draft during hydration', async () => {
    savePosCartDraft(scope, 81, [{
      item_id: 4,
      item_name: 'Beef Meal',
      quantity: 1,
      sale_price: 150
    }]);

    render(<CartDraftHarness />);

    await waitFor(() => expect(screen.getByText('Beef Meal')).toBeTruthy());
    expect(loadPosCartDraft(scope, 81, catalog)).toHaveLength(1);
  });

  it('restores the resumed parked-sale identity with the same shift cart', () => {
    savePosCartDraft(scope, 81, [{
      item_id: 4,
      item_name: 'Beef Meal',
      quantity: 1,
      sale_price: 150
    }], {
      activeParkedSale: {
        pos_parked_sale_id: 17,
        park_reference: 'PARK-ABC123',
        revision: 2
      }
    });

    expect(loadPosCartDraftState(scope, 81, catalog)).toEqual(expect.objectContaining({
      activeParkedSale: {
        pos_parked_sale_id: 17,
        park_reference: 'PARK-ABC123',
        revision: 2
      }
    }));
  });
});
