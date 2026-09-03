/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StorefrontReviewModal } from './StorefrontReviewModal.jsx';

const baseProps = {
  isMobileViewport: true,
  eyebrowColor: '#1A4E8D',
  titleFontFamily: 'Inter, sans-serif',
  starColor: '#f59e0b',
  starBg: '#fff7ed',
  starShadow: '0 10px 20px rgba(245,158,11,0.16)',
  submitButtonAccentColor: '#1A4E8D',
  submitButtonAccentDarkColor: '#1A4586',
  submitButtonShadowColor: 'rgba(26,78,141,0.32)',
  messagePlaceholder: 'Tell us about your experience.',
  reviewDraft: { name: '', anonymous: false, rating: 0, message: '' },
  onReviewDraftChange: vi.fn(),
  onClose: vi.fn(),
  onSubmit: vi.fn()
};

describe('StorefrontReviewModal', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('provides a keyboard-safe internal scroll region for the mobile review field', () => {
    render(<StorefrontReviewModal {...baseProps} />);

    const modal = screen.getByRole('dialog');
    const form = modal.querySelector('[data-review-modal-form="true"]');
    const nameInput = screen.getByPlaceholderText('How should we identify your review?');
    const textarea = screen.getByPlaceholderText('Tell us about your experience.');

    expect(form?.style.overflowY).toBe('auto');
    expect(form?.style.minHeight).toBe('');
    expect(textarea.style.scrollMarginBlock).toBe('16px');

    fireEvent.pointerDown(nameInput, { button: 0 });
    expect(document.activeElement).toBe(nameInput);

    fireEvent.pointerDown(textarea, { button: 0 });
    expect(document.activeElement).toBe(textarea);
  });
});
