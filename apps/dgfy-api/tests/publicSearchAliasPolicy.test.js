import {
  expandPublicSearchText,
  getPublicSearchQueryVariants,
  matchCuisineCategoryHeads,
  publicSearchTextMatches
} from '../src/modules/shared/utils/publicSearchAliasPolicy.js';

describe('publicSearchAliasPolicy cuisine/category synonym groups', () => {
  it('expands a "seafood" query to related dish/ingredient terms', () => {
    const variants = getPublicSearchQueryVariants('seafood');
    expect(variants).toEqual(expect.arrayContaining(['seafood', 'shrimp', 'fish', 'crab', 'sushi']));
  });

  it('matches a store tagged/described with a related term when searching the category name', () => {
    expect(publicSearchTextMatches('fresh grilled shrimp and crab platters', 'seafood')).toBe(true);
    expect(publicSearchTextMatches('seafood specialties', 'shrimp')).toBe(true);
  });

  it('does not match unrelated text for a cuisine synonym group', () => {
    expect(publicSearchTextMatches('hardware and tools', 'seafood')).toBe(false);
  });

  it('expands italian/dessert/breakfast groups', () => {
    expect(publicSearchTextMatches('fresh pasta and pizza', 'italian')).toBe(true);
    expect(publicSearchTextMatches('cakes and pastries', 'dessert')).toBe(true);
    expect(publicSearchTextMatches('tapsilog and pancakes', 'breakfast')).toBe(true);
  });

  it('still normalizes case/punctuation the same way as before', () => {
    expect(expandPublicSearchText('Seafood!')).toContain('seafood');
  });
});

describe('matchCuisineCategoryHeads', () => {
  it('returns the category head when a sibling term is present', () => {
    expect(matchCuisineCategoryHeads('Grilled Shrimp Skewers')).toEqual(['seafood']);
    expect(matchCuisineCategoryHeads('Buttered Crab')).toEqual(['seafood']);
  });

  it('does not tag an item that only contains the head term itself (no alias needed)', () => {
    expect(matchCuisineCategoryHeads('Seafood Platter')).toEqual([]);
  });

  it('returns no heads for unrelated text', () => {
    expect(matchCuisineCategoryHeads('Beef Steak with Mashed Potatoes')).toEqual([]);
  });

  it('can return multiple heads when text spans multiple categories', () => {
    expect(matchCuisineCategoryHeads('Shrimp Pasta')).toEqual(expect.arrayContaining(['seafood', 'italian']));
  });
});
