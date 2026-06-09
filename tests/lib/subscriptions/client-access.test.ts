import { describe, expect, it } from 'vitest';

import {
  getFeatureLimitCurrency,
  getNumericFeatureLimitAmount,
  hasIncludedFeature,
} from '@/lib/subscriptions/client-access';
import { FEATURE_KEYS } from '@/lib/subscriptions/feature-keys';

describe('subscription client access helpers', () => {
  it('detects an included feature correctly', () => {
    expect(
      hasIncludedFeature(
        [
          {
            feature_key: FEATURE_KEYS.ANALYTICS_ACCESS_LEVEL,
            is_included: true,
          },
        ],
        FEATURE_KEYS.ANALYTICS_ACCESS_LEVEL
      )
    ).toBe(true);
  });

  it('returns false when the feature is missing or excluded', () => {
    expect(
      hasIncludedFeature(
        [
          {
            feature_key: FEATURE_KEYS.ANALYTICS_ACCESS_LEVEL,
            is_included: false,
          },
        ],
        FEATURE_KEYS.ANALYTICS_ACCESS_LEVEL
      )
    ).toBe(false);

    expect(
      hasIncludedFeature([], FEATURE_KEYS.ANALYTICS_ACCESS_LEVEL)
    ).toBe(false);
  });

  it('normalizes numeric limit amounts from number and string values', () => {
    expect(
      getNumericFeatureLimitAmount(
        [
          {
            feature_key: FEATURE_KEYS.PAID_VIDEO_SESSIONS_MONTHLY,
            is_included: true,
            limit_amount: '25',
          },
        ],
        FEATURE_KEYS.PAID_VIDEO_SESSIONS_MONTHLY
      )
    ).toBe(25);

    expect(
      getNumericFeatureLimitAmount(
        [
          {
            feature_key: FEATURE_KEYS.PAID_VIDEO_SESSIONS_MONTHLY,
            is_included: true,
            limit_amount: 40,
          },
        ],
        FEATURE_KEYS.PAID_VIDEO_SESSIONS_MONTHLY
      )
    ).toBe(40);
  });

  it('returns null for missing or invalid numeric feature limits', () => {
    expect(
      getNumericFeatureLimitAmount(
        [
          {
            feature_key: FEATURE_KEYS.PAID_VIDEO_SESSIONS_MONTHLY,
            is_included: true,
            limit_amount: 'not-a-number',
          },
        ],
        FEATURE_KEYS.PAID_VIDEO_SESSIONS_MONTHLY
      )
    ).toBeNull();

    expect(
      getNumericFeatureLimitAmount([], FEATURE_KEYS.PAID_VIDEO_SESSIONS_MONTHLY)
    ).toBeNull();
  });

  it('normalizes the configured feature currency', () => {
    expect(
      getFeatureLimitCurrency(
        [
          {
            feature_key: FEATURE_KEYS.PAID_VIDEO_SESSIONS_MONTHLY,
            is_included: true,
            limit_currency: ' inr ',
          },
        ],
        FEATURE_KEYS.PAID_VIDEO_SESSIONS_MONTHLY
      )
    ).toBe('INR');
  });
});
