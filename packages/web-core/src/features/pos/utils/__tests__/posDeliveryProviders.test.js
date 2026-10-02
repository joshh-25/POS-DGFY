import { describe, expect, it } from 'vitest';
import {
    DELIVERY_PROVIDER_OPTIONS,
    formatDeliveryProviderBreakdown,
    getDeliveryProviderValidationMessage,
    toDeliveryProviderPayload
} from '../posDeliveryProviders.js';

describe('delivery provider breakdown', () => {
    it('exposes exactly Foodpanda, Grab, and Other', () => {
        expect(DELIVERY_PROVIDER_OPTIONS.map((option) => option.value)).toEqual([
            'foodpanda',
            'grab',
            'other'
        ]);
    });

    it('requires the Other provider name and exactly one provider', () => {
        expect(getDeliveryProviderValidationMessage({
            orderMethod: 'delivery',
            entries: [{ provider_type: 'other', provider_name: '', amount: '90' }],
            totalAmount: 90
        })).toBe('Enter the provider name for Other.');

        expect(getDeliveryProviderValidationMessage({
            orderMethod: 'delivery',
            entries: [
                { provider_type: 'grab', amount: '180' },
                { provider_type: 'other', provider_name: 'Maxim', amount: '90' }
            ],
            totalAmount: 300
        })).toBe('Select exactly one delivery provider.');

        expect(getDeliveryProviderValidationMessage({
            orderMethod: 'delivery',
            entries: [{ provider_type: 'grab', amount: '' }],
            totalAmount: 270
        })).toBe('');
    });

    it('derives the new transaction provider amount from Total Payment while keeping historical formatting', () => {
        const entries = [
            { provider_type: 'grab', amount: '' }
        ];

        expect(toDeliveryProviderPayload(entries, 270)).toEqual([
            { provider_type: 'grab', amount: 270 }
        ]);
        expect(toDeliveryProviderPayload([{ provider_type: 'grab', amount: '180' }])).toEqual([
            { provider_type: 'grab', amount: 180 }
        ]);
        expect(formatDeliveryProviderBreakdown([
            { provider_type: 'grab', amount: '180' },
            { provider_type: 'other', provider_name: 'Maxim', amount: '90' }
        ])).toBe('Grab ₱180.00 + Maxim (Other) ₱90.00');
    });
});
