import { describe, expect, it } from 'vitest';
import {
  scoreStoresByRelevance,
  getRelevanceWeightedDistanceRank,
  RELEVANCE_DISTANCE_PENALTY_KM
} from '../discovery/model/discoverySearchRanking.js';

describe('discovery search relevance ranking', () => {
  const farButGoodMatch = {
    tenant_name: 'Sisig Express',
    storefront_categories: ['food'],
    matching_item_sample: [{ name: 'Pork Sisig' }],
    address_line: 'Iloilo City',
    nearest_distance_km: 5
  };
  const nearButPoorMatch = {
    tenant_name: 'Unrelated Pharmacy',
    storefront_categories: ['pharmacy'],
    matching_item_sample: [],
    address_line: 'Iloilo City',
    nearest_distance_km: 0.5
  };
  const nearAndGoodMatch = {
    tenant_name: 'Sisig House',
    storefront_categories: ['food'],
    matching_item_sample: [{ name: 'Sisig Rice Bowl' }],
    address_line: 'Iloilo City',
    nearest_distance_km: 1
  };

  it('scores every store at 0 relevance when the query is empty', () => {
    const scores = scoreStoresByRelevance([farButGoodMatch, nearButPoorMatch], '');
    expect(scores.get(farButGoodMatch)).toBe(0);
    expect(scores.get(nearButPoorMatch)).toBe(0);
  });

  it('gives a strong textual match a lower score than an unrelated store', () => {
    const scores = scoreStoresByRelevance([farButGoodMatch, nearButPoorMatch], 'sisig');
    expect(scores.get(farButGoodMatch)).toBeLessThan(scores.get(nearButPoorMatch));
  });

  it('keeps distance as the dominant signal with no query', () => {
    const scores = scoreStoresByRelevance([nearAndGoodMatch, farButGoodMatch], '');
    const nearRank = getRelevanceWeightedDistanceRank(nearAndGoodMatch, scores);
    const farRank = getRelevanceWeightedDistanceRank(farButGoodMatch, scores);
    expect(nearRank).toBe(nearAndGoodMatch.nearest_distance_km);
    expect(nearRank).toBeLessThan(farRank);
  });

  it('lets a nearby strong match outrank a nearby weak match for the same query', () => {
    const scores = scoreStoresByRelevance([nearButPoorMatch, nearAndGoodMatch], 'sisig');
    const poorRank = getRelevanceWeightedDistanceRank(nearButPoorMatch, scores);
    const goodRank = getRelevanceWeightedDistanceRank(nearAndGoodMatch, scores);
    expect(goodRank).toBeLessThan(poorRank);
  });

  it('still lets a much nearer weak match win over a far strong match', () => {
    const scores = scoreStoresByRelevance([nearButPoorMatch, farButGoodMatch], 'sisig');
    const nearRank = getRelevanceWeightedDistanceRank(nearButPoorMatch, scores);
    const farRank = getRelevanceWeightedDistanceRank(farButGoodMatch, scores);
    expect(nearRank).toBe(nearButPoorMatch.nearest_distance_km + RELEVANCE_DISTANCE_PENALTY_KM);
    expect(nearRank).toBeLessThan(farRank);
  });
});
