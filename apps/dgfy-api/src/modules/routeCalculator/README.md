# Route Calculator Module

Proxies road-routing requests to a self-hosted GraphHopper instance (`ROUTE_CALCULATOR_ENDPOINT`) so the storefront can show a customer the real driving distance/ETA/route line from their location to a store, instead of a straight-line estimate.

Flow:

`routes/routeCalculator.js -> controllers/routeCalculatorHandlers.js -> usecases/routeCalculatorUseCases.js -> repositories/routeCalculatorRepository.js -> GraphHopper`

## Files

| File | Responsibility |
|---|---|
| `index.js` | Instantiates `calculateRouteUseCase` with the injected repository (DI entry point) |
| `controllers/routeCalculatorHandlers.js` | Express handler; delegates to use case, responds via `sendUseCaseResult` |
| `usecases/routeCalculatorUseCases.js` | Builder-pattern use case; checks the feature is configured, maps repository failures to domain error codes |
| `repositories/routeCalculatorRepository.js` | Calls GraphHopper's `GET /route`, maps the response into `{ distance_meters, duration_seconds, geometry, instructions }` |

## GraphHopper contract

`GET {ROUTE_CALCULATOR_ENDPOINT}/route?point=lat,lng&point=lat,lng&profile=car&points_encoded=false&locale=en`

- `points_encoded=false` makes GraphHopper return `paths[0].points` as a ready-to-use GeoJSON `LineString` — no polyline decoding needed.
- The live instance behind `ROUTE_CALCULATOR_ENDPOINT` only has a `car` profile configured (`GET /info`). `ROUTE_CALCULATOR_SUPPORTED_PROFILES` in `config/routeCalculatorFeature.js` reflects that; requesting any other profile is rejected at validation time (422) rather than forwarded.

## Error mapping

| Repository error code | Domain error | HTTP |
|---|---|---|
| `ROUTE_CALCULATOR_DISABLED` | `SERVICE_UNAVAILABLE` | 503 |
| `ROUTE_TIMEOUT` | `SERVICE_UNAVAILABLE` | 503 |
| `ROUTE_UNREACHABLE` | `SERVICE_UNAVAILABLE` | 503 |
| `ROUTE_NOT_FOUND` (GraphHopper 4xx or empty `paths`) | `VALIDATION_FAILED` | 422 |

The frontend hook (`useStoreRoute.js`) treats all of these as "no route available" and falls back to the existing straight-line/Google-Maps-link behavior — it never blocks rendering the storefront or discovery map.

## Related

- Config: `backend/src/config/routeCalculatorFeature.js`
- Route: `backend/src/routes/routeCalculator.js`
- Validator: `backend/src/validators/routeCalculatorValidator.js`
- Rate limiter: `routeCalculatorLimiter` in `backend/src/middleware/rateLimiter.js`
- Plan: `PLANS/ROUTE_PLANNING_IMPLEMENTATION_PLAN.md`
