import { describe, expect, it } from 'vitest';
import {
  buildEditGalleryIntent,
  buildFinalEditGallery,
  dedupeImageFiles,
  getGallerySignature
} from '../posEditImageDraft.js';

const saved = (path) => ({ path, url: `/uploads/${path}` });

describe('POS edit image draft helpers', () => {
  it('deduplicates repeated file selections against existing pending files', () => {
    const first = new File(['same'], 'dish.png', { type: 'image/png', lastModified: 7 });
    const duplicate = new File(['same'], 'dish.png', { type: 'image/png', lastModified: 7 });
    const second = new File(['other'], 'drink.png', { type: 'image/png', lastModified: 8 });

    expect(dedupeImageFiles([first, duplicate, second])).toEqual([first, second]);
    expect(dedupeImageFiles([duplicate], [first])).toEqual([]);
  });

  it('serializes saved and pending entries with the pending primary first', () => {
    const first = new File(['first'], 'first.png', { type: 'image/png', lastModified: 1 });
    const second = new File(['second'], 'second.png', { type: 'image/png', lastModified: 2 });
    const intent = buildEditGalleryIntent({
      baseGallery: [saved('old.webp')],
      draftGallery: [saved('old.webp')],
      pendingFiles: [first, second],
      pendingPrimaryFile: second
    });

    expect(intent.base_keys).toEqual(['old.webp']);
    expect(intent.entries.map((entry) => entry.type)).toEqual(['pending', 'saved', 'pending']);
    expect(intent.entries[0].key).toBe(intent.pending_keys[1]);
  });

  it('rebuilds the final gallery from the saved draft and uploaded entries', () => {
    const first = new File(['first'], 'first.png', { type: 'image/png', lastModified: 1 });
    const second = new File(['second'], 'second.png', { type: 'image/png', lastModified: 2 });
    const base = [saved('old.webp'), saved('remove.webp')];
    const refreshed = [
      saved('old.webp'),
      saved('remove.webp'),
      saved('first.webp'),
      saved('second.webp')
    ];
    const result = buildFinalEditGallery({
      baseGallery: base,
      draftGallery: [saved('old.webp')],
      refreshedGallery: refreshed,
      pendingFiles: [first, second],
      pendingPrimaryFile: second
    });

    expect(result.pendingEntries).toHaveLength(2);
    expect(result.gallery.map((entry) => entry.path)).toEqual(['second.webp', 'old.webp', 'first.webp']);
    expect(result.gallery[0]).toMatchObject({ is_primary: true, sort_order: 0 });
    expect(getGallerySignature(result.gallery)).toBe('second.webp\u001eold.webp\u001efirst.webp');
  });
});
