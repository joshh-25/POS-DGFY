/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosDropdownSelect from '../components/PosDropdownSelect.jsx';

afterEach(() => {
    cleanup();
});

const OPTIONS = [
    { value: 'first', label: 'First location' },
    { value: 'occupied', label: 'Occupied terminal', disabled: true },
    { value: 'last', label: 'Last location' }
];

describe('POS dropdown select', () => {
    it('uses the shared listbox design and exposes the selected option', () => {
        render(
            <PosDropdownSelect
                id="shift-location"
                ariaLabel="Shift location"
                listboxLabel="Shift location options"
                value="first"
                options={OPTIONS}
                onChange={vi.fn()}
            />
        );

        const trigger = screen.getByRole('combobox', { name: 'Shift location' });
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(trigger.textContent).toContain('First location');

        fireEvent.click(trigger);

        expect(screen.getByRole('listbox', { name: 'Shift location options' })).toBeTruthy();
        expect(screen.getByRole('option', { name: 'First location' }).getAttribute('aria-selected')).toBe('true');
        expect(screen.getByRole('option', { name: 'Occupied terminal' }).getAttribute('aria-disabled')).toBe('true');
        expect(screen.getByRole('option', { name: 'First location' }).className).toContain('pos-dropdown-select__option');
    });

    it('selects by pointer and restores focus to the trigger', () => {
        const onChange = vi.fn();
        render(
            <PosDropdownSelect
                id="shift-location"
                ariaLabel="Shift location"
                value="first"
                options={OPTIONS}
                onChange={onChange}
            />
        );

        const trigger = screen.getByRole('combobox', { name: 'Shift location' });
        fireEvent.click(trigger);
        fireEvent.click(screen.getByRole('option', { name: 'Last location' }));

        expect(onChange).toHaveBeenCalledWith('last');
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(trigger);
    });

    it('closes without emitting a change when the selected option is reselected', () => {
        const onChange = vi.fn();
        render(
            <PosDropdownSelect
                id="shift-location"
                ariaLabel="Shift location"
                value="first"
                options={OPTIONS}
                onChange={onChange}
            />
        );

        fireEvent.click(screen.getByRole('combobox', { name: 'Shift location' }));
        fireEvent.click(screen.getByRole('option', { name: 'First location' }));

        expect(onChange).not.toHaveBeenCalled();
        expect(screen.getByRole('combobox', { name: 'Shift location' }).getAttribute('aria-expanded')).toBe('false');
    });

    it('supports arrow, Home/End, Enter, and Escape while skipping disabled options', () => {
        const onChange = vi.fn();
        render(
            <PosDropdownSelect
                id="shift-location"
                ariaLabel="Shift location"
                value="first"
                options={OPTIONS}
                onChange={onChange}
            />
        );

        const trigger = screen.getByRole('combobox', { name: 'Shift location' });
        fireEvent.keyDown(trigger, { key: 'ArrowDown' });
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
        expect(trigger.getAttribute('aria-activedescendant')).toBe('shift-location-option-2');

        fireEvent.keyDown(trigger, { key: 'Home' });
        expect(trigger.getAttribute('aria-activedescendant')).toBe('shift-location-option-0');
        fireEvent.keyDown(trigger, { key: 'End' });
        expect(trigger.getAttribute('aria-activedescendant')).toBe('shift-location-option-2');
        fireEvent.keyDown(trigger, { key: 'Enter' });

        expect(onChange).toHaveBeenCalledWith('last');
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(trigger);

        fireEvent.keyDown(trigger, { key: 'ArrowDown' });
        fireEvent.keyDown(trigger, { key: 'Escape' });
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
    });

    it('closes when clicking outside and prevents opening while disabled', () => {
        const { rerender } = render(
            <PosDropdownSelect id="shift-location" ariaLabel="Shift location" options={OPTIONS} />
        );
        const trigger = screen.getByRole('combobox', { name: 'Shift location' });

        fireEvent.click(trigger);
        fireEvent.pointerDown(document.body);
        expect(trigger.getAttribute('aria-expanded')).toBe('false');

        rerender(
            <PosDropdownSelect id="shift-location" ariaLabel="Shift location" options={OPTIONS} disabled />
        );
        fireEvent.click(trigger);
        expect(trigger.disabled).toBe(true);
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
    });
});
