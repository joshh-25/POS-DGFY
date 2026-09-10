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

        const control = screen.getByRole('button', { name: 'POS text size: Large (115%)' });
        expect(control.getAttribute('aria-expanded')).toBe('false');
        fireEvent.click(control);
        expect(screen.getByRole('option', { name: 'Normal (100%)' })).toBeTruthy();
        expect(screen.getByRole('option', { name: 'Large (115%)' })).toBeTruthy();
        expect(screen.getByRole('option', { name: 'Extra large (130%)' })).toBeTruthy();
        expect(control.getAttribute('title')).toBe('Text size: Large (115%)');
    });

    it('reports only the selected preference value', () => {
        const onChange = vi.fn();
        render(<PosTextSizeControl onChange={onChange} />);

        fireEvent.click(screen.getByRole('button', { name: 'POS text size: Normal (100%)' }));
        fireEvent.click(screen.getByRole('option', { name: 'Extra large (130%)' }));

        expect(onChange).toHaveBeenCalledWith('extra-large');
    });

    it('normalizes an invalid controlled value to normal', () => {
        render(<PosTextSizeControl value="invalid" onChange={vi.fn()} />);

        expect(screen.getByRole('button', { name: 'POS text size: Normal (100%)' })).toBeTruthy();
    });
});
