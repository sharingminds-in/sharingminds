import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getConversationForActor, listConversationTurns, listRecentMemoryItems, enforceFeature } =
  vi.hoisted(() => ({
    getConversationForActor: vi.fn(),
    listConversationTurns: vi.fn(),
    listRecentMemoryItems: vi.fn(),
    enforceFeature: vi.fn(),
  }));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock('@/lib/infinity-ai/repository', () => ({
  getConversationForActor,
  listConversationTurns,
  listRecentMemoryItems,
}));

vi.mock('@/lib/subscriptions/policy-runtime', () => ({
  enforceFeature,
  isSubscriptionPolicyError: vi.fn(() => true),
}));

import { buildInfinityPolicyContext } from '@/lib/infinity-ai/policy';

const anonymousActor = {
  userId: null,
  anonymousSessionId: 'anon-1',
  surface: 'landing_page',
  authenticated: false,
};

const conversation = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  userId: null,
  anonymousSessionId: 'anon-1',
  surface: 'landing_page',
  status: 'active',
  phase: 'discovery',
  depthMode: 'light',
  signalSnapshot: {},
  memorySnapshot: {},
  readinessSnapshot: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('buildInfinityPolicyContext anonymous expert preview', () => {
  const originalEnv = {
    INFINITY_AI_ENABLED: process.env.INFINITY_AI_ENABLED,
    INFINITY_AI_ANONYMOUS_ENABLED: process.env.INFINITY_AI_ANONYMOUS_ENABLED,
    INFINITY_AI_ANONYMOUS_EXPERT_PREVIEW_ENABLED:
      process.env.INFINITY_AI_ANONYMOUS_EXPERT_PREVIEW_ENABLED,
    INFINITY_AI_CROSS_CHAT_MEMORY_ENABLED: process.env.INFINITY_AI_CROSS_CHAT_MEMORY_ENABLED,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INFINITY_AI_ENABLED = 'true';
    process.env.INFINITY_AI_ANONYMOUS_ENABLED = 'true';
    delete process.env.INFINITY_AI_CROSS_CHAT_MEMORY_ENABLED;
    delete process.env.INFINITY_AI_ANONYMOUS_EXPERT_PREVIEW_ENABLED;
    getConversationForActor.mockResolvedValue(conversation);
    listConversationTurns.mockResolvedValue([]);
    listRecentMemoryItems.mockResolvedValue([]);
    enforceFeature.mockResolvedValue({ has_access: false });
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('keeps guest expert recommendations blocked when the preview flag is false', async () => {
    process.env.INFINITY_AI_ANONYMOUS_EXPERT_PREVIEW_ENABLED = 'false';

    const policy = await buildInfinityPolicyContext({
      conversationId: conversation.id,
      actor: anonymousActor,
    });

    expect(policy.policy.canRecommendExperts).toBe(false);
    expect(policy.policy.canBookSessions).toBe(false);
    expect(policy.policy.requiresAuthForBooking).toBe(true);
    expect(policy.policy.featureFlags.anonymousExpertPreviewEnabled).toBe(false);
    expect(enforceFeature).not.toHaveBeenCalled();
  });

  it('allows guest expert preview without granting booking rights when the flag is true', async () => {
    process.env.INFINITY_AI_ANONYMOUS_EXPERT_PREVIEW_ENABLED = 'true';

    const policy = await buildInfinityPolicyContext({
      conversationId: conversation.id,
      actor: anonymousActor,
    });

    expect(policy.policy.canRecommendExperts).toBe(true);
    expect(policy.policy.canBookSessions).toBe(false);
    expect(policy.policy.requiresAuthForBooking).toBe(true);
    expect(policy.policy.featureFlags.anonymousExpertPreviewEnabled).toBe(true);
    expect(enforceFeature).not.toHaveBeenCalled();
  });

  it('does not load cross-chat memory for authenticated users by default', async () => {
    const actor = {
      userId: 'user-1',
      anonymousSessionId: null,
      surface: 'landing_page',
      authenticated: true,
    };
    getConversationForActor.mockResolvedValue({
      ...conversation,
      userId: actor.userId,
      anonymousSessionId: null,
    });
    listRecentMemoryItems.mockResolvedValue([
      {
        id: 'memory-1',
        userId: actor.userId,
        conversationId: conversation.id,
        memoryType: 'goal',
        content: 'Cross-chat memory that should be disabled.',
        confidence: 0.9,
        provenance: {},
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const policy = await buildInfinityPolicyContext({
      conversationId: conversation.id,
      actor,
    });

    expect(policy.memoryItems).toEqual([]);
    expect(policy.policy.featureFlags.crossChatMemoryEnabled).toBe(false);
    expect(listRecentMemoryItems).not.toHaveBeenCalled();
  });

  it('loads cross-chat memory for authenticated users only when enabled', async () => {
    process.env.INFINITY_AI_CROSS_CHAT_MEMORY_ENABLED = 'true';
    const actor = {
      userId: 'user-1',
      anonymousSessionId: null,
      surface: 'landing_page',
      authenticated: true,
    };
    const memoryItem = {
      id: 'memory-1',
      userId: actor.userId,
      conversationId: conversation.id,
      memoryType: 'goal',
      content: 'Cross-chat memory that should be loaded only when enabled.',
      confidence: 0.9,
      provenance: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    getConversationForActor.mockResolvedValue({
      ...conversation,
      userId: actor.userId,
      anonymousSessionId: null,
    });
    listRecentMemoryItems.mockResolvedValue([memoryItem]);

    const policy = await buildInfinityPolicyContext({
      conversationId: conversation.id,
      actor,
    });

    expect(policy.memoryItems).toEqual([memoryItem]);
    expect(policy.policy.featureFlags.crossChatMemoryEnabled).toBe(true);
    expect(listRecentMemoryItems).toHaveBeenCalledWith(actor.userId, 8);
  });
});
