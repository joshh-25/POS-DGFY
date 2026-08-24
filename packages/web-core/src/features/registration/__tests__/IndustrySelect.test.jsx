/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { REGISTRATION_INDUSTRIES_DESCRIBED } from '@sieitzz/shared-constants/registrationIndustries';

const fetchRegistrationIndustriesMock = vi.hoisted(() => vi.fn());

vi.mock('../registrationIndustryService.js', () => ({
  fetchRegistrationIndustries: fetchRegistrationIndustriesMock
}));

import IndustrySelect from '../IndustrySelect.jsx';

describe('IndustrySelect', () => {
  beforeEach(() => {
    fetchRegistrationIndustriesMock.mockReset();
    fetchRegistrationIndustriesMock.mockResolvedValue(REGISTRATION_INDUSTRIES_DESCRIBED);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders a placeholder option plus all 11 industry names as plain options', async () => {
    render(<IndustrySelect value="" onSelect={() => {}} />);

    await screen.findByText('What kind of business is this?');
    const select = screen.getByRole('combobox');
    const options = within(select).getAllByRole('option');
    expect(options).toHaveLength(REGISTRATION_INDUSTRIES_DESCRIBED.length + 1);
    expect(options[0].textContent).toMatch(/select your business type/i);
    REGISTRATION_INDUSTRIES_DESCRIBED.forEach((entry) => {
      expect(within(select).getByText(entry.label)).toBeTruthy();
    });
  });

  it('reports the full described entry — including derived workflow_mode/template_key — on selection', async () => {
    const onSelect = vi.fn();
    render(<IndustrySelect value="" onSelect={onSelect} />);

    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'micro_fnb' } });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      key: 'micro_fnb',
      workflow_mode: 'fnb',
      template_key: 'fnb_counter_service'
    }));
  });

  it('shows a summary panel with niches once an industry is selected', async () => {
    render(<IndustrySelect value="micro_fnb" onSelect={() => {}} />);

    expect(await screen.findByText(/Carinderia, Small eatery, Turo-turo, Food cart/)).toBeTruthy();
    expect(screen.getAllByText('Micro Food & Beverage').length).toBeGreaterThanOrEqual(2);
  });

  it('opens a "What you\'ll get" dialog for the selected industry\'s modules, closable via Escape', async () => {
    render(<IndustrySelect value="retail" onSelect={() => {}} />);

    const toggle = await screen.findByRole('button', { name: /what you.?ll get/i });
    fireEvent.click(toggle);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(within(dialog).getAllByRole('listitem').length).toBeGreaterThan(0);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens a catalog dialog listing every visible industry via the (i) button', async () => {
    render(<IndustrySelect value="" onSelect={() => {}} />);

    const infoButton = await screen.findByRole('button', { name: /about business types/i });
    fireEvent.click(infoButton);

    const dialog = screen.getByRole('dialog');
    REGISTRATION_INDUSTRIES_DESCRIBED.forEach((entry) => {
      expect(within(dialog).getByText(entry.label)).toBeTruthy();
    });
  });

  it('never renders engine classification (native/transitional/external) anywhere, even with both modals open', async () => {
    render(<IndustrySelect value="healthcare" onSelect={() => {}} />);

    await screen.findByRole('combobox');
    fireEvent.click(screen.getByRole('button', { name: /about business types/i }));

    expect(screen.queryByText(/native today/i)).toBeNull();
    expect(screen.queryByText(/listing only/i)).toBeNull();
    expect(screen.queryByText(/partner app/i)).toBeNull();
  });

  it('filters out industries flagged hidden from both the dropdown and the catalog modal', async () => {
    fetchRegistrationIndustriesMock.mockResolvedValue(
      REGISTRATION_INDUSTRIES_DESCRIBED.map((entry) => (
        entry.key === 'food_manufacturing' ? { ...entry, hidden: true } : entry
      ))
    );
    render(<IndustrySelect value="" onSelect={() => {}} />);

    const select = await screen.findByRole('combobox');
    expect(within(select).queryByText('Food Manufacturing')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /about business types/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText('Food Manufacturing')).toBeNull();
  });

  it('shows every industry when the catalog falls back to the raw local constant (no hidden field)', async () => {
    // REGISTRATION_INDUSTRIES_DESCRIBED itself carries no `hidden` field —
    // this is exactly the shape fetchRegistrationIndustries() falls back to
    // on a network failure, and it must fail open (show everything).
    render(<IndustrySelect value="" onSelect={() => {}} />);

    const select = await screen.findByRole('combobox');
    expect(within(select).getByText('Food Manufacturing')).toBeTruthy();
  });

  // issue #316: an admin-created industry can point at a template that
  // isn't one of the code-owned STORE_TEMPLATE_PRESETS at all - the API
  // carries that template's live module list as `template_modules` so
  // "What you'll get" still renders. Proven a genuine regression: with
  // resolveWhatYoullGet's templateModules parameter removed (reverting to
  // the pre-#316 signature), this admin-created entry's template_key
  // ("admin_custom_template") resolves to nothing in STORE_TEMPLATE_PRESETS
  // and the button never renders - confirmed failing, then restored.
  it('renders "What you\'ll get" for an admin-created industry via its live template_modules, not STORE_TEMPLATE_PRESETS', async () => {
    fetchRegistrationIndustriesMock.mockResolvedValue([
      ...REGISTRATION_INDUSTRIES_DESCRIBED,
      {
        key: 'pet_grooming',
        label: 'Pet Grooming',
        summary: 'Grooming and boarding services for pets.',
        niches: ['Pet salon', 'Mobile grooming'],
        workflow_mode: 'services',
        template_key: 'admin_custom_template',
        template_modules: ['catalog', 'pos'],
        engine: 'native',
        engine_note: null,
        hidden: false
      }
    ]);
    render(<IndustrySelect value="pet_grooming" onSelect={() => {}} />);

    const toggle = await screen.findByRole('button', { name: /what you.?ll get/i });
    fireEvent.click(toggle);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('listitem').length).toBe(2);
  });
});
