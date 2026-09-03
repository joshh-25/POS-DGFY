import { describe, expect, it } from 'vitest';
import { resolveStockScope, getBranchZeroStockHint, buildItemsListParams } from '../branchScopedStock.js';

describe('resolveStockScope (#682)', () => {
  it('labels the default "all" selection as the tenant-wide aggregate', () => {
    const scope = resolveStockScope({ selectedLocationId: 'all' });
    expect(scope).toEqual({
      label: 'All Locations (tenant-wide total)',
      isFallbackWarning: false,
      isBranchScoped: false
    });
  });

  it('labels a resolved branch selection with the branch name', () => {
    const scope = resolveStockScope({
      selectedLocationId: '2',
      selectedLocationName: 'Balabag Branch',
      locationScopeResolved: true
    });
    expect(scope).toEqual({
      label: 'Branch: Balabag Branch',
      isFallbackWarning: false,
      isBranchScoped: true
    });
  });

  it('renders a distinct fallback-warning label when the backend could not resolve the overlay, never confused with a real branch view', () => {
    const scope = resolveStockScope({
      selectedLocationId: '2',
      selectedLocationName: 'Balabag Branch',
      locationScopeResolved: false
    });
    expect(scope.isFallbackWarning).toBe(true);
    expect(scope.isBranchScoped).toBe(false);
    expect(scope.label).not.toContain('Balabag Branch');
  });

  it('defaults to resolved (no false warning) when locationScopeResolved is not provided yet', () => {
    const scope = resolveStockScope({ selectedLocationId: '2', selectedLocationName: 'Balabag Branch' });
    expect(scope.isBranchScoped).toBe(true);
    expect(scope.isFallbackWarning).toBe(false);
  });
});

describe('getBranchZeroStockHint (#682)', () => {
  it('returns the honest-zero hint only when the scope is genuinely branch-scoped', () => {
    const hint = getBranchZeroStockHint({ isBranchScoped: true });
    expect(hint).toMatch(/receive or transfer/i);
  });

  it('returns null for the "all locations" scope', () => {
    expect(getBranchZeroStockHint({ isBranchScoped: false })).toBeNull();
  });

  it('returns null for the fallback-warning scope (a bare 0 there is not trustworthy)', () => {
    expect(getBranchZeroStockHint({ isBranchScoped: false, isFallbackWarning: true })).toBeNull();
  });
});

describe('buildItemsListParams (#682)', () => {
  it('omits location_id entirely for the default "all" selection (byte-identical to pre-#682 requests)', () => {
    expect(buildItemsListParams({ limit: 1000, selectedLocationId: 'all' })).toEqual({ limit: 1000 });
  });

  it('omits location_id when selectedLocationId is not provided', () => {
    expect(buildItemsListParams({ limit: 1000 })).toEqual({ limit: 1000 });
  });

  it('adds a numeric location_id when a branch is selected', () => {
    expect(buildItemsListParams({ limit: 1000, selectedLocationId: '2' })).toEqual({ limit: 1000, location_id: 2 });
  });

  it('omits include_inactive by default (#1495 Part A)', () => {
    expect(buildItemsListParams({ limit: 1000 })).toEqual({ limit: 1000 });
  });

  it('adds include_inactive: true only when explicitly requested (#1495 Part A)', () => {
    expect(buildItemsListParams({ limit: 1000, includeInactive: true })).toEqual({ limit: 1000, include_inactive: true });
  });
});
