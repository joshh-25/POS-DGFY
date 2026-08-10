import db from '../src/models/index.js';

describe('EngagementEvent model schema contract', () => {
    it('exposes expanded telemetry columns required for phase 2', () => {
        const attributes = db.EngagementEvent.rawAttributes;

        [
            'event_category',
            'event_version',
            'request_id',
            'trace_id',
            'outcome',
            'failure_code',
            'failure_reason',
            'provider_event_id',
            'provider_event_time',
            'ingested_at',
            'processed_at',
            'environment',
            'surface',
            'platform',
            'actor_type',
            'is_internal_actor',
            'is_bot_suspected',
            'session_id',
            'experiment_key',
            'variant_key',
            'exposure_id'
        ].forEach((column) => {
            expect(attributes[column]).toBeDefined();
        });

        expect(attributes.event_version.allowNull).toBe(false);
        expect(attributes.ingested_at.allowNull).toBe(false);
    });
});
