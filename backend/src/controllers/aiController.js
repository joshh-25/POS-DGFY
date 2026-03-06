/**
 * AI Controller (Compatibility Facade)
 *
 * Legacy route bindings continue importing this file while implementation
 * lives in the modular AI controller under src/modules/ai/controllers.
 */

export {
  chat,
  confirmAction,
  cancelAction,
  getConversations,
  getConversation,
  deleteConversation,
  downloadExport,
  getDiagnostics,
  cleanupExpiredData,
  startAiCleanupScheduler,
  stopAiCleanupScheduler,
  encapsulateFileContent
} from '../modules/ai/controllers/aiTransportHandlers.js';

import {
  chat,
  confirmAction,
  cancelAction,
  getConversations,
  getConversation,
  deleteConversation,
  getDiagnostics,
  cleanupExpiredData,
  startAiCleanupScheduler,
  stopAiCleanupScheduler
} from '../modules/ai/controllers/aiTransportHandlers.js';

export default {
  chat,
  confirmAction,
  cancelAction,
  getConversations,
  getConversation,
  deleteConversation,
  getDiagnostics,
  cleanupExpiredData,
  startAiCleanupScheduler,
  stopAiCleanupScheduler
};
