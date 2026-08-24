import { useMemo } from 'react';
import {
  buildDiscoveryBusinessModeOptions,
  DISCOVERY_DISTANCE_FILTER_OPTIONS,
  DISCOVERY_SORT_LABEL_BY_VALUE
} from '../model/discoveryFilterOptions.js';

export function useDiscoveryFilterOptions({
  workflowModeLabels,
  workflowModeSelectValues
}) {
  const discoveryBusinessModeOptions = useMemo(() => buildDiscoveryBusinessModeOptions({
    workflowModeLabels,
    workflowModeSelectValues
  }), [workflowModeLabels, workflowModeSelectValues]);

  return {
    discoveryBusinessModeOptions,
    discoveryDistanceFilterOptions: DISCOVERY_DISTANCE_FILTER_OPTIONS,
    discoverySortLabelByValue: DISCOVERY_SORT_LABEL_BY_VALUE
  };
}
