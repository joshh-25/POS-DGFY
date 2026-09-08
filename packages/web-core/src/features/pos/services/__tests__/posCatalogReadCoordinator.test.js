import { describe, expect, it } from 'vitest';
import { createCatalogReadCoordinator, preserveCatalogRows } from '../posCatalogReadCoordinator.js';

describe('catalog read coordination', () => {
  it('coalesces a burst into one in-flight read and one rerun', async () => {
    const coordinate = createCatalogReadCoordinator();
    const resolvers = [];
    const read = () => new Promise((resolve) => resolvers.push(resolve));
    const first = coordinate('tenant-a:query', read);
    const second = coordinate('tenant-a:query', read);
    coordinate('tenant-a:query', read);
    expect(resolvers).toHaveLength(1);
    resolvers[0](['old']);
    await Promise.resolve();
    expect(resolvers).toHaveLength(2);
    resolvers[1](['new']);
    expect(await first).toEqual(['new']);
    expect(await second).toEqual(['new']);
  });
  it('retains unchanged row references', () => {
    const before = [{ item_id: 1, name: 'unchanged' }, { item_id: 2, name: 'old' }];
    const after = preserveCatalogRows(before, [{ ...before[0] }, { item_id: 2, name: 'new' }]);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
  });
});
