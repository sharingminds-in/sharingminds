import { describe, expect, it } from 'vitest';

import { mapEgressStatus } from '@/lib/livekit/egress-event-sync';

describe('egress event sync helpers', () => {
  it('treats a failed egress_ended event as failed', () => {
    expect(mapEgressStatus('EGRESS_FAILED', 'egress_ended')).toBe('failed');
    expect(mapEgressStatus(4, 'egress_ended')).toBe('failed');
  });

  it('treats a successful egress_ended event as completed', () => {
    expect(mapEgressStatus('EGRESS_COMPLETE', 'egress_ended')).toBe('completed');
    expect(mapEgressStatus(3, 'egress_ended')).toBe('completed');
  });
});
