/**
 * Stub for the Phase 298 server-authoritative `image_client_conversion` rollout flag
 * (off | opt_in | on). Phase 298 replaces this with a real bootstrap-response-driven
 * getter; until then this module must compile and stay inert by default. Do not wire
 * this into any bootstrap/runtime-config plumbing before Phase 298 exists -- that
 * coupling is Phase 298's own job, not this one's (epic #265, Phase 296).
 */
export const getImageClientConversionFlag = () => 'off';
