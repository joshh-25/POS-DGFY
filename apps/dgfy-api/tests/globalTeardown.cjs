const path = require('path');
const { pathToFileURL } = require('url');

const importModule = (relativePath) => {
  const absolutePath = path.resolve(__dirname, '..', relativePath);
  return import(pathToFileURL(absolutePath).href);
};

module.exports = async () => {
  try {
    const aiController = await importModule('src/controllers/aiController.js');
    aiController.stopAiCleanupScheduler?.();
  } catch {
    // best-effort cleanup
  }

  try {
    const tenantConnectorModule = await importModule('src/utils/TenantConnector.js');
    await tenantConnectorModule.default?.closeAll?.();
  } catch {
    // best-effort cleanup
  }

  try {
    const redisModule = await importModule('src/config/redis.js');
    await redisModule.closeRedis?.();
  } catch {
    // best-effort cleanup
  }

  try {
    const databaseModule = await importModule('src/config/database.js');
    await databaseModule.default?.close?.();
  } catch {
    // best-effort cleanup
  }
};
