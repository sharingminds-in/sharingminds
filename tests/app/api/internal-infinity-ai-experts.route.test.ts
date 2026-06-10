import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { assertInfinityInternalRequest, buildInfinityPolicyContext, listInfinityExpertCandidates } =
  vi.hoisted(() => ({
    assertInfinityInternalRequest: vi.fn(),
    buildInfinityPolicyContext: vi.fn(),
    listInfinityExpertCandidates: vi.fn(),
  }));

vi.mock('@/lib/infinity-ai/server', () => ({
  assertInfinityInternalRequest,
}));

vi.mock('@/lib/infinity-ai/policy', () => ({
  buildInfinityPolicyContext,
}));

vi.mock('@/lib/infinity-ai/expert-candidates', () => ({
  listInfinityExpertCandidates,
}));

import { POST } from '@/app/api/internal/infinity-ai/experts/route';

const actor = {
  userId: null,
  anonymousSessionId: 'anon-1',
  surface: 'landing_page',
  authenticated: false,
};

const expertCandidate = {
  mentorProfileId: '33333333-3333-3333-3333-333333333333',
  mentorUserId: 'mentor-user-1',
  name: 'Career Mentor',
  title: 'Career Coach',
  company: 'Young Minds',
  industry: 'technology',
  headline: 'Career clarity mentor',
  about: 'Helps with early career decisions.',
  image: null,
  location: 'London',
  hourlyRate: 60,
  currency: 'GBP',
  experienceYears: 8,
  expertise: ['career growth'],
  intentTags: ['career_growth'],
  outcomeTags: ['clarity'],
  industryTags: ['technology'],
  personaFitTags: ['student'],
  keywordTrustScore: 0.8,
  contentAuthorityScore: 0.7,
  qualityScore: 0.9,
  conversionScore: 0.5,
  allocationSnapshot: {},
  metadataQualityStatus: 'derived_v1',
  metrics: {
    completedSessions: 5,
    cancelledSessions: 0,
    avgReviewScore: 4.8,
    reviewCount: 5,
    recentImpressions7d: 1,
    recentClicks7d: 0,
    recentBookings30d: 1,
    recentCompletions90d: 4,
    lastShownAt: null,
  },
  activeBoostRules: [],
};

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/internal/infinity-ai/experts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/internal/infinity-ai/experts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks guest expert retrieval when platform policy disallows anonymous preview', async () => {
    buildInfinityPolicyContext.mockResolvedValue({
      policy: { canRecommendExperts: false },
    });

    const response = await POST(
      request({
        conversationId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        actor,
        signalSnapshot: { intents: ['career_growth'] },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      policyBlocked: true,
      candidates: [],
    });
    expect(listInfinityExpertCandidates).not.toHaveBeenCalled();
  });

  it('returns eligible mentor candidates when anonymous preview policy allows it', async () => {
    buildInfinityPolicyContext.mockResolvedValue({
      policy: {
        canRecommendExperts: true,
        canBookSessions: false,
        requiresAuthForBooking: true,
      },
    });
    listInfinityExpertCandidates.mockResolvedValue({
      candidates: [expertCandidate],
    });

    const response = await POST(
      request({
        conversationId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        actor,
        signalSnapshot: { intents: ['career_growth'] },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      policyBlocked: false,
      candidates: [{ mentorProfileId: expertCandidate.mentorProfileId }],
    });
    expect(listInfinityExpertCandidates).toHaveBeenCalledWith({
      signalSnapshot: { intents: ['career_growth'] },
    });
  });
});
