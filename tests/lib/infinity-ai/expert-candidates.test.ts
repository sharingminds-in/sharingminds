import { describe, expect, it } from 'vitest';

import { buildInfinityMentorEligibility } from '@/lib/infinity-ai/expert-candidates';
import { FEATURE_KEYS } from '@/lib/subscriptions/feature-keys';

describe('Infinity AI expert candidate eligibility', () => {
  it('requires AI visibility and at least one available session feature', () => {
    const eligibility = buildInfinityMentorEligibility(
      ['eligible-paid', 'eligible-free', 'no-visibility', 'no-session', 'exhausted-session'],
      [
        {
          userId: 'eligible-paid',
          featureKey: FEATURE_KEYS.AI_VISIBILITY,
          valueType: 'boolean',
          isMetered: false,
          isIncluded: true,
          limitCount: null,
          limitMinutes: null,
          limitAmount: null,
          usageCount: null,
          usageMinutes: null,
          usageAmount: null,
        },
        {
          userId: 'eligible-paid',
          featureKey: FEATURE_KEYS.PAID_VIDEO_SESSIONS_MONTHLY,
          valueType: 'count',
          isMetered: true,
          isIncluded: true,
          limitCount: 5,
          limitMinutes: null,
          limitAmount: null,
          usageCount: 3,
          usageMinutes: null,
          usageAmount: null,
        },
        {
          userId: 'eligible-free',
          featureKey: FEATURE_KEYS.AI_VISIBILITY,
          valueType: 'boolean',
          isMetered: false,
          isIncluded: true,
          limitCount: null,
          limitMinutes: null,
          limitAmount: null,
          usageCount: null,
          usageMinutes: null,
          usageAmount: null,
        },
        {
          userId: 'eligible-free',
          featureKey: FEATURE_KEYS.FREE_VIDEO_SESSIONS_MONTHLY,
          valueType: 'count',
          isMetered: true,
          isIncluded: true,
          limitCount: 1,
          limitMinutes: null,
          limitAmount: null,
          usageCount: null,
          usageMinutes: null,
          usageAmount: null,
        },
        {
          userId: 'no-visibility',
          featureKey: FEATURE_KEYS.PAID_VIDEO_SESSIONS_MONTHLY,
          valueType: 'count',
          isMetered: true,
          isIncluded: true,
          limitCount: 5,
          limitMinutes: null,
          limitAmount: null,
          usageCount: 0,
          usageMinutes: null,
          usageAmount: null,
        },
        {
          userId: 'no-session',
          featureKey: FEATURE_KEYS.AI_VISIBILITY,
          valueType: 'boolean',
          isMetered: false,
          isIncluded: true,
          limitCount: null,
          limitMinutes: null,
          limitAmount: null,
          usageCount: null,
          usageMinutes: null,
          usageAmount: null,
        },
        {
          userId: 'exhausted-session',
          featureKey: FEATURE_KEYS.AI_VISIBILITY,
          valueType: 'boolean',
          isMetered: false,
          isIncluded: true,
          limitCount: null,
          limitMinutes: null,
          limitAmount: null,
          usageCount: null,
          usageMinutes: null,
          usageAmount: null,
        },
        {
          userId: 'exhausted-session',
          featureKey: FEATURE_KEYS.PAID_VIDEO_SESSIONS_MONTHLY,
          valueType: 'count',
          isMetered: true,
          isIncluded: true,
          limitCount: 2,
          limitMinutes: null,
          limitAmount: null,
          usageCount: 2,
          usageMinutes: null,
          usageAmount: null,
        },
      ]
    );

    expect(eligibility.get('eligible-paid')?.eligible).toBe(true);
    expect(eligibility.get('eligible-free')?.eligible).toBe(true);
    expect(eligibility.get('no-visibility')?.eligible).toBe(false);
    expect(eligibility.get('no-session')?.eligible).toBe(false);
    expect(eligibility.get('exhausted-session')?.eligible).toBe(false);
  });
});
