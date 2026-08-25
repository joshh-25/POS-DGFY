import { useCallback, useEffect, useRef, useState } from 'react';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import {
  fetchPosDiscountApprovers,
  fetchPosDiscountEmployees,
} from '../services/posService.js';

const toArray = (value) => (Array.isArray(value) ? value : []);

export const usePosDiscountDirectory = ({ autoLoad = false } = {}) => {
  const [discountApprovers, setDiscountApprovers] = useState([]);
  const [discountEmployees, setDiscountEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const autoLoadRequestedRef = useRef(false);

  const loadDiscountDirectory = useCallback(async () => {
    setLoading(true);
    try {
      const [approvers, employees] = await Promise.all([
        fetchPosDiscountApprovers(),
        fetchPosDiscountEmployees(),
      ]);
      const result = {
        approvers: toArray(approvers),
        employees: toArray(employees),
      };
      setDiscountApprovers(result.approvers);
      setDiscountEmployees(result.employees);
      return result;
    } catch (error) {
      setDiscountApprovers([]);
      setDiscountEmployees([]);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!autoLoad
      || (discountApprovers.length > 0 && discountEmployees.length > 0)
      || autoLoadRequestedRef.current) return;
    autoLoadRequestedRef.current = true;
    loadDiscountDirectory().catch(() => {
      autoLoadRequestedRef.current = false;
      toast.error('Unable to load discount employees.');
    });
  }, [autoLoad, discountApprovers.length, discountEmployees.length, loadDiscountDirectory]);

  return {
    discountApprovers,
    discountEmployees,
    discountApproversLoading: loading,
    discountEmployeesLoading: loading,
    loadDiscountDirectory,
  };
};

export default usePosDiscountDirectory;
