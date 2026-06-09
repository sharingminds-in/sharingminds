import { describe, expect, it } from 'vitest';

import { resolveSessionPrice } from '@/lib/bookings/session-pricing';

describe('resolveSessionPrice', () => {
  it('prorates the mentor hourly rate by session duration', () => {
    expect(
      resolveSessionPrice({
        sessionType: 'PAID',
        bookingSource: 'explore',
        durationMinutes: 45,
        mentorHourlyRate: '2000',
        mentorCurrency: 'INR',
      })
    ).toEqual({
      hourlyRate: 2000,
      amount: 1500,
      currency: 'INR',
      source: 'mentor',
    });
  });

  it('uses an admin override before the mentor rate', () => {
    expect(
      resolveSessionPrice({
        sessionType: 'PAID',
        bookingSource: 'explore',
        durationMinutes: 30,
        mentorHourlyRate: 200,
        adminHourlyRateOverride: 150,
        mentorCurrency: 'USD',
      })
    ).toMatchObject({
      hourlyRate: 150,
      amount: 75,
      source: 'admin_override',
    });
  });

  it('uses the AI plan rate and currency before an admin override', () => {
    expect(
      resolveSessionPrice({
        sessionType: 'PAID',
        bookingSource: 'ai',
        durationMinutes: 30,
        mentorHourlyRate: 200,
        adminHourlyRateOverride: 150,
        aiPlanHourlyRate: 100,
        aiPlanCurrency: 'INR',
        mentorCurrency: 'USD',
      })
    ).toEqual({
      hourlyRate: 100,
      amount: 50,
      currency: 'INR',
      source: 'ai_plan',
    });
  });

  it('stores free sessions with a zero price', () => {
    expect(
      resolveSessionPrice({
        sessionType: 'FREE',
        bookingSource: 'ai',
        durationMinutes: 30,
        mentorHourlyRate: 200,
        adminHourlyRateOverride: 150,
        aiPlanHourlyRate: 100,
        mentorCurrency: 'USD',
      })
    ).toEqual({
      hourlyRate: 0,
      amount: 0,
      currency: 'USD',
      source: 'free',
    });
  });
});
