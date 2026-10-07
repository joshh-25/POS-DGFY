import { describe, expect, it } from 'vitest';
import {
    buildCustomerDisplayChannelName,
    createCustomerDisplayEnvelope,
    createCustomerDisplaySessionId,
    isCustomerDisplayEnvelopeValid,
    CUSTOMER_DISPLAY_MESSAGE_TYPES,
    CUSTOMER_DISPLAY_PROTOCOL_VERSION
} from '../../../../packages/web-core/src/features/pos/services/customerDisplaySync.js';
import {
    CUSTOMER_DISPLAY_VIEW_STATES,
    projectCustomerDisplaySnapshot
} from '../../../../packages/web-core/src/features/pos/utils/customerDisplayProjection.js';

describe('POS customer display protocol and projection', () => {
    it('creates a session-scoped protocol envelope and rejects cross-session messages', () => {
        const sessionId = createCustomerDisplaySessionId();
        const envelope = createCustomerDisplayEnvelope({
            messageType: CUSTOMER_DISPLAY_MESSAGE_TYPES.SNAPSHOT,
            sessionId,
            terminalId: 'COUNTER-01',
            revision: 4,
            payload: {
                viewState: 'active',
                currency: 'PHP',
                items: [],
                itemCount: 0,
                subtotal: 0,
                discount: 0,
                serviceFees: 0,
                total: 125
            }
        });

        expect(envelope.protocolVersion).toBe(CUSTOMER_DISPLAY_PROTOCOL_VERSION);
        expect(envelope.sessionId).toBe(sessionId);
        expect(buildCustomerDisplayChannelName(sessionId)).toContain(sessionId);
        expect(isCustomerDisplayEnvelopeValid(envelope, {
            sessionId,
            terminalId: 'COUNTER-01'
        })).toBe(true);
        expect(isCustomerDisplayEnvelopeValid(envelope, {
            sessionId: 'cd-another-session-001',
            terminalId: 'COUNTER-01'
        })).toBe(false);
        expect(isCustomerDisplayEnvelopeValid({ ...envelope, messageType: 'unknown.message' }, { sessionId })).toBe(false);
        expect(isCustomerDisplayEnvelopeValid({
            ...envelope,
            payload: { ...envelope.payload, items: [{ key: 'bad', name: 'Malformed' }] }
        }, { sessionId, terminalId: 'COUNTER-01' })).toBe(false);
    });

    it('projects only customer-safe line data while preserving the cashier total', () => {
        const snapshot = projectCustomerDisplaySnapshot({
            cart: [{
                item_id: 77,
                item_name: 'Latte',
                quantity: 2,
                sale_price: 145,
                special_instructions: 'private customer note',
                service_option_details: [{ name: 'Oat milk', option_id: 9 }]
            }],
            cartSubtotal: 290,
            cartTotal: 305.5,
            cartTotalQuantity: 2,
            calculatedDiscountAmount: 10,
            serviceFeeAmount: 25.5,
            currency: 'PHP'
        });

        expect(snapshot.viewState).toBe(CUSTOMER_DISPLAY_VIEW_STATES.ACTIVE);
        expect(snapshot.total).toBe(305.5);
        expect(snapshot.items).toEqual([{
            key: 'line-0',
            name: 'Latte',
            quantity: 2,
            unitPrice: 145,
            lineTotal: 290,
            options: ['Oat milk']
        }]);
        expect(JSON.stringify(snapshot)).not.toContain('private customer note');
        expect(JSON.stringify(snapshot)).not.toContain('item_id');
    });

    it('marks an active cart as payment while checkout is open', () => {
        const snapshot = projectCustomerDisplaySnapshot({
            cart: [{ item_name: 'Coffee', quantity: 1, sale_price: 80 }],
            cartSubtotal: 80,
            cartTotal: 80,
            cartTotalQuantity: 1,
            checkoutConfirmModalOpen: true
        });

        expect(snapshot.viewState).toBe(CUSTOMER_DISPLAY_VIEW_STATES.PAYMENT);
    });
});
