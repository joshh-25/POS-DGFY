import { describe, expect, it } from 'vitest';
import {
  buildKitchenTicketDisplay,
  formatKitchenQuantity,
  getTicketRecipeMovementCount,
  getTicketSnapshotLines,
  getTicketSourceLabel
} from '../utils/kitchenQueueDisplay.js';

describe('F&B kitchen queue display contract', () => {
  it('builds an operator-safe display model from Storefront ticket snapshots', () => {
    const itemMap = new Map([[9, { item_id: 9, name: 'Smash Burger' }]]);
    const ticket = {
      ticket_number: 'WEB-501-AA',
      status: 'queued',
      check_id: 33,
      station: { name: 'Hot Line' },
      lines_snapshot: {
        source: 'storefront_checkout',
        recipe_movements: [{ ingredient_item_id: 12 }, { ingredient_item_id: 13 }],
        lines: [
          { check_line_id: 101, item_id: 9, quantity: '2.5000', status: 'sent' }
        ]
      }
    };

    const display = buildKitchenTicketDisplay({
      ticket,
      check: { check_id: 33, order_method: 'pickup' },
      itemMap
    });

    expect(display).toMatchObject({
      ticket_number: 'WEB-501-AA',
      status: 'queued',
      source_label: 'Online',
      station_label: 'Hot Line',
      check_id: 33,
      recipe_movement_count: 2
    });
    expect(display.lines).toEqual([{
      check_line_id: 101,
      item_id: 9,
      name: 'Smash Burger',
      quantity_label: '2.50',
      status: 'sent'
    }]);
  });

  it('falls back to live check lines for manually fired restaurant tickets', () => {
    const check = {
      check_id: 44,
      order_method: 'dine_in',
      lines: [{ check_line_id: 201, item: { name: 'Iced Tea' }, quantity: 1 }]
    };
    const ticket = {
      ticket_number: 'GEN-1',
      status: 'preparing',
      lines_snapshot: null
    };

    expect(getTicketSourceLabel(ticket, check)).toBe('dine in');
    expect(getTicketSnapshotLines(ticket, check)).toEqual(check.lines);
    expect(getTicketRecipeMovementCount(ticket)).toBe(0);
    expect(buildKitchenTicketDisplay({ ticket, check }).lines[0]).toMatchObject({
      name: 'Iced Tea',
      quantity_label: '1'
    });
  });

  it('normalizes unusual quantities without leaking NaN into the kitchen UI', () => {
    expect(formatKitchenQuantity('3')).toBe('3');
    expect(formatKitchenQuantity('3.125')).toBe('3.13');
    expect(formatKitchenQuantity(undefined)).toBe('1');
  });
});
