// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PackingEvidenceControl from '../components/PackingEvidenceControl.jsx';

const serviceMocks = vi.hoisted(() => ({
  uploadOrderPackingEvidence: vi.fn(),
  fetchOrderPackingEvidenceList: vi.fn(),
  fetchOrderPackingEvidenceImage: vi.fn()
}));

vi.mock('../services/posService.js', () => serviceMocks);
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn()
  }
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const packedOrder = (overrides = {}) => ({
  pos_transaction_id: 77,
  fulfillment_status: 'packed',
  packed_at: '2026-09-13T00:00:00.000Z',
  packing_evidence_count: 0,
  ...overrides
});

describe('POS packing evidence affordance (Phase 329, #1460)', () => {
  it('is absent before the packed transition and visible as optional after it', () => {
    const { rerender } = render(
      <PackingEvidenceControl order={{ ...packedOrder(), fulfillment_status: 'preparing', packed_at: null }} canTransactPos />
    );
    expect(screen.queryByTestId('packing-evidence-77')).toBeNull();

    rerender(<PackingEvidenceControl order={packedOrder()} canTransactPos />);
    expect(screen.getByText('Optional — attach zero or more photos after packing.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /attach evidence photos/i })).toBeTruthy();
  });

  it('uploads selected photos under the client-side remaining cap and leaves zero-photo orders valid', async () => {
    serviceMocks.uploadOrderPackingEvidence.mockResolvedValue({ total_count: 2 });
    render(<PackingEvidenceControl order={packedOrder()} canTransactPos />);
    const files = [
      new File(['one'], 'one.jpg', { type: 'image/jpeg' }),
      new File(['two'], 'two.jpg', { type: 'image/jpeg' })
    ];

    fireEvent.change(screen.getByLabelText(/select packing evidence images/i), {
      target: { files }
    });

    await waitFor(() => expect(serviceMocks.uploadOrderPackingEvidence).toHaveBeenCalledWith(77, files));
    expect(screen.getByText('Packing evidence: 2 / 6')).toBeTruthy();
  });

  it('disables attachment at six images and loads authenticated viewer object URLs', async () => {
    serviceMocks.fetchOrderPackingEvidenceList.mockResolvedValue({
      total_count: 1,
      images: [{ image_id: '11111111-1111-4111-8111-111111111111', mime_type: 'image/webp', size_bytes: 42 }]
    });
    serviceMocks.fetchOrderPackingEvidenceImage.mockResolvedValue('blob:packing-evidence-1');
    const { rerender } = render(
      <PackingEvidenceControl order={packedOrder({ packing_evidence_count: 6 })} canTransactPos />
    );
    expect(screen.getByRole('button', { name: /attach evidence photos/i }).disabled).toBe(true);

    rerender(<PackingEvidenceControl order={packedOrder({ packing_evidence_count: 1 })} canViewPos />);
    fireEvent.click(screen.getByRole('button', { name: /view evidence photos/i }));
    expect((await screen.findByRole('img', { name: /packing evidence 1/i })).getAttribute('src')).toBe('blob:packing-evidence-1');
    expect(serviceMocks.fetchOrderPackingEvidenceImage).toHaveBeenCalledWith(77, '11111111-1111-4111-8111-111111111111');
  });
});
