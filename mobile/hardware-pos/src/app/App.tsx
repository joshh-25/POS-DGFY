import React, { useEffect } from 'react';
import { SafeAreaView, useWindowDimensions } from 'react-native';
import type { SyncPolicyRecord } from '../domain/types';
import { authorizeManualSync } from '../domain/syncPolicy';
import { hardwarePosSchema } from '../db/schema';
import { createIndexStatements, createTableStatements } from '../db/migrations';
import { useHardwarePosStore } from './store';
import { SplashScreen } from './screens/SplashScreen';
import { LoginUnlockScreen } from './screens/LoginUnlockScreen';
import { ShiftOpenScreen } from './screens/ShiftOpenScreen';
import { SellScreen } from './screens/SellScreen';
import { CartScreen } from './screens/CartScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { SyncCenterScreen } from './screens/SyncCenterScreen';
import { CloseShiftScreen } from './screens/CloseShiftScreen';
import { AccountManagementScreen } from './screens/AccountManagementScreen';
import { BootstrapErrorScreen } from './screens/BootstrapErrorScreen';
import { PosTextScaleProvider } from './components/PosTextScale';

const initialSyncPolicy: SyncPolicyRecord = {
    businessDayKey: new Date().toISOString().slice(0, 10),
    successfulSyncCountToday: 0,
    lastSuccessfulSyncAt: null,
    nextAllowedSyncAt: null,
    lastCheckpoint: null,
    resetHour: 0,
    resetMinute: 0
};

export const hardwarePosAppShell = {
    runtime: 'react-native',
    uiFlow: [
        'splash',
        'bootstrap_error',
        'login_unlock',
        'shift_open',
        'sell_screen',
        'cart',
        'checkout',
        'history',
        'sync_center',
        'shift_close'
    ],
    dataBoundaries: {
        localSchemaTables: hardwarePosSchema.map((table) => table.name),
        sqliteBootstrapStatements: [
            ...createTableStatements.map((statement) => statement.tableName),
            ...createIndexStatements.map((statement) => statement.name)
        ],
        syncPolicy: authorizeManualSync({ now: new Date(), policy: initialSyncPolicy })
    }
};

