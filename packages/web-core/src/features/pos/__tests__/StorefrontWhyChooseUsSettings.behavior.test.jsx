/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StorefrontWhyChooseUsSettings from '../settings/StorefrontWhyChooseUsSettings.jsx';

afterEach(cleanup);

function ControlledWhyChooseUs({ initialPhrases, onChange }) {
  const [phrases, setPhrases] = React.useState(initialPhrases);
  return <StorefrontWhyChooseUsSettings phrases={phrases} onChange={(next) => { setPhrases(next); onChange?.(next); }} />;
}

describe('Storefront Why Choose Us settings', () => {
  it('renders four phrases as one readable row per phrase', () => {
    render(<StorefrontWhyChooseUsSettings phrases={['Freshly grilled daily', 'Affordable prices', 'Fast & reliable service', 'Locally loved']} />);

    expect(screen.getByRole('heading', { name: 'Why Choose Us', exact: true })).toBeTruthy();
    expect(screen.getByText('Add short reasons customers should choose your store.')).toBeTruthy();
    const phraseList = screen.getByRole('list', { name: 'Why Choose Us phrases 1 to 4', exact: true });
    expect(phraseList).toBeTruthy();
    expect(within(phraseList).getAllByRole('listitem')).toHaveLength(4);
    expect(within(phraseList).getByRole('listitem', { name: '1. Freshly grilled daily', exact: true })).toBeTruthy();
    expect(within(phraseList).getByRole('listitem', { name: '4. Locally loved', exact: true })).toBeTruthy();
    const removeButton = screen.getByRole('button', { name: 'Remove phrase Freshly grilled daily', exact: true });
    expect(removeButton.className).toContain('bg-rose-50');
    expect(removeButton.className).toContain('border-rose-200');
    expect(removeButton.className).toContain('h-8');
    fireEvent.click(screen.getByRole('button', { name: 'More information about Why Choose Us', exact: true }));
    expect(screen.getByRole('tooltip').textContent).toContain('You have reached the maximum of 4 phrases.');
  });

  it('shows read-only phrases in modal mode and keeps editing inside the dialog', () => {
    render(<StorefrontWhyChooseUsSettings interactionMode="modal" phrases={['Freshly grilled daily']} />);

    const phrase = screen.getByText('Freshly grilled daily');
    expect(phrase).toBeTruthy();
    expect(phrase.className).toContain('text-[13px]');
    expect(phrase.className).toContain('font-bold');
    expect(screen.queryByRole('textbox', { name: 'Phrase 1', exact: true })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Edit phrase 1', exact: true }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('textbox', { name: 'Phrase', exact: true })).toBeTruthy();
  });

  it('supports inline editing, adding, and validation of a new phrase', () => {
    const onChange = vi.fn();
    render(<ControlledWhyChooseUs initialPhrases={['Freshly grilled daily']} onChange={onChange} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Phrase 1' }), { target: { value: 'Freshly grilled every morning' } });
    expect(onChange).toHaveBeenLastCalledWith(['Freshly grilled every morning']);

    fireEvent.click(screen.getByRole('button', { name: 'Add phrase', exact: true }));
    expect(screen.getByRole('textbox', { name: 'Phrase 2' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Phrase 2' }).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toContain('Phrase cannot be empty.');

    fireEvent.change(screen.getByRole('textbox', { name: 'Phrase 2' }), { target: { value: 'Affordable prices' } });
    expect(onChange).toHaveBeenLastCalledWith(['Freshly grilled every morning', 'Affordable prices']);
  });

  it('reindexes after delete and disables add at the four phrase maximum', () => {
    const onChange = vi.fn();
    render(<StorefrontWhyChooseUsSettings phrases={['One', 'Two', 'Three', 'Four']} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove phrase Two', exact: true }));
    expect(onChange).toHaveBeenLastCalledWith(['One', 'Three', 'Four']);
    fireEvent.click(screen.getByRole('button', { name: 'More information about Why Choose Us', exact: true }));
    expect(screen.getByText('You have reached the maximum of 4 phrases.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add phrase (maximum of 4 reached)', exact: true }).disabled).toBe(true);
  });

  it('supports drag and keyboard reordering', () => {
    const onChange = vi.fn();
    render(<ControlledWhyChooseUs initialPhrases={['One', 'Two', 'Three']} onChange={onChange} />);
    const firstRow = screen.getByRole('listitem', { name: '1. One', exact: true });
    const secondRow = screen.getByRole('listitem', { name: '2. Two', exact: true });
    const dataTransfer = { effectAllowed: '', setData: vi.fn() };

    fireEvent.dragStart(firstRow, { dataTransfer });
    fireEvent.dragOver(secondRow, { dataTransfer });
    fireEvent.drop(secondRow, { dataTransfer });
    expect(onChange).toHaveBeenLastCalledWith(['Two', 'One', 'Three']);

    fireEvent.keyDown(secondRow, { key: 'ArrowDown', altKey: true });
    expect(onChange).toHaveBeenLastCalledWith(['Two', 'Three', 'One']);
  });

  it('renders a compact empty state', () => {
    render(<StorefrontWhyChooseUsSettings phrases={['']} />);

    expect(screen.getByRole('heading', { name: 'No phrases added yet.', exact: true })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Add phrase', exact: true })).toHaveLength(1);
  });
});
