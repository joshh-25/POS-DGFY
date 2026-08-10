import { resolvePosDeviceDriver } from '../src/modules/pos/integrations/resolvePosDeviceDriver.js';
import { assertPosDeviceDriverContract } from '../src/modules/pos/contracts/posDeviceDriver.contract.js';

describe('resolvePosDeviceDriver', () => {
    it('resolves to client_managed in auto mode when the LAN bridge is not enabled', () => {
        const driver = resolvePosDeviceDriver({ override: 'auto', bridgeEnabled: false });
        expect(driver.id).toBe('client_managed');
    });

    it('resolves to lan_escpos_bridge in auto mode when the LAN bridge is enabled', () => {
        const driver = resolvePosDeviceDriver({ override: 'auto', bridgeEnabled: true });
        expect(driver.id).toBe('lan_escpos_bridge');
    });

    it('honors an explicit override regardless of bridgeEnabled', () => {
        expect(resolvePosDeviceDriver({ override: 'none', bridgeEnabled: true }).id).toBe('none');
        expect(resolvePosDeviceDriver({ override: 'client_managed', bridgeEnabled: true }).id).toBe('client_managed');
        expect(resolvePosDeviceDriver({ override: 'lan_escpos_bridge', bridgeEnabled: false }).id).toBe('lan_escpos_bridge');
    });

    it('falls back to client_managed for an unrecognized override', () => {
        const driver = resolvePosDeviceDriver({ override: 'not-a-real-driver', bridgeEnabled: false });
        expect(driver.id).toBe('client_managed');
    });

    it('every resolvable driver satisfies the posDeviceDriver contract', () => {
        for (const override of ['none', 'client_managed', 'lan_escpos_bridge']) {
            const driver = resolvePosDeviceDriver({ override, bridgeEnabled: true });
            expect(() => assertPosDeviceDriverContract(driver)).not.toThrow();
        }
    });
});

describe('assertPosDeviceDriverContract', () => {
    it('rejects a driver missing a required method', () => {
        expect(() => assertPosDeviceDriverContract({ id: 'broken', getStatus: async () => ({}) }))
            .toThrow(/missing required method: printReceipt/);
    });

    it('rejects a driver with no id', () => {
        expect(() => assertPosDeviceDriverContract({
            getStatus: async () => ({}),
            printReceipt: async () => ({}),
            openDrawer: async () => ({})
        })).toThrow(/must declare a non-empty string id/);
    });

    it('rejects a non-object', () => {
        expect(() => assertPosDeviceDriverContract(null)).toThrow(/must be an object/);
    });
});
