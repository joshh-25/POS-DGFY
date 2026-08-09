/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { REGISTRATION_INDUSTRIES_DESCRIBED } from '@sieitzz/shared-constants/registrationIndustries';

const fetchRegistrationIndustriesMock = vi.hoisted(() => vi.fn());

vi.mock('../registrationIndustryService.js', () => ({
  fetchRegistrationIndustries: fetchRegistrationIndustriesMock
}));

import IndustryPicker from '../IndustryPicker.jsx';

describe('IndustryPicker', () => {
  beforeEach(() => {
    fetchRegistrationIndustriesMock.mockReset();
    fetchRegistrationIndustriesMock.mockResolvedValue(REGISTRATION_INDUSTRIES_DESCRIBED);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders all 11 catalog industries with niche helper text', async () => {
    render(<IndustryPicker value="" onSelect={() => {}} />);

    expect(await screen.findByText('Micro Food & Beverage')).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(REGISTRATION_INDUSTRIES_DESCRIBED.length);
    REGISTRATION_INDUSTRIES_DESCRIBED.forEach((entry) => {
      expect(screen.getByText(entry.label)).toBeTruthy();
    });
    // Niche helper text is the first up-to-4 niches, joined and truncated.
    expect(screen.getByText(/Carinderia, Small eatery, Turo-turo, Food cart/)).toBeTruthy();
  });

  it('reports the full described entry — including derived workflow_mode/template_key — when an industry is selected', async () => {
    const onSelect = vi.fn();
    render(<IndustryPicker value="" onSelect={onSelect} />);

    fireEvent.click(await screen.findByRole('radio', { name: /Micro Food & Beverage/i }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      key: 'micro_fnb',
      workflow_mode: 'fnb',
      template_key: 'fnb_counter_service'
    }));
  });

  it('shows the partner-app note only for non-native (transitional/external) industries', async () => {
    render(<IndustryPicker value="" onSelect={() => {}} />);

    await screen.findByText('Micro Food & Beverage');

    // Retail is native: no engine badge, no partner-app explanation.
    const retailCard = screen.getByRole('radio', { name: /^Retail/i }).closest('div');
    expect(retailCard.textContent).not.toMatch(/partner app/i);
    expect(screen.queryByText('Native today', { selector: `#${retailCard.querySelector('button')?.id} ~ *` })).toBeNull();

    // Healthcare is external: shows "Listing only" and the partner-app note.
    const healthcareCard = screen.getByRole('radio', { name: /^Healthcare/i }).closest('div');
    expect(healthcareCard.textContent).toMatch(/listing only/i);
    expect(healthcareCard.textContent).toMatch(/partner app/i);
  });

  it('shows a "native today" note for transitional industries (e.g. Food Manufacturing)', async () => {
    render(<IndustryPicker value="" onSelect={() => {}} />);

    const card = (await screen.findByRole('radio', { name: /^Food Manufacturing/i })).closest('div');
    expect(card.textContent).toMatch(/native today/i);
    expect(card.textContent).toMatch(/runs this fully today/i);
  });

  it('expands "What you\'ll get" to list the template\'s shipped modules', async () => {
    render(<IndustryPicker value="" onSelect={() => {}} />);

    await screen.findByText('Retail');
    const retailCard = screen.getByRole('radio', { name: /^Retail/i }).closest('div');
    const toggle = Array.from(retailCard.querySelectorAll('button')).find((btn) => /what you.?ll get/i.test(btn.textContent));
    expect(toggle).toBeTruthy();
    expect(retailCard.querySelector('ul')).toBeNull();

    fireEvent.click(toggle);

    expect(retailCard.querySelector('ul')).toBeTruthy();
    expect(retailCard.querySelectorAll('ul li').length).toBeGreaterThan(0);
    expect(toggle.textContent).toMatch(/hide what you.?ll get/i);
  });

  it('marks the currently selected industry as checked', async () => {
    render(<IndustryPicker value="micro_fnb" onSelect={() => {}} />);

    const selected = await screen.findByRole('radio', { name: /Micro Food & Beverage/i });
    expect(selected.getAttribute('aria-checked')).toBe('true');

    const notSelected = screen.getByRole('radio', { name: /^Retail/i });
    expect(notSelected.getAttribute('aria-checked')).toBe('false');
  });
});
