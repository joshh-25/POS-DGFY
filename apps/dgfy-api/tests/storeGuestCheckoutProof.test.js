import { assertGuestCheckoutAllowed } from '../src/modules/store/utils/storeGuestCheckoutProof.js';

// #622: assertGuestCheckoutAllowed is the per-store "require DGFY account" gate, wired into
// buildStoreCheckoutUseCase, the payment-session use case, and both service-booking use cases
// (all four already threading `storeCustomer`/`accessPolicy.guest_checkout_enabled` through). This
// covers the shared decision function directly rather than re-standing up each call site's heavy
// DB-backed fixtures.
describe('assertGuestCheckoutAllowed', () => {
    it('allows a guest when the store has not disabled guest checkout', () => {
        expect(() => assertGuestCheckoutAllowed({
            guestCheckoutEnabled: true,
            storeCustomer: null
        })).not.toThrow();
    });

    it('fails open when guestCheckoutEnabled is omitted -- a settings-read failure must not block every store', () => {
        expect(() => assertGuestCheckoutAllowed({ storeCustomer: null })).not.toThrow();
    });

    it('rejects a guest with GUEST_CHECKOUT_DISABLED when the store requires an account', () => {
        expect(() => assertGuestCheckoutAllowed({
            guestCheckoutEnabled: false,
            storeCustomer: null
        })).toThrow(expect.objectContaining({
            statusCode: 403,
            details: expect.objectContaining({ reason_code: 'GUEST_CHECKOUT_DISABLED' })
        }));
    });

    it('rejects an authenticated-but-non-DGFY store customer the same as a guest', () => {
        expect(() => assertGuestCheckoutAllowed({
            guestCheckoutEnabled: false,
            storeCustomer: { customer_id: 42, dgfy_account_id: null }
        })).toThrow(expect.objectContaining({
            details: expect.objectContaining({ reason_code: 'GUEST_CHECKOUT_DISABLED' })
        }));
    });

    it('allows a DGFY-linked customer even when guest checkout is disabled', () => {
        expect(() => assertGuestCheckoutAllowed({
            guestCheckoutEnabled: false,
            storeCustomer: { customer_id: 42, dgfy_account_id: 'acct-1' }
        })).not.toThrow();
    });
});
