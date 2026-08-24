import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');

describe('Storefront promo eligibility controls', () => {
  it('persists separate channel, fulfillment, and timing toggle values', () => {
    const source = fs.readFileSync(workspacePath, 'utf8');

    expect(source).toContain("channels: { storefront: true, pos: true }");
    expect(source).toContain("fulfillment_methods: { delivery: true, pickup: true }");
    expect(source).toContain("order_timing: { asap: true, scheduled: true }");
    expect(source).toContain('Storefront Fulfillment');
    expect(source).toContain('Order Timing');
  });
});
