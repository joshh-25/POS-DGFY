import { describe, expect, it } from 'vitest';

import { splitIntoByteBoundedBatches } from '../bulkBatchSplitter.js';

const makeFile = (name, size) => {
  const file = new File([new Uint8Array(size)], name, { type: 'image/png' });
  // jsdom/node's File derives `size` from the blob parts, which already matches `size` above --
  // asserted here so a future change to this helper can't silently drift the byte accounting the
  // whole test suite depends on.
  expect(file.size).toBe(size);
  return file;
};

const group = (...files) => ({ files });

describe('bulkBatchSplitter.js -- splitIntoByteBoundedBatches (#1643, epic #265 298d)', () => {
  it('packs a single group under the target into one batch', () => {
    const groups = [group(makeFile('SKU-1.png', 1024))];
    const batches = splitIntoByteBoundedBatches(groups, { targetBytes: 6 * 1024 * 1024 });
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(1);
    expect(batches[0][0].name).toBe('SKU-1.png');
  });

  it('packs several small groups into the fewest batches that stay at or under the byte target', () => {
    const targetBytes = 10;
    const groups = [
      group(makeFile('SKU-1.png', 4)),
      group(makeFile('SKU-2.png', 4)),
      group(makeFile('SKU-3.png', 4)), // 4+4+4=12 > 10 -- must start a new batch here
      group(makeFile('SKU-4.png', 2)),
    ];
    const batches = splitIntoByteBoundedBatches(groups, { targetBytes });
    expect(batches).toHaveLength(2);
    expect(batches[0].map((f) => f.name)).toEqual(['SKU-1.png', 'SKU-2.png']);
    expect(batches[1].map((f) => f.name)).toEqual(['SKU-3.png', 'SKU-4.png']);
  });

  it('gives a group already over the byte target its own batch, never dropped and never split', () => {
    const targetBytes = 10;
    const groups = [
      group(makeFile('SKU-1.png', 4)),
      group(makeFile('SKU-2-oversized.png', 50)),
      group(makeFile('SKU-3.png', 4)),
    ];
    const batches = splitIntoByteBoundedBatches(groups, { targetBytes });
    expect(batches).toHaveLength(3);
    expect(batches[0].map((f) => f.name)).toEqual(['SKU-1.png']);
    expect(batches[1].map((f) => f.name)).toEqual(['SKU-2-oversized.png']);
    expect(batches[2].map((f) => f.name)).toEqual(['SKU-3.png']);
  });

  it('binds the per-batch file-count ceiling even when bytes would allow more', () => {
    const groups = Array.from({ length: 5 }, (_, i) => group(makeFile(`SKU-${i}.png`, 1)));
    const batches = splitIntoByteBoundedBatches(groups, { targetBytes: 1024 * 1024, maxFilesPerBatch: 2 });
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(2);
    expect(batches[1]).toHaveLength(2);
    expect(batches[2]).toHaveLength(1);
  });

  it('preserves input order across batches', () => {
    const groups = [
      group(makeFile('A.png', 1)),
      group(makeFile('B.png', 1)),
      group(makeFile('C.png', 1)),
    ];
    const batches = splitIntoByteBoundedBatches(groups, { targetBytes: 1024, maxFilesPerBatch: 50 });
    expect(batches.flat().map((f) => f.name)).toEqual(['A.png', 'B.png', 'C.png']);
  });

  it("never splits a stem-group's files across two output batches", () => {
    const targetBytes = 5;
    // A single SKU-stem group carrying 3 files (large/medium/thumbnail) whose combined size
    // already exceeds the target -- must still land in one batch together, never split.
    const groups = [
      group(
        makeFile('SKU-1__large.png', 3),
        makeFile('SKU-1__medium.png', 3),
        makeFile('SKU-1__thumbnail.png', 3)
      ),
    ];
    const batches = splitIntoByteBoundedBatches(groups, { targetBytes });
    expect(batches).toHaveLength(1);
    expect(batches[0].map((f) => f.name)).toEqual([
      'SKU-1__large.png',
      'SKU-1__medium.png',
      'SKU-1__thumbnail.png',
    ]);
  });

  it('uses the documented defaults (6 MB / 50 files) when no options are passed', () => {
    const groups = [group(makeFile('SKU-1.png', 1024))];
    const batches = splitIntoByteBoundedBatches(groups);
    expect(batches).toEqual([[expect.objectContaining({ name: 'SKU-1.png' })]]);
  });
});
