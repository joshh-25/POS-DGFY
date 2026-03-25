export const shouldShowMigrateToPayMongoSection = ({ company, isMasterAdmin }) => (
  Boolean(isMasterAdmin && company?.payment_method !== 'paymongo')
);

// Backward-compatible alias while remaining pages/tests are still being migrated.
export const shouldShowMigrateToPayPalSection = (args) => shouldShowMigrateToPayMongoSection(args);
