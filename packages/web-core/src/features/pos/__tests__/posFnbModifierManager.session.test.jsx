// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosFnbModifierManager from '../components/PosFnbModifierManager.jsx';

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
});

const groups = [
  {
    modifier_group_id: 11,
    name: 'size',
    display_name: 'Size',
    options: [{ modifier_option_id: 21, name: 'Large', price_delta: 40 }]
  },
  {
    modifier_group_id: 12,
    name: 'sauce',
    display_name: 'Sauce',
    options: [{ modifier_option_id: 22, name: 'Garlic', price_delta: 10 }]
  }
];

const paginatedGroups = Array.from({ length: 12 }, (_, index) => ({
  modifier_group_id: index + 1,
  name: `group-${index + 1}`,
  display_name: `Group ${index + 1}`,
  options: [{ modifier_option_id: index + 101, name: `Option ${index + 1}`, price_delta: 0 }]
}));

describe('POS F&B modifier manager edit sessions', () => {
  it('uses the shared POS pagination controls for option groups', () => {
    render(<PosFnbModifierManager groups={paginatedGroups} items={[]} locations={[]} />);

    expect(screen.getByRole('navigation', { name: 'Option group pagination' })).toBeTruthy();
    expect(screen.getByText('Showing 1–10 of 12 option groups')).toBeTruthy();
    expect(screen.getByText('1 of 2')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Go to option groups page' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next option groups page' }));
    expect(screen.getByText('Showing 11–12 of 12 option groups')).toBeTruthy();
    expect(screen.getByText('2 of 2')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Option groups per page' }));
    fireEvent.click(screen.getByRole('option', { name: '20 / page' }));
    expect(screen.getByText('Showing 1–12 of 12 option groups')).toBeTruthy();
    expect(screen.getByText('1 of 1')).toBeTruthy();
  });

  it('hydrates the selected group in the click action and starts a blank new-group session', () => {
    render(<PosFnbModifierManager groups={groups} items={[]} locations={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit option group Size' }));
    expect(screen.getByLabelText('Group name').value).toBe('size');
    expect(screen.getByRole('heading', { name: 'Choices' })).toBeTruthy();
    expect(screen.getByLabelText('Choice 1 name').value).toBe('Large');

    fireEvent.click(screen.getByRole('button', { name: 'Close option group form' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create option group' }));
    expect(screen.getByLabelText('Group name').value).toBe('');
    expect(screen.getByLabelText('Choice 1 name').value).toBe('');
  });

  it('keeps selection-rule controls aligned and gives selection mode the wider column', () => {
    render(<PosFnbModifierManager groups={groups} items={[]} locations={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create option group' }));
    const selectionMode = screen.getByRole('combobox', { name: 'Selection mode' });
    const minimum = screen.getByLabelText('Minimum selections');
    const maximum = screen.getByLabelText('Maximum selections');
    const choiceName = screen.getByLabelText('Choice 1 name');
    const choicePrice = screen.getByLabelText('Choice 1 price adjustment');
    const selectionRulesGrid = selectionMode.closest('.grid');

    expect(selectionMode.className).toContain('h-9');
    expect(minimum.className).toContain('h-9');
    expect(maximum.className).toContain('h-9');
    expect(minimum.className).not.toContain('h-11');
    expect(maximum.className).not.toContain('h-11');
    expect(choiceName.className).toContain('h-9');
    expect(choicePrice.className).toContain('h-9');
    expect(choiceName.className).not.toContain('h-11');
    expect(choicePrice.className).not.toContain('h-11');
    expect(selectionRulesGrid.className).toContain('grid-cols-1');
    expect(selectionRulesGrid.className).toContain('sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]');
  });

  it('keeps the group draft intact when the desktop form is hidden and shown', () => {
    render(<PosFnbModifierManager groups={groups} items={[]} locations={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create option group' }));
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Meal size' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hide form' }));

    expect(screen.queryByRole('heading', { name: 'Create Option Group' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show form' }));
    expect(screen.getByLabelText('Group name').value).toBe('Meal size');
  });

  it('uses a staged POS-style filter popover and applies selected filters only after Done', () => {
    render(<PosFnbModifierManager groups={groups} items={[]} locations={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const filterRegion = screen.getByRole('region', { name: 'Filter option groups' });
    expect(filterRegion).toBeTruthy();
    fireEvent.click(within(filterRegion).getByRole('button', { name: 'Inactive' }));
    expect(screen.getByText('Size')).toBeTruthy();
    fireEvent.click(within(filterRegion).getByRole('button', { name: 'Done' }));

    expect(screen.queryByText('Size')).toBeNull();
    expect(screen.getByText('No matching option groups')).toBeTruthy();
  });

  it('lets all choices flow through the main editor scroll region', () => {
    render(<PosFnbModifierManager groups={groups} items={[]} locations={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create option group' }));
    const editorScroll = screen.getByTestId('fnb-option-group-editor-scroll');
    const optionsList = screen.getByTestId('fnb-modifier-options-list');
    const editor = screen.getByRole('heading', { name: 'Create Option Group' }).closest('aside');
    const editorColumn = editor.parentElement;
    const manager = document.querySelector('.pos-items-options-manager');

    expect(manager.className).toContain('min-[1200px]:grid-rows-[minmax(0,1fr)]');
    expect(editorColumn.className).toContain('min-h-0');
    expect(editor.className).toContain('overflow-hidden');
    expect(editor.className).not.toContain('overflow-visible');
    expect(editor.className).not.toContain('min-h-[34rem]');
    expect(editorScroll.className).toContain('overflow-y-auto');
    expect(editorScroll.className).toContain('pos-fnb-option-group-editor-body');
    expect(screen.getByRole('button', { name: 'Cancel' }).parentElement.className).toContain('pos-fnb-option-group-editor-footer');
    expect(editorScroll.contains(optionsList)).toBe(true);
    expect(optionsList.className).toContain('pos-fnb-modifier-choice-list');
    expect(optionsList.className).not.toContain('pos-items-options-list');
    expect(optionsList.className).not.toContain('dgfy-pos-scroll-region');
    expect(optionsList.className).not.toContain('max-h-');
    expect(optionsList.className).not.toContain('overflow-y-');
  });

  it('keeps the mobile option-group drawer bounded with a dedicated scroll body', () => {
    window.matchMedia = vi.fn((query) => ({
      matches: query === '(max-width: 767px)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }));
    render(<PosFnbModifierManager groups={groups} items={[]} locations={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create option group' }));
    const editor = screen.getByRole('dialog');
    const drawer = editor.parentElement;
    const form = screen.getByLabelText('Group name').closest('form');
    const editorScroll = screen.getByTestId('fnb-option-group-editor-scroll');
    const optionsList = screen.getByTestId('fnb-modifier-options-list');

    expect(editor.className).toContain('h-full');
    expect(drawer.style.height).toBe(`${Math.max(180, window.innerHeight - 8)}px`);
    expect(form.className).toContain('flex-1');
    expect(form.className).toContain('overflow-hidden');
    expect(editorScroll.className).toContain('min-h-0');
    expect(editorScroll.className).toContain('flex-1');
    expect(editorScroll.className).toContain('overflow-y-auto');
    expect(editorScroll.contains(optionsList)).toBe(true);
    expect(optionsList.className).not.toContain('pos-items-options-list');
    expect(optionsList.className).not.toContain('overflow-y-');
    expect(editorScroll.getAttribute('role')).toBe('region');
    expect(editorScroll.getAttribute('aria-label')).toBe('Option group editor fields');
    expect(editorScroll.tabIndex).toBe(0);
    expect(screen.getByRole('button', { name: 'Cancel' }).parentElement.className).toContain('pos-fnb-option-group-editor-footer');
  });

  it('keeps the option-group header pencil centered in its icon tile', () => {
    render(<PosFnbModifierManager groups={groups} items={[]} locations={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create option group' }));
    const title = screen.getByRole('heading', { name: 'Create Option Group' });
    const iconContainer = title.parentElement.previousElementSibling;

    expect(iconContainer.className).toContain('place-items-center');
    expect(iconContainer.className).toContain('min-[1200px]:grid');
    expect(iconContainer.className).not.toContain('min-[1200px]:flex');
  });

  it('saves add-on groups as optional when Required is turned off', async () => {
    const onCreate = vi.fn().mockResolvedValue();
    render(<PosFnbModifierManager groups={[]} locations={[]} onCreate={onCreate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create option group' }));
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Extras' } });
    fireEvent.change(screen.getByLabelText('Choice 1 name'), { target: { value: 'Cheese' } });
    const required = screen.getByRole('checkbox', { name: 'Required' });

    expect(required.checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Save Group' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0][0]).toEqual(expect.objectContaining({
      min_select: 0,
      max_select: 1,
      required: false
    }));
  });

  it('deactivates a group through the existing update callback instead of deleting it', async () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    render(<PosFnbModifierManager groups={groups} locations={[]} onUpdate={onUpdate} />);

    const deactivateButton = screen.getByRole('button', { name: 'Deactivate option group Size' });
    expect(deactivateButton.querySelector('svg')?.classList.contains('lucide-power-off')).toBe(true);
    fireEvent.click(deactivateButton);
    expect(screen.getByRole('heading', { name: 'Deactivate Option Group' })).toBeTruthy();
    expect(screen.getByText(/Existing assignments will be preserved/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate Option Group' }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(11, expect.objectContaining({ is_active: false })));
  });
});
