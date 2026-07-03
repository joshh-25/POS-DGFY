import { NativeModules } from 'react-native';

interface SyncModule {
    enqueueAuthorizedSync(deviceId: string): Promise<{ workId: string; state: string }>;
    getLastAuthorizedSyncStatus(): Promise<{ workId: string; deviceId: string; status: string; completedAt: number }>;
}

const nativeModule = NativeModules.StandalonePosSync as SyncModule | undefined;

export const standalonePosSync = {
    available: Boolean(nativeModule),
    async enqueueAuthorizedSync(deviceId: string) {
        if (!nativeModule) {
            return { workId: '', state: 'unavailable' };
        }

        return await nativeModule.enqueueAuthorizedSync(deviceId);
    },
    async getLastAuthorizedSyncStatus() {
        if (!nativeModule) {
            return { workId: '', deviceId: '', status: 'unavailable', completedAt: 0 };
        }

        return await nativeModule.getLastAuthorizedSyncStatus();
    }
};
