import { aiConversationRepository } from './repositories/aiConversationRepository.js';
import { pendingAIActionRepository } from './repositories/pendingAIActionRepository.js';
import logger from '../../config/logger.js';
import { buildChatUseCase } from './usecases/chatUseCase.js';
import { buildConfirmActionUseCase } from './usecases/confirmActionUseCase.js';
import { buildCancelActionUseCase } from './usecases/cancelActionUseCase.js';
import { buildGetConversationsUseCase } from './usecases/getConversationsUseCase.js';
import { buildGetConversationUseCase } from './usecases/getConversationUseCase.js';
import { buildDeleteConversationUseCase } from './usecases/deleteConversationUseCase.js';
import { buildCleanupExpiredDataUseCase } from './usecases/cleanupExpiredDataUseCase.js';
import { buildDownloadExportUseCase } from './usecases/downloadExportUseCase.js';
import { buildGetDiagnosticsUseCase } from './usecases/getDiagnosticsUseCase.js';
import { processMessage, executeConfirmedAction } from './aiCore.js';
import { buildPersistChatTurnUseCase } from './usecases/persistChatTurnUseCase.js';
import { buildAppendConfirmedActionConversationUseCase } from './usecases/appendConfirmedActionConversationUseCase.js';
import { buildAppendCancelledActionConversationUseCase } from './usecases/appendCancelledActionConversationUseCase.js';

export const persistChatTurnUseCase = buildPersistChatTurnUseCase({
    pendingAIActionRepository,
    aiConversationRepository
});

export const chatUseCase = buildChatUseCase({
    aiConversationRepository,
    pendingAIActionRepository,
    processMessage,
    persistChatTurn: persistChatTurnUseCase
});

export const executeConfirmedActionUseCase = executeConfirmedAction;

export const appendConfirmedActionConversationUseCase = buildAppendConfirmedActionConversationUseCase({
    aiConversationRepository,
    processMessage,
    logger
});

export const appendCancelledActionConversationUseCase = buildAppendCancelledActionConversationUseCase({
    aiConversationRepository
});

export const cancelActionUseCase = buildCancelActionUseCase({
    pendingAIActionRepository,
    aiConversationRepository,
    appendCancelledActionConversation: appendCancelledActionConversationUseCase
});

export const confirmActionUseCase = buildConfirmActionUseCase({
    pendingAIActionRepository,
    aiConversationRepository,
    executeConfirmedAction: executeConfirmedActionUseCase,
    processMessage,
    appendConfirmedActionConversation: appendConfirmedActionConversationUseCase,
    logger
});

export const getConversationsUseCase = buildGetConversationsUseCase({
    aiConversationRepository
});

export const getConversationUseCase = buildGetConversationUseCase({
    aiConversationRepository
});

export const deleteConversationUseCase = buildDeleteConversationUseCase({
    aiConversationRepository,
    pendingAIActionRepository
});

export const cleanupExpiredDataUseCase = buildCleanupExpiredDataUseCase({
    aiConversationRepository,
    pendingAIActionRepository
});

export const downloadExportUseCase = buildDownloadExportUseCase({
    getTemporaryFile: async (fileId, userId) => {
        const tempFileService = await import('../../services/tempFileService.js');
        return tempFileService.getTemporaryFile(fileId, userId);
    }
});

export const getDiagnosticsUseCase = buildGetDiagnosticsUseCase({
    runDiagnostics: async (user) => {
        const { runDiagnostics } = await import('../../services/aiDiagnosticsService.js');
        return runDiagnostics(user);
    }
});

export * from './contracts/aiConversationRepository.contract.js';
export * from './contracts/pendingAIActionRepository.contract.js';
export * from './repositories/aiConversationRepository.js';
export * from './repositories/pendingAIActionRepository.js';
