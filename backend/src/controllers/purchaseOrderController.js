/**
 * Purchase Order Controller (Compatibility Facade)
 */

export {
  getPurchaseOrders,
  getPurchaseOrderById,
  createPurchaseOrder,
  finalizePurchaseOrder,
  receivePurchaseOrder,
  archivePurchaseOrder,
  restorePurchaseOrder
} from '../modules/purchaseOrders/controllers/purchaseOrderHandlers.js';

import {
  getPurchaseOrders,
  getPurchaseOrderById,
  createPurchaseOrder,
  finalizePurchaseOrder,
  receivePurchaseOrder,
  archivePurchaseOrder,
  restorePurchaseOrder
} from '../modules/purchaseOrders/controllers/purchaseOrderHandlers.js';

export default {
  getPurchaseOrders,
  getPurchaseOrderById,
  createPurchaseOrder,
  finalizePurchaseOrder,
  receivePurchaseOrder,
  archivePurchaseOrder,
  restorePurchaseOrder
};
