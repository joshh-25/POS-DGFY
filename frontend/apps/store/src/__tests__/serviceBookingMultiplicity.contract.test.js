import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = () => fs.readFileSync(path.join(appRoot, 'StorefrontApp.jsx'), 'utf8');

describe('Service booking multiplicity contract', () => {
  it('submits service carts through the all-or-nothing batch endpoint', () => {
    const source = appSource();

    expect(source).toContain('/api/v1/store/services/bookings/batch');
    expect(source).toContain('bookings: heldServiceCartLines.map');
    expect(source).toContain('quantity: Math.max(1, Number(line.quantity || 1))');
    expect(source).toContain("idempotency_key: createStorefrontIdempotencyKey('service-batch')");
  });

  it('uses draft-specific cart line ids so duplicate services can coexist', () => {
    const source = appSource();

    expect(source).toContain('cart_line_id');
    expect(source).toContain('openServiceCartEditor(line)');
    expect(source).toContain('serviceCartValidationIssues');
  });

  it('renders draft-specific review, errors, references, and payment links', () => {
    const source = appSource();

    expect(source).toContain('serviceBatchFailureMessage(error, serviceCartLines)');
    expect(source).toContain('line?.intake_responses || {}');
    expect(source).toContain('Booking references');
    expect(source).toContain('checkoutResult.payments.filter');
  });

  it('loads live capacity-aware availability before offering service time slots', () => {
    const source = appSource();

    expect(source).toContain('/api/v1/store/services/availability?');
    expect(source).toContain('buildServiceAvailabilitySlotOptions');
    expect(source).toContain('serviceAvailabilityMessage');
    expect(source).toContain('Live capacity checked');
    expect(source).toContain('No available slots for this date and quantity');
    expect(source).toContain('This quantity needs a service resource with more capacity.');
  });

  it('reserves service drafts with short-lived holds and reuses fresh holds at checkout', () => {
    const source = appSource();

    expect(source).toContain('/api/v1/store/services/holds');
    expect(source).toContain('replace_hold_token');
    expect(source).toContain('hasFreshServiceHold');
    expect(source).toContain('ensureServiceBookingHold(line)');
    expect(source).toContain('service_hold_token');
    expect(source).toContain('Reserving...');
  });
});
