export const ARCHITECTURE_CONTROLLER_NAMING_ALLOWLIST = Object.freeze([
    'src/modules/shared/controllers/useCaseResponder.js'
]);

export const ARCHITECTURE_USECASE_SERVICE_IMPORT_ALLOWLIST = Object.freeze([
    'src/modules/ai/usecases/toolHandlers/toolRegistryMap.js',
    'src/modules/payments/usecases/handleWebhookUseCase.js',
    'src/modules/payments/usecases/upgradeToPremiumUseCase.js',
    'src/modules/tenants/usecases/registerCompanyRequestUseCase.js',
    // TODO(Phase 2): Remove when stockMovementService is modularized into inventory use-cases
    'src/modules/purchaseOrders/usecases/receivePurchaseOrderUseCase.js'
]);

export default Object.freeze({
    controllerNaming: ARCHITECTURE_CONTROLLER_NAMING_ALLOWLIST,
    usecaseLegacyServiceImports: ARCHITECTURE_USECASE_SERVICE_IMPORT_ALLOWLIST
});
