import { NativeModules } from 'react-native';

interface HardwareCommandResult {
    success: boolean;
    message: string;
    [key: string]: unknown;
}

interface StandalonePosHardwareModule {
    printReceipt(receiptText: string, openDrawerAfterPrint: boolean): Promise<HardwareCommandResult>;
    printOrderTicket(ticketText: string): Promise<HardwareCommandResult>;
    openCashDrawer(reason?: string, localTransaction?: Record<string, unknown> | null): Promise<HardwareCommandResult>;
    getHardwareDiagnostics(): Promise<Record<string, unknown>>;
    scanBarcode(): Promise<{ available: boolean; message: string; code?: string | null }>;
}

const nativeModule = NativeModules.StandalonePosHardware as StandalonePosHardwareModule | undefined;

const unavailableResult = (message: string): HardwareCommandResult => ({
    success: false,
    message
});

export const standalonePosHardware = {
    available: Boolean(nativeModule),
    async printReceipt(receiptText: string, openDrawerAfterPrint: boolean): Promise<HardwareCommandResult> {
        if (!nativeModule) {
            return unavailableResult('Standalone hardware bridge is not available in this runtime.');
        }

        return await nativeModule.printReceipt(receiptText, openDrawerAfterPrint);
    },
    async printOrderTicket(ticketText: string): Promise<HardwareCommandResult> {
        if (!nativeModule) {
            return unavailableResult('Standalone hardware bridge is not available in this runtime.');
        }

        return await nativeModule.printOrderTicket(ticketText);
    },
    async openCashDrawer(reason?: string, localTransaction?: Record<string, unknown> | null): Promise<HardwareCommandResult> {
        if (!nativeModule) {
            return unavailableResult('Standalone hardware bridge is not available in this runtime.');
        }

        return await nativeModule.openCashDrawer(reason, localTransaction ?? null);
    },
    async getHardwareDiagnostics(): Promise<Record<string, unknown>> {
        if (!nativeModule) {
            return {
                available: false,
                message: 'Standalone hardware bridge is not available in this runtime.'
            };
        }

        return await nativeModule.getHardwareDiagnostics();
    },
    async scanBarcode(): Promise<{ available: boolean; message: string; code?: string | null }> {
        if (!nativeModule) {
            return {
                available: false,
                message: 'Standalone hardware bridge is not available in this runtime.'
            };
        }

        return await nativeModule.scanBarcode();
    }
};
