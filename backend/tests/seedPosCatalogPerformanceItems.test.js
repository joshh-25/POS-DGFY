import {
  assertLocalMutationAllowed,
  parseArgs
} from '../scripts/seed-pos-catalog-performance-items.js';

describe('POS catalog performance seed safeguards', () => {
  it('parses explicit apply and tenant targeting arguments', () => {
    expect(parseArgs([
      '--apply',
      '--allow-local-mutation',
      '--tenant-id=tenant-local',
      '--batch-id=batch-1'
    ])).toEqual({
      apply: true,
      cleanup: false,
      allowLocalMutation: true,
      tenantId: 'tenant-local',
      batchId: 'batch-1'
    });
  });

  it('allows an explicitly approved localhost mutation outside production', () => {
    expect(() => assertLocalMutationAllowed({
      host: '127.0.0.1',
      nodeEnv: 'development',
      allowLocalMutation: true
    })).not.toThrow();
  });

  it.each(['db.example.com', '10.0.0.20'])('rejects non-local database host %s', (host) => {
    expect(() => assertLocalMutationAllowed({
      host,
      nodeEnv: 'development',
      allowLocalMutation: true
    })).toThrow(/non-local DB host/);
  });

  it('rejects production even when the database host is local', () => {
    expect(() => assertLocalMutationAllowed({
      host: 'localhost',
      nodeEnv: 'production',
      allowLocalMutation: true
    })).toThrow(/NODE_ENV=production/);
  });

  it('requires the explicit local mutation acknowledgement', () => {
    expect(() => assertLocalMutationAllowed({
      host: 'localhost',
      nodeEnv: 'development',
      allowLocalMutation: false
    })).toThrow(/allow-local-mutation/);
  });
});
