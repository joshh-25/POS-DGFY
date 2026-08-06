import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fifoBatchViewerPath = path.resolve(__dirname, '../FIFOBatchViewer.jsx');

describe('FIFOBatchViewer location contract', () => {
  const source = fs.readFileSync(fifoBatchViewerPath, 'utf8');

  it('groups FIFO batches with location stock and cost metrics', () => {
    expect(source).toContain('buildLocationGroups');
    expect(source).toContain('item.item_location_stocks');
    expect(source).toContain('item.cost_metrics.by_location');
    expect(source).toContain('locationKey(batch?.location_id)');
    expect(source).toContain('group.next_batch_id');
    expect(source).toContain('FIFO Batches By Location');
  });

  it('keeps location filtering explicit and avoids a cross-location next-to-use label', () => {
    expect(source).toContain("const [locationFilter, setLocationFilter] = useState({ itemId: null, key: 'all' })");
    expect(source).toContain('All locations');
    expect(source).toContain("locationFilter.itemId === itemId ? locationFilter.key : 'all'");
    expect(source).toContain("selectedLocationKey === 'all'");
    expect(source).toContain('locationGroups.some((group) => group.key === requestedLocationKey)');
    expect(source).toContain('const selectLocationKey = (key) => setLocationFilter({ itemId, key })');
    expect(source).toContain('aria-pressed={selectedLocationKey === group.key}');
    expect(source).toContain('aria-label={`Show FIFO batches for ${group.label}`}');
    expect(source).not.toContain('nextToUseIdx');
  });

  it('does not render stock controls for pure service item rows', () => {
    expect(source).toContain("toLowerCase() === 'service'");
    expect(source).toContain('isServiceOnlyItem');
    expect(source).toContain('!item?.fifo_enabled || isServiceOnlyItem');
  });
});
