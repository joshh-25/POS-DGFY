/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StorefrontSocialLinksSettings from '../settings/StorefrontSocialLinksSettings.jsx';

afterEach(cleanup);

function ControlledSocialLinks({ initialLinks, onChange }) {
  const [links, setLinks] = React.useState(initialLinks);
  return <StorefrontSocialLinksSettings links={links} onChange={(next) => { setLinks(next); onChange?.(next); }} />;
}

describe('Storefront social links settings', () => {
  it('renders configured backend-supported links in a compact responsive list', () => {
    render(<StorefrontSocialLinksSettings links={{ facebook: 'https://facebook.com/yourpage', instagram: 'https://instagram.com/yourpage', messenger: 'https://m.me/yourpage' }} />);

    expect(screen.getByRole('heading', { name: 'Social Links', exact: true, level: 3 })).toBeTruthy();
    expect(screen.getByText('Connect your social channels to your storefront.')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Storefront social links', exact: true })).toBeTruthy();
    expect(screen.getByRole('listitem', { name: '1. facebook', exact: true })).toBeTruthy();
    expect(screen.getByRole('listitem', { name: '3. messenger', exact: true })).toBeTruthy();
    expect(screen.getByDisplayValue('https://instagram.com/yourpage')).toBeTruthy();
    const removeButton = screen.getByRole('button', { name: 'Remove social link 1', exact: true });
    expect(removeButton.className).toContain('bg-rose-50');
    expect(removeButton.className).toContain('border-rose-200');
    expect(removeButton.className).toContain('h-8');
  });

  it('adds a platform without asking for a manual platform name and validates its URL', () => {
    const onChange = vi.fn();
    render(<ControlledSocialLinks initialLinks={{}} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add social link', exact: true }));
    expect(screen.getByRole('combobox', { name: 'Social platform 1' }).value).toBe('facebook');
    expect(screen.getByRole('textbox', { name: 'Profile URL 1' }).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('URL is required.')).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox', { name: 'Profile URL 1' }), { target: { value: 'facebook.com/yourpage' } });
    expect(onChange).toHaveBeenLastCalledWith({ facebook: 'facebook.com/yourpage', instagram: '', messenger: '' });
    expect(screen.getByText('Please enter a valid URL.')).toBeTruthy();
  });

  it('provides an accessible name and description for the modal editor', () => {
    render(<StorefrontSocialLinksSettings interactionMode="modal" links={{}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add social link', exact: true }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-labelledby')).toBe('storefront-social-link-dialog-title');
    expect(dialog.getAttribute('aria-describedby')).toBe('storefront-social-link-dialog-description');
    expect(screen.getByRole('heading', { name: 'Add Social Link', exact: true })).toBeTruthy();
  });

  it('prevents duplicate platforms and removes links through the backend-shaped object', () => {
    const onChange = vi.fn();
    render(<StorefrontSocialLinksSettings links={[{ platform: 'facebook', url: 'https://facebook.com/one' }, { platform: 'facebook', url: 'https://facebook.com/two' }]} onChange={onChange} />);

    expect(screen.getAllByText('This platform has already been added.')).toHaveLength(2);
    const secondPlatform = screen.getByRole('combobox', { name: 'Social platform 2' });
    expect(Array.from(secondPlatform.options).find((option) => option.value === 'facebook').disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Remove social link 2', exact: true }));
    expect(onChange).toHaveBeenLastCalledWith({ facebook: 'https://facebook.com/one', instagram: '', messenger: '' });
  });

  it('limits the editor to the available backend platforms', () => {
    render(<StorefrontSocialLinksSettings links={{ facebook: 'https://facebook.com/one', instagram: 'https://instagram.com/one', messenger: 'https://m.me/one' }} />);

    expect(screen.getByRole('button', { name: 'Add social link (maximum of 3 reached)', exact: true }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'More information about Social Links', exact: true }));
    expect(screen.getByText('You have reached the maximum of 3 social links.')).toBeTruthy();
    expect(screen.queryByText('TikTok')).toBeNull();
  });

  it('renders a compact empty state', () => {
    render(<StorefrontSocialLinksSettings links={{ facebook: '', instagram: '', messenger: '' }} />);

    expect(screen.getByRole('heading', { name: 'No social links added yet.', exact: true, level: 4 })).toBeTruthy();
    expect(screen.getByText('Add links so customers can find you on social media.')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Add social link', exact: true })).toHaveLength(1);
  });

  it('supports registration-level headings and readable validation copy without changing POS defaults', () => {
    render(<StorefrontSocialLinksSettings titleHeadingLevel={2} links={{ facebook: 'not a valid url' }} />);

    expect(screen.getByRole('heading', { name: 'Social Links', level: 2 })).toBeTruthy();
    expect(screen.getByText('Please enter a valid URL.').className).toContain('text-xs');
  });

  it('renders preview links without a platform dropdown or outer row card', () => {
    render(<StorefrontSocialLinksSettings interactionMode="modal" links={{ facebook: 'https://facebook.com/yourpage', instagram: 'https://instagram.com/yourpage' }} />);

    expect(screen.queryByRole('combobox', { name: 'Social platform 1' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Facebook social link', exact: true }).getAttribute('href')).toBe('https://facebook.com/yourpage');
    expect(screen.getByRole('link', { name: 'Instagram social link', exact: true }).getAttribute('href')).toBe('https://instagram.com/yourpage');
    const previewList = screen.getByRole('list', { name: 'Storefront social links', exact: true });
    expect(previewList.className).toContain('gap-0');
    expect(previewList.className).toContain('divide-y');
    expect(previewList.className).toContain('sm:divide-x');
    expect(screen.getByRole('button', { name: 'Edit social link 1', exact: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove social link 1', exact: true })).toBeTruthy();
    const firstPreviewRow = screen.getByRole('listitem', { name: '1. facebook', exact: true });
    expect(firstPreviewRow.className).toContain('px-3');
    expect(firstPreviewRow.className).toContain('sm:px-4');
    expect(firstPreviewRow.className).not.toContain('rounded-lg');
  });
});
