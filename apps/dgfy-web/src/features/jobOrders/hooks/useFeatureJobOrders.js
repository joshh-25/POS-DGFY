import {
  useJobOrders,
  useCreateJobOrder,
  useCompleteJobOrder,
  useCreateJobOrderDraft,
  useFinalizeJobOrder,
  useArchiveJobOrder,
  useRestoreJobOrder,
} from '../../../hooks/useJobOrders.js';
import { useItems } from '../../../hooks/useItems.js';

export const useFeatureJobOrders = (params = {}) => useJobOrders(params);
export const useFeatureCreateJobOrder = () => useCreateJobOrder();
export const useFeatureCompleteJobOrder = () => useCompleteJobOrder();
export const useFeatureCreateJobOrderDraft = () => useCreateJobOrderDraft();
export const useFeatureFinalizeJobOrder = () => useFinalizeJobOrder();
export const useFeatureArchiveJobOrder = () => useArchiveJobOrder();
export const useFeatureRestoreJobOrder = () => useRestoreJobOrder();
export const useFeatureJobOrderItems = (params = {}) => useItems(params);

export default useFeatureJobOrders;
