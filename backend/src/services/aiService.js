/**
 * AI Service (Compatibility Facade)
 *
 * Legacy imports keep using this service path while the composition now
 * lives inside the AI module.
 */

export {
  processMessage,
  executeConfirmedAction,
  handleSpecialQueries
} from '../modules/ai/aiCore.js';

import {
  processMessage,
  executeConfirmedAction,
  handleSpecialQueries
} from '../modules/ai/aiCore.js';

export default {
  processMessage,
  executeConfirmedAction,
  handleSpecialQueries
};
