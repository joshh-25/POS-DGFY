/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosTextSizeControl from '../components/PosTextSizeControl.jsx';

afterEach(() => {
    cleanup();
});

describe('POS text-size control', () => {
    it('provides an accessible native selector for all supported levels', () => {
        render(<PosTextSizeControl value="large" onChange={vi.fn()} />);

        const control = screen.getByRole('combobox', { name: 'POS text size' });
        expect(control.value).toBe('large');
        expect(screen.getByRole('option', { name: 'Normal (100%)' })).toBeTruthy();
        expect(screen.getByRole('option', { name: 'Large (115%)' })).toBeTruthy();
        expect(screen.getByRole('option', { name: 'Extra large (130%)' })).toBeTruthy();
        expect(control.getAttribute('title')).toBe('Adjust POS text size');
    });

    it('reports only the selected preference value', () => {
        const onChange = vi.fn();
        render(<PosTextSizeControl onChange={onChange} />);

        fireEvent.change(screen.getByRole('combobox', { name: 'POS text size' }), {
            target: { value: 'extra-large' }
        });

        expect(onChange).toHaveBeenCalledWith('extra-large');
    });

    it('normalizes an invalid controlled value to normal', () => {
        render(<PosTextSizeControl value="invalid" onChange={vi.fn()} />);

        expect(screen.getByRole('combobox', { name: 'POS text size' }).value).toBe('normal');
    });
});
