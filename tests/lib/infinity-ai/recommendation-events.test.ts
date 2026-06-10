import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: dbMocks.insert,
  },
}));

vi.mock('@/lib/db/schema', () => {
  const table = {};

  return {
    aiConversations: table,
    aiGraphRuns: table,
    aiMemoryItems: table,
    aiRecommendationCandidates: table,
    aiRecommendationEvents: {
      idempotencyKey: 'idempotency_key',
    },
    aiRecommendationRuns: table,
    aiTurns: table,
    aiUserSignals: table,
    sessions: table,
  };
});

import { recordRecommendationEvent } from '@/lib/infinity-ai/repository';

describe('Infinity AI recommendation event persistence', () => {
  beforeEach(() => {
    dbMocks.insert.mockReset();
    dbMocks.values.mockReset();
    dbMocks.onConflictDoNothing.mockReset();
    dbMocks.insert.mockReturnValue({ values: dbMocks.values });
    dbMocks.values.mockReturnValue({ onConflictDoNothing: dbMocks.onConflictDoNothing });
  });

  it.each(['impression', 'click'] as const)(
    'writes resource %s event identifiers as direct columns',
    async (eventType) => {
      const resourceId = '66666666-6666-6666-6666-666666666666';

      await recordRecommendationEvent({
        conversationId: '11111111-1111-1111-1111-111111111111',
        runId: '22222222-2222-2222-2222-222222222222',
        userId: null,
        candidateType: 'resource',
        entityId: resourceId,
        resourceType: 'course',
        resourceId,
        eventType,
        idempotencyKey: `event:${eventType}:${resourceId}`,
        metadata: {
          surface: 'landing_page',
        },
      });

      expect(dbMocks.values).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: '11111111-1111-1111-1111-111111111111',
          runId: '22222222-2222-2222-2222-222222222222',
          userId: null,
          mentorProfileId: null,
          mentorUserId: null,
          candidateType: 'resource',
          entityId: resourceId,
          resourceType: 'course',
          resourceId,
          eventType,
          idempotencyKey: `event:${eventType}:${resourceId}`,
          metadata: expect.objectContaining({
            surface: 'landing_page',
            candidateType: 'resource',
            entityId: resourceId,
            resourceType: 'course',
            resourceId,
          }),
        })
      );
      expect(dbMocks.onConflictDoNothing).toHaveBeenCalledWith({
        target: 'idempotency_key',
      });
    }
  );
});
