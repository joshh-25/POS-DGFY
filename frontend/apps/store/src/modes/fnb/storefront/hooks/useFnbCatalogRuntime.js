import { useEffect, useMemo, useRef, useState } from 'react';
import { buildFnbCatalogPresentation } from '../model/buildFnbCatalogPresentation.js';

/**
 * Owns F&B catalog-only presentation state. Shared catalog data remains in the
 * storefront shell because other modes use the same backend source.
 */
export function useFnbCatalogRuntime({
  activeSection,
  catalogSearch,
  fnbViewModel,
  routeSlug,
  selectedLocationId
}) {
  const [fnbPage, setFnbPage] = useState(1);
  const [fnbPageSize, setFnbPageSize] = useState(8);
  const [fnbSortOption, setFnbSortOption] = useState('name_asc');
  const [fnbViewMode, setFnbViewMode] = useState('list');
  const [isFnbCategoryDropdownOpen, setIsFnbCategoryDropdownOpen] = useState(false);
  const fnbCategoryDropdownRef = useRef(null);
  const previousRouteSlugRef = useRef(routeSlug);

  useEffect(() => {
    const previousRouteSlug = previousRouteSlugRef.current;
    if (previousRouteSlug && routeSlug && previousRouteSlug !== routeSlug) {
      // Route replacement intentionally resets F&B-only presentation choices.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFnbSortOption('name_asc');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFnbPage(1);
    }
    previousRouteSlugRef.current = routeSlug;
  }, [routeSlug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFnbPage(1);
  }, [activeSection, catalogSearch, fnbPageSize, fnbSortOption, routeSlug, selectedLocationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsFnbCategoryDropdownOpen(false);
  }, [activeSection, catalogSearch, fnbSortOption, routeSlug, selectedLocationId]);

  useEffect(() => {
    if (!isFnbCategoryDropdownOpen) return undefined;
    const handlePointerDown = (event) => {
      if (fnbCategoryDropdownRef.current && !fnbCategoryDropdownRef.current.contains(event.target)) {
        setIsFnbCategoryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isFnbCategoryDropdownOpen]);

  const catalogPresentation = useMemo(() => buildFnbCatalogPresentation({
    activeSection,
    fnbViewModel,
    page: fnbPage,
    pageSize: fnbPageSize,
    sortOption: fnbSortOption
  }), [activeSection, fnbPage, fnbPageSize, fnbSortOption, fnbViewModel]);

  return {
    catalogPresentation,
    fnbCategoryDropdownRef,
    fnbPage,
    fnbPageSize,
    fnbSortOption,
    fnbViewMode,
    isFnbCategoryDropdownOpen,
    setFnbPage,
    setFnbPageSize,
    setFnbSortOption,
    setFnbViewMode,
    setIsFnbCategoryDropdownOpen
  };
}
