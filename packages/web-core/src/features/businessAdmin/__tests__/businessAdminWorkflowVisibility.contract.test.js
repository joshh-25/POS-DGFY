import { describe, expect, it } from 'vitest';
import {
    getBusinessAdminWorkflowPageName,
    isBusinessAdminWorkflowSectionVisible
} from '../businessAdminWorkflowVisibility.js';

describe('Business Admin workflow visibility contract', () => {
    it('maps workflow-sensitive Back Office sections to shared page capabilities', () => {
        expect(getBusinessAdminWorkflowPageName('services')).toBe('Services');
        expect(getBusinessAdminWorkflowPageName('hospitality')).toBe('Hospitality');
        expect(getBusinessAdminWorkflowPageName('fnb')).toBe('Fnb');
        expect(getBusinessAdminWorkflowPageName('catalog')).toBeNull();
    });

    it('hides non-F&B vertical modules for an F&B tenant', () => {
        expect(isBusinessAdminWorkflowSectionVisible('services', 'fnb')).toBe(false);
        expect(isBusinessAdminWorkflowSectionVisible('hospitality', 'fnb')).toBe(false);
        expect(isBusinessAdminWorkflowSectionVisible('job-orders', 'fnb')).toBe(false);
        expect(isBusinessAdminWorkflowSectionVisible('dispatch-orders', 'fnb')).toBe(false);
        expect(isBusinessAdminWorkflowSectionVisible('fnb', 'fnb')).toBe(true);
        expect(isBusinessAdminWorkflowSectionVisible('catalog', 'fnb')).toBe(true);
        expect(isBusinessAdminWorkflowSectionVisible('orders', 'fnb')).toBe(true);
    });

    it('preserves composed capability overlays', () => {
        expect(isBusinessAdminWorkflowSectionVisible('services', 'fnb', ['services'])).toBe(true);
        expect(isBusinessAdminWorkflowSectionVisible('fnb', 'fnb', [], ['fnbDining'])).toBe(false);
    });
});
