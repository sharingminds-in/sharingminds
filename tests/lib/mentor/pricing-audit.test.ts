import { describe, expect, it } from 'vitest';

import {
  buildPricingAuditSnapshot,
  hasAdminPricingOverrideChanged,
  hasMentorPricingChanged,
  normalizePricingAuditAmount,
  resolvePricingAuditEffectiveRate,
} from '@/lib/mentor/pricing-audit';

describe('mentor pricing audit helpers', () => {
  it('normalizes equivalent decimal values consistently', () => {
    expect(normalizePricingAuditAmount('100')).toBe('100.00');
    expect(normalizePricingAuditAmount(100)).toBe('100.00');
    expect(normalizePricingAuditAmount(null)).toBeNull();
  });

  it('detects mentor rate and currency changes without flagging equivalent values', () => {
    expect(
      hasMentorPricingChanged(
        { mentorHourlyRate: '100.00', currency: 'USD' },
        { mentorHourlyRate: 100, currency: 'USD' }
      )
    ).toBe(false);

    expect(
      hasMentorPricingChanged(
        { mentorHourlyRate: '100.00', currency: 'USD' },
        { mentorHourlyRate: '120.00', currency: 'USD' }
      )
    ).toBe(true);

    expect(
      hasMentorPricingChanged(
        { mentorHourlyRate: '100.00', currency: 'USD' },
        { mentorHourlyRate: '100.00', currency: 'INR' }
      )
    ).toBe(true);
  });

  it('detects genuine admin override changes only', () => {
    expect(
      hasAdminPricingOverrideChanged(
        { adminHourlyRateOverride: '150.00' },
        { adminHourlyRateOverride: 150 }
      )
    ).toBe(false);

    expect(
      hasAdminPricingOverrideChanged(
        { adminHourlyRateOverride: null },
        { adminHourlyRateOverride: 150 }
      )
    ).toBe(true);
  });

  it('captures requested, override, and effective rate snapshots', () => {
    const previous = {
      mentorHourlyRate: 100,
      adminHourlyRateOverride: null,
      currency: 'USD',
    };
    const next = {
      mentorHourlyRate: 100,
      adminHourlyRateOverride: 150,
      currency: 'USD',
    };

    expect(resolvePricingAuditEffectiveRate(previous)).toBe('100.00');
    expect(resolvePricingAuditEffectiveRate(next)).toBe('150.00');
    expect(buildPricingAuditSnapshot(previous, next)).toEqual({
      previousMentorRate: '100.00',
      newMentorRate: '100.00',
      previousAdminOverride: null,
      newAdminOverride: '150.00',
      previousEffectiveRate: '100.00',
      newEffectiveRate: '150.00',
      currency: 'USD',
    });
  });
});
