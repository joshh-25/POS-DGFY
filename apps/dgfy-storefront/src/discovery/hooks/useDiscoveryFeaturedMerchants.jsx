import { useMemo, useRef, useState } from 'react';
import { HeartHandshake, ShoppingCart, UtensilsCrossed, Wrench, Zap } from 'lucide-react';
import { buildFeaturedDiscoveryStores } from '../model/discoveryStoreResultsModel.js';

const FEATURED_CATEGORY_OPTIONS = [
  { key: 'all', label: 'All Categories', icon: null },
  { key: 'food', label: 'Food', icon: <UtensilsCrossed size={14} /> },
  { key: 'grocery', label: 'Grocery', icon: <ShoppingCart size={14} /> },
  { key: 'pharmacy', label: 'Pharmacy', icon: <HeartHandshake size={14} /> },
  { key: 'services', label: 'Services', icon: <Wrench size={14} /> },
  { key: 'electronics', label: 'Electronics', icon: <Zap size={14} /> }
];

export function useDiscoveryFeaturedMerchants({ normalizeStorefrontCategories }) {
  const featuredCarouselRef = useRef(null);
  const featuredCategoryRailRef = useRef(null);
  const featuredSectionRef = useRef(null);
  const [featuredCategoryFilter, setFeaturedCategoryFilter] = useState('all');
  const [featuredBaseStores, setFeaturedBaseStores] = useState([]);

  const handleFeaturedCategoryFilter = (event, categoryKey) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setFeaturedCategoryFilter(String(categoryKey || 'all'));
    featuredSectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  };

  const featuredVisibleStores = useMemo(() => buildFeaturedDiscoveryStores({
    featuredBaseStores,
    featuredCategoryFilter,
    normalizeStorefrontCategories
  }), [featuredBaseStores, featuredCategoryFilter, normalizeStorefrontCategories]);

  return {
    featuredCarouselRef,
    featuredCategoryFilter,
    featuredCategoryOptions: FEATURED_CATEGORY_OPTIONS,
    featuredCategoryRailRef,
    featuredSectionRef,
    featuredVisibleStores,
    handleFeaturedCategoryFilter,
    setFeaturedBaseStores
  };
}
