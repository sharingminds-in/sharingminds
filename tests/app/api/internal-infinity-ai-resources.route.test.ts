import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { assertInfinityInternalRequest, buildInfinityPolicyContext, listInfinityResourceCandidates } =
  vi.hoisted(() => ({
    assertInfinityInternalRequest: vi.fn(),
    buildInfinityPolicyContext: vi.fn(),
    listInfinityResourceCandidates: vi.fn(),
  }));

vi.mock('@/lib/infinity-ai/server', () => ({
  assertInfinityInternalRequest,
}));

vi.mock('@/lib/infinity-ai/policy', () => ({
  buildInfinityPolicyContext,
}));

vi.mock('@/lib/infinity-ai/resource-candidates', () => ({
  listInfinityResourceCandidates,
}));

import { POST } from '@/app/api/internal/infinity-ai/resources/route';

const actor = {
  userId: null,
  anonymousSessionId: 'anon-1',
  surface: 'landing_page',
  authenticated: false,
};

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/internal/infinity-ai/resources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/internal/infinity-ai/resources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns public resource candidates when policy allows resources', async () => {
    buildInfinityPolicyContext.mockResolvedValue({
      policy: { canRecommendResources: true },
    });
    listInfinityResourceCandidates.mockResolvedValue({
      visibility: 'public',
      candidates: [
        {
          resourceId: '66666666-6666-6666-6666-666666666666',
          resourceType: 'course',
          title: 'Study Abroad Decision Planning',
          description: 'A public course.',
          href: '/courses/66666666-6666-6666-6666-666666666666',
          source: 'courses',
          visibility: 'public',
          tags: ['study abroad'],
          learningOutcomes: ['Compare options'],
          intentTags: ['study_abroad'],
          outcomeTags: ['clarity'],
          avgRating: 4.7,
          reviewCount: 8,
          enrollmentCount: 42,
          metadata: {},
        },
      ],
    });

    const response = await POST(
      request({
        conversationId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        actor,
        signalSnapshot: { intents: ['study_abroad'] },
        userMessage: 'Recommend public courses',
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      visibility: 'public',
      policyBlocked: false,
      candidates: [
        {
          resourceId: '66666666-6666-6666-6666-666666666666',
          href: '/courses/66666666-6666-6666-6666-666666666666',
        },
      ],
    });
    expect(assertInfinityInternalRequest).toHaveBeenCalledTimes(1);
    expect(listInfinityResourceCandidates).toHaveBeenCalledWith({
      signalSnapshot: { intents: ['study_abroad'] },
      userMessage: 'Recommend public courses',
    });
  });

  it('blocks resource retrieval when platform policy disallows resources', async () => {
    buildInfinityPolicyContext.mockResolvedValue({
      policy: { canRecommendResources: false },
    });

    const response = await POST(
      request({
        conversationId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        actor,
        signalSnapshot: {},
        userMessage: 'Recommend public courses',
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      visibility: 'public',
      policyBlocked: true,
      candidates: [],
    });
    expect(listInfinityResourceCandidates).not.toHaveBeenCalled();
  });
});
