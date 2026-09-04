import { getUomShortLabel, normalizeUom } from './uomConverter';

const STRICT_SHORT_MAP = Object.freeze({
  units: 'u',
  dozen: 'doz',
});

export const toUomAbbreviation = (uom, fallback = 'u') => {
  const normalized = normalizeUom(uom);
  const shortLabel = getUomShortLabel(normalized || uom || '');
  const mapped = STRICT_SHORT_MAP[shortLabel] || shortLabel;
  return (mapped || fallback).trim();
};

export default {
  toUomAbbreviation,
};
