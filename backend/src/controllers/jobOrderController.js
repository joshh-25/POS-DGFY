/**
 * Job Order Controller (Compatibility Facade)
 */

export {
  getJobOrders,
  getJobOrderById,
  createJobOrder,
  finalizeJobOrder,
  completeJobOrder,
  archiveJobOrder,
  restoreJobOrder
} from '../modules/jobOrders/controllers/jobOrderHandlers.js';

import {
  getJobOrders,
  getJobOrderById,
  createJobOrder,
  finalizeJobOrder,
  completeJobOrder,
  archiveJobOrder,
  restoreJobOrder
} from '../modules/jobOrders/controllers/jobOrderHandlers.js';

export default {
  getJobOrders,
  getJobOrderById,
  createJobOrder,
  finalizeJobOrder,
  completeJobOrder,
  archiveJobOrder,
  restoreJobOrder
};