const HardwarePosApp = () => {
    const {
        screen,
        cashierName,
        catalog,
        cart,
        pendingHistory,
        activeShiftId,
        lastReceipt,
        syncStatusLabel,
        lastSyncMessage,
        storageMode,
        hardwareMessage,
        hardwareDiagnostics,
        offlineAuthAvailable,
        offlineCashierLabel,
        loginBaseUrl,
        companyToken,
        loginEmail,
        loading,
        syncBusy,
        currentRoleCode,
        adminAccessGranted,
        accountManagementSnapshot,
        connectivityMode,
        catalogSource,
        lastCatalogRefreshAt,
        settingsSummary,
        devicePolicySummary,
        textScale,
        setTextScale,
        bootstrap,
        unlockCashier,
        unlockOfflineCashier,
        openShift,
        addToCart,
        updateCartQuantity,
        removeFromCart,
        scanCatalogBarcode,
        refreshCatalog,
        lockSession,
        goToCart,
        backToSell,
        openReceipt,
        openHistoryReceipt,
        openHistory,
        refreshHistorySnapshot,
        openSyncCenter,
        openCloseShift,
        openAccountManagement,
        verifyAdminAccess,
        refreshAccountManagement,
        removeManagedCashier,
        clearOfflineManagedCashier,
        commitCheckout,
        runManualSync,
        printLastReceipt,
        openDrawer,
        loadHardwareDiagnostics,
        closeShift
    } = useHardwarePosStore();
    const { fontScale } = useWindowDimensions();

    useEffect(() => {
        void bootstrap();
    }, [bootstrap]);

    return (
        <PosTextScaleProvider
            scale={textScale}
            systemFontScale={fontScale}
            onScaleChange={(nextScale) => {
                void setTextScale(nextScale);
            }}
        >
            <SafeAreaView style={{ flex: 1 }}>
            {screen === 'splash' && <SplashScreen />}
            {screen === 'bootstrap_error' && (
                <BootstrapErrorScreen
                    message={hardwareMessage}
                    onRetry={() => {
                        void bootstrap();
                    }}
                />
            )}
            {screen === 'login_unlock' && (
                <LoginUnlockScreen
                    baseUrl={loginBaseUrl}
                    email={loginEmail}
                    loading={loading}
                    offlineAuthAvailable={offlineAuthAvailable}
                    offlineCashierLabel={offlineCashierLabel}
                    hardwareMessage={hardwareMessage}
                    onUnlock={unlockCashier}
                    onOfflineUnlock={unlockOfflineCashier}
                />
            )}
            {screen === 'shift_open' && (
                <ShiftOpenScreen
                    cashierName={cashierName}
                    connectivityMode={connectivityMode}
                    storageMode={storageMode}
                    hardwareMessage={hardwareMessage}
                    onOpenShift={openShift}
                />
            )}
            {(screen === 'sell_screen' || screen === 'receipt') && (
                <SellScreen
                    cashierName={cashierName}
                    catalog={catalog}
                    cart={cart.map((line) => ({
                        itemId: line.product.itemId,
                        itemName: line.product.itemName,
                        categoryName: line.product.categoryName,
                        imageUrl: line.product.imageUrl,
                        price: line.product.price,
                        quantity: line.quantity
                    }))}
                    cartCount={cart.reduce((sum, line) => sum + line.quantity, 0)}
                    pendingHistory={pendingHistory}
                    activeShiftId={activeShiftId}
                    lastReceipt={lastReceipt}
                    receiptPreviewVisible={screen === 'receipt'}
                    syncStatusLabel={syncStatusLabel}
                    storageMode={storageMode}
                    connectivityMode={connectivityMode}
                    catalogSource={catalogSource}
                    lastCatalogRefreshAt={lastCatalogRefreshAt}
                    settingsSummary={settingsSummary}
                    devicePolicySummary={devicePolicySummary}
                    hardwareMessage={hardwareMessage}
                    loading={loading}
                    onAddToCart={addToCart}
                    onUpdateCartQuantity={updateCartQuantity}
                    onRemoveFromCart={removeFromCart}
                    onScanBarcode={scanCatalogBarcode}
                    onRefreshCatalog={refreshCatalog}
                    onLockSession={lockSession}
                    onOpenCart={goToCart}
                    onCheckout={commitCheckout}
                    onOpenHistoryReceipt={openHistoryReceipt}
                    onRefreshHistory={refreshHistorySnapshot}
                    onOpenReceipt={openReceipt}
                    onPrintLastReceipt={printLastReceipt}
                    onOpenDrawer={openDrawer}
                    onOpenShift={() => openShift(0)}
                    onOpenCloseShift={openCloseShift}
                    onOpenSyncCenter={openSyncCenter}
                    onOpenAccountManagement={openAccountManagement}
                    onCloseReceiptPreview={backToSell}
                />
            )}
            {screen === 'cart' && (
                <CartScreen
                    cart={cart.map((line) => ({
                        name: line.product.itemName,
                        quantity: line.quantity,
                        price: line.product.price
                    }))}
                    onBack={backToSell}
                    onCheckout={commitCheckout}
                />
            )}
            {screen === 'history' && (
                <HistoryScreen
                    snapshot={pendingHistory}
                    onBack={backToSell}
                    onOpenSyncCenter={openSyncCenter}
                />
            )}
            {screen === 'sync_center' && (
                <SyncCenterScreen
                    snapshot={pendingHistory}
                    syncStatusLabel={syncStatusLabel}
                    lastSyncMessage={lastSyncMessage}
                    syncBusy={syncBusy}
                    connectivityMode={connectivityMode}
                    hardwareMessage={hardwareMessage}
                    hardwareDiagnostics={hardwareDiagnostics}
                    onRunSync={runManualSync}
                    onLoadDiagnostics={loadHardwareDiagnostics}
                    onBack={backToSell}
                />
            )}
            {screen === 'close_shift' && (
                <CloseShiftScreen
                    shiftId={activeShiftId}
                    syncStatusLabel={syncStatusLabel}
                    hardwareMessage={hardwareMessage}
                    onConfirmClose={closeShift}
                    onCancel={backToSell}
                />
            )}
            {screen === 'account_management' && (
                <AccountManagementScreen
                    baseUrl={loginBaseUrl}
                    loading={loading}
                    currentRoleCode={currentRoleCode}
                    adminAccessGranted={adminAccessGranted}
                    snapshot={accountManagementSnapshot}
                    hardwareMessage={hardwareMessage}
                    onVerifyAdmin={verifyAdminAccess}
                    onRefresh={refreshAccountManagement}
                    onRemoveCashier={removeManagedCashier}
                    onClearOfflineAccess={clearOfflineManagedCashier}
                    onBack={backToSell}
                />
            )}
            </SafeAreaView>
        </PosTextScaleProvider>
    );
};

export default HardwarePosApp;
