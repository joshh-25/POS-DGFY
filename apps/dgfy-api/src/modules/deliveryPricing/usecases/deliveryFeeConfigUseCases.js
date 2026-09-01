import { resolveDeliveryFeeConfig } from '../domain/deliveryFeeConfig.js';

// Phase 233 (#1324, epic #1321). Thin, dependency-free DI wrapper over the pure
// resolveDeliveryFeeConfig normalizer -- exists so this module satisfies the standard
// modules/<name>/{controllers,usecases,repositories} layer shape
// (apps/dgfy-api/scripts/check-architecture-guardrails.js's moduleStructure rule) even though this
// phase has no I/O of its own to inject yet. Later phases (#237 calculated/free-mode wiring
// onward) extend this factory with real dependencies (a road-distance repository, a resolved
// per-location override source) rather than replacing it -- builder-pattern to match every other
// use case in this codebase (buildResolveDeliveryFeeConfigUseCase, not a bare export), even though
// this one currently takes no constructor dependencies.
export const buildResolveDeliveryFeeConfigUseCase = () => (params) => resolveDeliveryFeeConfig(params);
