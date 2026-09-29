import { useCallback, useEffect, useRef, useState } from 'react';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import {
  fetchPosDiscountApprovers,
  fetchPosDiscountEmployees,
  fetchPosDiscountRules,
} from '../services/posService.js';

const toArray = (value) => (Array.isArray(value) ? value : []);

export const usePosDiscountDirectory = ({ autoLoad = false } = {}) => {
  const [discountApprovers, setDiscountApprovers] = useState([]);
  const [discountEmployees, setDiscountEmployees] = useState([]);
  const [discountRules, setDiscountRules] = useState([]);
  const [discountRulesReady, setDiscountRulesReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const autoLoadRequestedRef = useRef(false);

  const loadDiscountDirectory = useCallback(async () => {
    setLoading(true);
    try {
      const [approvers, employees, rules] = await Promise.all([
        fetchPosDiscountApprovers(),
        fetchPosDiscountEmployees(),
        fetchPosDiscountRules(),
      ]);
      const result = {
        approvers: toArray(approvers),
        employees: toArray(employees),
        rules: toArray(rules),
      };
      setDiscountApprovers(result.approvers);
      setDiscountEmployees(result.employees);
      setDiscountRules(result.rules);
      setDiscountRulesReady(true);
      return result;
    } catch (error) {
      setDiscountApprovers([]);
      setDiscountEmployees([]);
      setDiscountRules([]);
      setDiscountRulesReady(false);
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
      toast.error('Unable to load the POS discount directory.');
    });
  }, [autoLoad, discountApprovers.length, discountEmployees.length, loadDiscountDirectory]);

  return {
    discountApprovers,
    discountEmployees,
    discountRules,
    discountRulesReady,
    discountApproversLoading: loading,
    discountEmployeesLoading: loading,
    loadDiscountDirectory,
  };
};

export default usePosDiscountDirectory;
