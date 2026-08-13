/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ServiceImage } from './ServiceImage.jsx';

describe('ServiceImage', () => {
  afterEach(cleanup);

  it('renders a consistent fallback when no service image exists', () => {
    render(<ServiceImage imageSources={{ src: '' }} alt="Wash and Fold" />);

    expect(screen.getByRole('img', { name: 'No service image' })).toBeTruthy();
    expect(screen.getByText('No service image')).toBeTruthy();
  });

  it('switches to the same fallback after an image fails', () => {
    render(<ServiceImage imageSources={{ src: '/service.png' }} alt="Wash and Fold" />);

    const image = screen.getByRole('img', { name: 'Wash and Fold' });
    fireEvent.error(image);

    expect(screen.getByRole('img', { name: 'No service image' })).toBeTruthy();
  });
});
