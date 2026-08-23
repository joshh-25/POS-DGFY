// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ItemNoteDialog from '../components/ItemNoteDialog.jsx';

afterEach(() => cleanup());

describe('ItemNoteDialog', () => {
  it('edits only the selected item note and explains that global notes are separate', () => {
    const onSave = vi.fn();
    render(
      <ItemNoteDialog
        open
        line={{ item_name: 'Burger Meal', special_instructions: 'No onions' }}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    expect(screen.getByText(/applies only to this item, not the whole order/i)).toBeDefined();
    const input = screen.getByLabelText('Note for this item');
    fireEvent.change(input, { target: { value: 'Extra sauce' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));

    expect(onSave).toHaveBeenCalledWith('Extra sauce');
  });
});
