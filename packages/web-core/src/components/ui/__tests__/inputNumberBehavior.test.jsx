/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Input } from '@/components/ui/input';

afterEach(() => {
  cleanup();
});

describe('Input number behavior', () => {
  it('blocks native wheel and arrow-key increments while preserving manual decimals', () => {
    let keyEvent;
    let wheelEvent;

    render(
      <Input
        aria-label="Cash amount"
        type="number"
        defaultValue="0.14"
        onKeyDown={(event) => { keyEvent = event; }}
        onWheel={(event) => { wheelEvent = event; }}
      />
    );

    const input = screen.getByRole('spinbutton', { name: 'Cash amount' });
    input.focus();

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.wheel(input, { deltaY: -100 });

    expect(keyEvent.defaultPrevented).toBe(true);
    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(input.value).toBe('0.14');
    expect(input.className).toContain('dgfy-number-input');
  });

  it('does not block ordinary numeric typing', () => {
    let changeEvent;

    render(
      <Input
        aria-label="Cash amount"
        type="number"
        defaultValue=""
        onChange={(event) => { changeEvent = event; }}
      />
    );

    const input = screen.getByRole('spinbutton', { name: 'Cash amount' });
    fireEvent.change(input, { target: { value: '0.14' } });

    expect(changeEvent.target.value).toBe('0.14');
    expect(input.value).toBe('0.14');
  });
});
