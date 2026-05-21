/**
 * AI Tool Executor (Compatibility Facade)
 *
 * Legacy imports continue to use this service path while core execution
 * now lives in AI module use-cases.
 */

import logger from '../config/logger.js';
import * as auditService from './auditService.js';
import { applyToolAudit } from '../modules/ai/usecases/toolExecutionAudit.js';
import { executeRegistryTool } from '../modules/ai/usecases/toolHandlers/toolRegistryMap.js';
import { buildExecuteAiToolUseCase } from '../modules/ai/usecases/executeAiToolUseCase.js';

const executeAiToolUseCase = buildExecuteAiToolUseCase({
  logger,
  applyToolAudit,
  executeRegistryTool,
  auditService
});

export const execute = async (toolName, args, user) => {
  return executeAiToolUseCase({ toolName, args, user });
};

export default {
  execute
};
