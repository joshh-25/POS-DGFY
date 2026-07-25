export const buildSimpleFallbackReasons = ({ categories = [], catalog = [] } = {}) => {
  const reasons = [];
  if (Array.isArray(categories) && categories.length > 0) {
    reasons.push(...categories.slice(0, 2));
  }
  const normalizedCatalog = Array.isArray(catalog) ? catalog : [];
  const productCount = normalizedCatalog.length;
  if (productCount > 0) {
    reasons.push(`${productCount} products currently available`);
  }
  const uniqueGroups = [...new Set(normalizedCatalog
    .map((item) => String(item?.categoryMeta?.label || item?.category_name || item?.category || '').trim())
    .filter(Boolean))];
  if (uniqueGroups.length > 0) {
    reasons.push(...uniqueGroups.slice(0, 2).map((label) => `${label} selections ready`));
  }
  return [...new Set(reasons.map((entry) => String(entry || '').trim()).filter(Boolean))].slice(0, 4);
};
