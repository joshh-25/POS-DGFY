import * as supplierService from '../../services/supplierService.js';
import {
  buildGetSuppliersUseCase,
  buildGetSupplierByIdUseCase,
  buildCreateSupplierUseCase,
  buildUpdateSupplierUseCase,
  buildFinalizeSupplierUseCase,
  buildAddSupplierItemUseCase,
  buildDeleteSupplierUseCase
} from './usecases/supplierUseCases.js';

export const getSuppliersUseCase = buildGetSuppliersUseCase({ supplierService });
export const getSupplierByIdUseCase = buildGetSupplierByIdUseCase({ supplierService });
export const createSupplierUseCase = buildCreateSupplierUseCase({ supplierService });
export const updateSupplierUseCase = buildUpdateSupplierUseCase({ supplierService });
export const finalizeSupplierUseCase = buildFinalizeSupplierUseCase({ supplierService });
export const addSupplierItemUseCase = buildAddSupplierItemUseCase({ supplierService });
export const deleteSupplierUseCase = buildDeleteSupplierUseCase({ supplierService });
