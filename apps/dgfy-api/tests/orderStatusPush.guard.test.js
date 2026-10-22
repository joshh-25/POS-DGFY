import { STATUS_COPY, PUSH_NOTIFICATION_STATUSES } from '../src/modules/pushDelivery/utils/orderStatusCopy.js';

describe('customer order push allowlist', () => {
  it('only pushes statuses with copy and excludes internal handoff states', () => {
    PUSH_NOTIFICATION_STATUSES.forEach((status) => expect(STATUS_COPY).toHaveProperty(status));
    expect(PUSH_NOTIFICATION_STATUSES.has('ready_for_rider')).toBe(false);
    expect(PUSH_NOTIFICATION_STATUSES.has('packed')).toBe(false);
  });
});
