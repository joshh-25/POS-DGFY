/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StorefrontCategoriesSettings from '../settings/StorefrontCategoriesSettings.jsx';

afterEach(cleanup);

describe('Storefront categories settings', () => {
  it('renders compact desktop columns without reorder controls', () => {
    render(<StorefrontCategoriesSettings categories={['BBQ', 'Seafood', 'Beverages', 'Snacks', 'Meals', 'Desserts']} />);

    expect(screen.getByRole('heading', { name: 'Store Categories', exact: true })).toBeTruthy();
    expect(screen.getByText('Organize the categories customers can browse on your storefront.')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Store categories 1 to 3', exact: true })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Store categories 4 to 6', exact: true })).toBeTruthy();
    expect(screen.getByRole('listitem', { name: '1. BBQ', exact: true })).toBeTruthy();
    expect(screen.getByRole('listitem', { name: '6. Desserts', exact: true })).toBeTruthy();
    const categoryName = screen.getByRole('button', { name: 'Edit category BBQ', exact: true });
    expect(categoryName.className).toContain('text-[13px]');
    expect(categoryName.className).toContain('font-bold');
    const removeButton = screen.getByRole('button', { name: 'Remove category BBQ', exact: true });
    expect(removeButton.className).toContain('bg-rose-50');
    expect(removeButton.className).toContain('border-rose-200');
    expect(removeButton.className).toContain('h-8');
    expect(screen.queryByRole('complementary', { name: 'Category reordering guidance', exact: true })).toBeNull();
    expect(screen.queryByText(/Drag and drop to reorder/i)).toBeNull();
    expect(screen.getByRole('listitem', { name: '1. BBQ', exact: true }).hasAttribute('draggable')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'More information about Store Categories', exact: true }));
    const guidance = screen.getByRole('tooltip');
    expect(guidance.textContent).toContain('Category order');
    expect(guidance.textContent).toContain('Categories display in the order shown.');
    expect(guidance.textContent).not.toContain('Drag and drop');
  });

  it('shows section information while hovered and hides it after hover leaves', () => {
    render(<StorefrontCategoriesSettings categories={['BBQ']} />);

    const infoButton = screen.getByRole('button', { name: 'More information about Store Categories', exact: true });
    const infoContainer = infoButton.parentElement;
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.mouseEnter(infoContainer);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    expect(infoButton.getAttribute('aria-expanded')).toBe('true');

    fireEvent.mouseLeave(infoContainer);
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(infoButton.getAttribute('aria-expanded')).toBe('false');
  });

  it('supports adding and editing a category through compact dialogs', async () => {
    const onChange = vi.fn();
    render(<StorefrontCategoriesSettings categories={['BBQ']} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add category', exact: true }));
    const addDialog = screen.getByRole('dialog');
    expect(addDialog.getAttribute('aria-labelledby')).toBe('storefront-category-dialog-title');
    expect(addDialog.getAttribute('aria-describedby')).toBe('storefront-category-dialog-description');
    expect(within(addDialog).getByRole('heading', { name: 'Add Category', exact: true })).toBeTruthy();
    expect(within(addDialog).getByRole('button', { name: 'Add Category', exact: true }).disabled).toBe(true);
    fireEvent.change(within(addDialog).getByLabelText('Category Name'), { target: { value: 'Seafood' } });
    fireEvent.click(within(addDialog).getByRole('button', { name: 'Add Category', exact: true }));
    expect(onChange).toHaveBeenCalledWith(['BBQ', 'Seafood']);

    onChange.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Edit category BBQ', exact: true }));
    const editRow = screen.getByRole('listitem', { name: '1. BBQ', exact: true });
    const editInput = within(editRow).getByRole('textbox', { name: 'Edit category BBQ', exact: true });
    fireEvent.change(editInput, { target: { value: 'Grilled BBQ' } });
    fireEvent.click(within(editRow).getByRole('button', { name: 'Save', exact: true }));
    expect(onChange).toHaveBeenCalledWith(['Grilled BBQ']);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('requires confirmation before removing a category', () => {
    const onChange = vi.fn();
    render(<StorefrontCategoriesSettings categories={['BBQ', 'Seafood']} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove category Seafood', exact: true }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Remove Category', exact: true })).toBeTruthy();
    expect(within(dialog).getByText('Are you sure you want to remove “Seafood”? This action cannot be undone.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove', exact: true }));
    expect(onChange).toHaveBeenCalledWith(['BBQ']);
  });

  it('does not reorder categories through pointer or keyboard movement', () => {
    const onChange = vi.fn();
    render(<StorefrontCategoriesSettings categories={['BBQ', 'Seafood', 'Beverages']} onChange={onChange} />);
    const firstRow = screen.getByRole('listitem', { name: '1. BBQ', exact: true });
    const secondRow = screen.getByRole('listitem', { name: '2. Seafood', exact: true });
    const dataTransfer = { effectAllowed: '', setData: vi.fn() };

    fireEvent.dragStart(firstRow, { dataTransfer });
    fireEvent.dragOver(secondRow, { dataTransfer });
    fireEvent.drop(secondRow, { dataTransfer });
    fireEvent.keyDown(firstRow, { key: 'ArrowDown', altKey: true });
    expect(firstRow.hasAttribute('draggable')).toBe(false);
    expect(secondRow.hasAttribute('draggable')).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders the empty state and limits the collection to ten categories', () => {
    const onChange = vi.fn();
    const { rerender } = render(<StorefrontCategoriesSettings categories={['']} onChange={onChange} />);
    expect(screen.getByRole('heading', { name: 'No categories yet', exact: true })).toBeTruthy();
    expect(screen.getByText('Add categories to help customers browse your products.')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Add category', exact: true })).toHaveLength(1);

    const maxCategories = Array.from({ length: 10 }, (_, index) => `Category ${index + 1}`);
    rerender(<StorefrontCategoriesSettings categories={maxCategories} onChange={onChange} />);
    expect(screen.getByText('Maximum of 10 categories reached.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add category (maximum of 10 reached)', exact: true }).disabled).toBe(true);
  });
});
