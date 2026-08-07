import { isCodDelivery, resolvePaymentTiming } from '../src/modules/shared/utils/paymentTimingPolicy.js';

describe('payment timing policy', () => {
    it('classifies online delivery cash as COD collected on delivery', () => {
        expect(resolvePaymentTiming({ orderMethod: 'delivery', paymentType: 'cash' })).toBe('on_delivery');
        expect(isCodDelivery({ orderMethod: 'delivery', paymentType: 'cash', paymentTiming: 'on_delivery' })).toBe(true);
    });

    it('classifies online pickup cash separately from delivery COD', () => {
        expect(resolvePaymentTiming({ orderMethod: 'pickup', paymentType: 'cash' })).toBe('on_pickup');
        expect(isCodDelivery({ orderMethod: 'pickup', paymentType: 'cash', paymentTiming: 'on_pickup' })).toBe(false);
    });

    it('keeps non-cash and in-store tenders upfront', () => {
        expect(resolvePaymentTiming({ orderMethod: 'delivery', paymentType: 'qrph' })).toBe('upfront');
        expect(resolvePaymentTiming({ orderMethod: 'dine_in', paymentType: 'cash' })).toBe('upfront');
    });
});
