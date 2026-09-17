/** @vitest-environment jsdom */
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StorefrontGallerySettings from '../settings/StorefrontGallerySettings.jsx';

afterEach(cleanup);

const image = (index, overrides = {}) => ({
  path: `storefront-assets/tindahan/gallery-${index}.jpg`,
  url: '',
  caption: `Photo ${index}`,
  alt: `Storefront photo ${index}`,
  sort_order: index - 1,
  ...overrides
});

function ControlledGallery({ initialImages, onChange, onUploadImage }) {
  const [images, setImages] = useState(initialImages);
  return <StorefrontGallerySettings images={images} onChange={(next) => { setImages(next); onChange?.(next); }} onUploadImage={onUploadImage} />;
}

describe('Storefront gallery settings', () => {
  it('renders a compact responsive image grid with order labels and guidance', () => {
    render(<StorefrontGallerySettings images={Array.from({ length: 8 }, (_, index) => image(index + 1))} />);

    expect(screen.getByRole('heading', { name: 'Gallery', exact: true })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Storefront gallery images', exact: true })).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(8);
    expect(screen.getByRole('listitem', { name: '1. Photo 1', exact: true })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'More information about Gallery', exact: true }));
    expect(screen.getByText('You have reached the maximum of 8 images.')).toBeTruthy();
    expect(screen.getByText('Remove an image to upload another.')).toBeTruthy();
  });

  it('supports the image actions menu, metadata editing, and remove confirmation', () => {
    const onChange = vi.fn();
    render(<ControlledGallery initialImages={[image(1)]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Gallery image 1 actions', exact: true }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit details', exact: true }));
    const editForm = screen.getByLabelText('Edit gallery image 1');
    fireEvent.change(within(editForm).getByLabelText(/Caption/), { target: { value: 'Updated caption' } });
    fireEvent.click(within(editForm).getByRole('button', { name: 'Save Changes', exact: true }));
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ caption: 'Updated caption', sort_order: 0 })]);

    fireEvent.click(screen.getByRole('button', { name: 'Gallery image 1 actions', exact: true }));
    const removeMenuItem = screen.getByRole('menuitem', { name: 'Remove', exact: true });
    expect(removeMenuItem.className).toContain('bg-rose-50');
    expect(removeMenuItem.className).toContain('border-rose-200');
    fireEvent.click(removeMenuItem);
    const removeDialog = screen.getByRole('dialog');
    expect(within(removeDialog).getByText('Are you sure you want to remove this image?')).toBeTruthy();
    fireEvent.click(within(removeDialog).getByRole('button', { name: 'Remove', exact: true }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('validates uploads and uses the existing upload callback for new images', async () => {
    const onChange = vi.fn();
    const onUploadImage = vi.fn().mockResolvedValue({ success: true, uploaded: { path: 'storefront-assets/tindahan/new.webp' } });
    render(<ControlledGallery initialImages={[]} onChange={onChange} onUploadImage={onUploadImage} />);

    const input = screen.getByLabelText('Choose gallery images');
    const invalidFile = new File(['bad'], 'photo.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [invalidFile] } });
    expect(await screen.findByText('Unsupported file type. Use JPG, PNG, or WebP.')).toBeTruthy();

    const validFile = new File(['image'], 'photo.webp', { type: 'image/webp' });
    fireEvent.change(input, { target: { files: [validFile] } });
    await waitFor(() => expect(onUploadImage).toHaveBeenCalledWith(null, validFile, expect.any(Object)));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ path: 'storefront-assets/tindahan/new.webp', sort_order: 0 })]));
  });

  it('uploads a single selection or every valid image in a multiple-file selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const firstFile = new File(['first'], 'first.webp', { type: 'image/webp' });
    const secondFile = new File(['second'], 'second.png', { type: 'image/png' });
    const onUploadImage = vi.fn()
      .mockResolvedValueOnce({ success: true, uploaded: { path: 'storefront-assets/tindahan/first.webp' } })
      .mockResolvedValueOnce({ success: true, uploaded: { path: 'storefront-assets/tindahan/second.png' } });
    render(<ControlledGallery initialImages={[]} onChange={onChange} onUploadImage={onUploadImage} />);

    await user.upload(screen.getByLabelText('Choose gallery images'), [firstFile, secondFile]);

    await waitFor(() => expect(onUploadImage).toHaveBeenCalledTimes(2));
    expect(onUploadImage).toHaveBeenNthCalledWith(1, null, firstFile, expect.any(Object));
    expect(onUploadImage).toHaveBeenNthCalledWith(2, null, secondFile, expect.any(Object));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ path: 'storefront-assets/tindahan/first.webp', sort_order: 0 }),
      expect.objectContaining({ path: 'storefront-assets/tindahan/second.png', sort_order: 1 })
    ]));
  });

  it('supports drag reordering and reindexes the persisted sort order', () => {
    const onChange = vi.fn();
    render(<StorefrontGallerySettings images={[image(1), image(2), image(3)]} onChange={onChange} />);
    const first = screen.getByRole('listitem', { name: '1. Photo 1', exact: true });
    const second = screen.getByRole('listitem', { name: '2. Photo 2', exact: true });
    expect(first.getAttribute('draggable')).toBe('true');
    const dataTransfer = { effectAllowed: '', setData: vi.fn() };
    fireEvent.dragStart(first, { dataTransfer });
    fireEvent.dragOver(second, { dataTransfer });
    fireEvent.drop(second, { dataTransfer });
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ caption: 'Photo 2', sort_order: 0 }),
      expect.objectContaining({ caption: 'Photo 1', sort_order: 1 }),
      expect.objectContaining({ caption: 'Photo 3', sort_order: 2 })
    ]);
  });

  it('supports keyboard reordering for accessible operation', () => {
    const onChange = vi.fn();
    render(<ControlledGallery initialImages={[image(1), image(2)]} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('listitem', { name: '1. Photo 1', exact: true }), { key: 'ArrowDown', altKey: true });
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ caption: 'Photo 2', sort_order: 0 }),
      expect.objectContaining({ caption: 'Photo 1', sort_order: 1 })
    ]);
  });

  it('renders empty and maximum states without placeholder tiles', () => {
    const { rerender } = render(<StorefrontGallerySettings images={[]} />);
    expect(screen.getByRole('heading', { name: 'No gallery images yet.', exact: true })).toBeTruthy();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: 'Upload images', exact: true })).toHaveLength(1);

    rerender(<StorefrontGallerySettings images={Array.from({ length: 8 }, (_, index) => image(index + 1))} />);
    expect(screen.queryByRole('heading', { name: 'No gallery images yet.', exact: true })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More information about Gallery', exact: true }));
    expect(screen.getByText('Maximum of 8 images reached.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Upload images (maximum of 8 reached)', exact: true }).disabled).toBe(true);
  });
});
