import { describe, expect, it } from 'vitest';
import { buildFnbGlobalOrderNote, buildFnbPrintContext } from '../utils/posOrderNotes.js';

describe('POS order note separation', () => {
  it('keeps the global kitchen note separate from the table label', () => {
    expect(buildFnbGlobalOrderNote({ tableNumber: '4', kitchenNotes: 'Less ice' }))
      .toBe('Less ice');
  });

  it('keeps either global field usable without adding empty separators', () => {
    expect(buildFnbGlobalOrderNote({ tableNumber: 'T-04' })).toBe('');
    expect(buildFnbGlobalOrderNote({ kitchenNotes: 'No onions' })).toBe('No onions');
    expect(buildFnbGlobalOrderNote()).toBe('');
  });

  it('keeps the manually entered table in the print context instead of the note', () => {
    expect(buildFnbPrintContext({ tableNumber: '4', orderMethod: 'dine_in' }))
      .toEqual({ table_label: '4', fnb_table_label_snapshot: '4' });
  });
});
