import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('shared Services API boundary', () => {
  it('keeps POS compatibility exports backed by the shared Services API client', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../pos/services/posService.js'),
      'utf8'
    );

    expect(source).toContain("from '../../services/api/servicesApi.js'");
    expect(source).toContain('export const fetchPosServiceOptionGroups = listServiceOptionGroups');
    expect(source).toContain('export const fetchPosItemOptionGroups = getItemOptionGroups');
    expect(source).not.toContain("api.get('/services/option-groups'");
    expect(source).not.toContain("api.get(`/services/catalog/${itemId}/option-groups`");
  });

  it('exposes booking creation and settlement through the shared Services API client', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../api/servicesApi.js'),
      'utf8'
    );

    expect(source).toContain("export const createServiceBooking = (payload) => api.post('/services/bookings', payload)");
    expect(source).toContain('export const settleServiceBooking = (bookingId, payload)');
    expect(source).toContain('api.post(`/services/bookings/${bookingId}/settle`, payload)');
  });
});
