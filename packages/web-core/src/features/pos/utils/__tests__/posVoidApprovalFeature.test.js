import { describe, expect, it } from 'vitest';
import { isInlineVoidApprovalPopupEnabled } from '../posVoidApprovalFeature.js';

describe('POS inline void approval feature flag', () => {
    it('requires the standalone POS surface', () => {
        expect(isInlineVoidApprovalPopupEnabled({
            VITE_APP_SURFACE: 'ims',
            VITE_POS_VOID_APPROVAL_POPUP_ENABLED: 'true',
            DEV: true
        })).toBe(false);
    });

    it('honors an explicit enable or disable value', () => {
        expect(isInlineVoidApprovalPopupEnabled({
            VITE_APP_SURFACE: 'pos',
            VITE_POS_VOID_APPROVAL_POPUP_ENABLED: 'true',
            DEV: false
        })).toBe(true);
        expect(isInlineVoidApprovalPopupEnabled({
            VITE_APP_SURFACE: 'pos',
            VITE_POS_VOID_APPROVAL_POPUP_ENABLED: 'false',
            DEV: true
        })).toBe(false);
    });

    it('defaults to enabled only for local POS development', () => {
        expect(isInlineVoidApprovalPopupEnabled({ VITE_APP_SURFACE: 'pos', DEV: true })).toBe(true);
        expect(isInlineVoidApprovalPopupEnabled({ VITE_APP_SURFACE: 'pos', DEV: false })).toBe(false);
    });
});
