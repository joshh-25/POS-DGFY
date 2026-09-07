/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StorefrontOrderInstructions } from './StorefrontOrderInstructions.jsx';

afterEach(cleanup);

describe('StorefrontOrderInstructions', () => {
  it('does not render an empty optional value', () => {
    const { container } = render(<StorefrontOrderInstructions value="   " />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a populated value as customer-entered text', () => {
    render(<StorefrontOrderInstructions value={'No ice\nLeave at reception.'} />);
    expect(screen.getByTestId('order-special-instructions')).toBeTruthy();
    expect(screen.getByText(/No ice/)).toBeTruthy();
    expect(screen.getByText(/Leave at reception/)).toBeTruthy();
  });
});
