/* @vitest-environment jsdom */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { StorefrontAboutDescription } from './StorefrontAboutDescription.jsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mockHeight(height) {
  const originalGetComputedStyle = window.getComputedStyle;
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElement) => {
    const style = originalGetComputedStyle.call(window, element, pseudoElement);
    Object.defineProperty(style, 'lineHeight', { configurable: true, value: '22px' });
    return style;
  });
  return vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(height);
}

it('expands without losing text, exposes its state, and does not submit an enclosing form', () => {
  mockHeight(110);
  const submit = vi.fn();
  const text = 'A complete business description that must remain available.';
  render(<form onSubmit={submit}><StorefrontAboutDescription text={text} accentColor="#176B3A" /></form>);
  const button = screen.getByRole('button', { name: 'See More' });
  expect(button.getAttribute('aria-expanded')).toBe('false');
  expect(document.getElementById(button.getAttribute('aria-controls')).textContent).toBe(text);
  fireEvent.click(button);
  expect(screen.getByRole('button', { name: 'See Less' }).getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(button);
  expect(button.getAttribute('aria-expanded')).toBe('false');
  expect(submit).not.toHaveBeenCalled();
});

it('only offers expansion when rendered text exceeds two lines, including after resizing', () => {
  const height = mockHeight(44);
  render(<StorefrontAboutDescription text="Short text" accentColor="#1A4E8D" />);
  expect(screen.queryByRole('button')).toBeNull();
  height.mockReturnValue(88);
  act(() => window.dispatchEvent(new Event('resize')));
  expect(screen.getByRole('button', { name: 'See More' })).toBeTruthy();
  height.mockReturnValue(44);
  act(() => window.dispatchEvent(new Event('resize')));
  expect(screen.queryByRole('button')).toBeNull();
});

it('collapses a replacement description and uses the supplied theme token', () => {
  mockHeight(110);
  const { rerender, container } = render(<StorefrontAboutDescription text="First description" accentColor="#176B3A" />);
  fireEvent.click(screen.getByRole('button'));
  rerender(<StorefrontAboutDescription text="Another business" accentColor="#1A4E8D" />);
  expect(screen.getByRole('button', { name: 'See More' }).getAttribute('aria-expanded')).toBe('false');
  expect(container.firstChild.style.getPropertyValue('--about-accent')).toBe('#1A4E8D');
});

it('shows the full description without a toggle when the gallery is unavailable', () => {
  mockHeight(110);
  const text = 'A complete business description that should remain visible when there are no gallery images.';
  render(<StorefrontAboutDescription text={text} accentColor="#176B3A" collapsible={false} />);

  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.getByText(text).getAttribute('data-expanded')).toBe('true');
});
