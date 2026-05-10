import { describe, expect, it } from 'vitest';

import { getPaymentConfig, getPaymentProvider } from '@/lib/payments/config';

describe('payment config', () => {
  it('defaults to dummy payments', () => {
    expect(getPaymentProvider({} as NodeJS.ProcessEnv)).toBe('dummy');
    expect(getPaymentConfig({} as NodeJS.ProcessEnv)).toMatchObject({
      provider: 'dummy',
      mentorOnboardingFeeInr: 5000,
    });
  });

  it('fails loudly for unknown providers', () => {
    expect(() =>
      getPaymentConfig({ PAYMENTS_PROVIDER: 'stripe' } as NodeJS.ProcessEnv)
    ).toThrow('PAYMENTS_PROVIDER must be "dummy" or "razorpay"');
  });

  it('requires Razorpay secrets when Razorpay is enabled', () => {
    expect(() =>
      getPaymentConfig({ PAYMENTS_PROVIDER: 'razorpay' } as NodeJS.ProcessEnv)
    ).toThrow('RAZORPAY_KEY_ID is required');
  });

  it('returns Razorpay config when required values are present', () => {
    expect(
      getPaymentConfig({
        PAYMENTS_PROVIDER: 'razorpay',
        RAZORPAY_MODE: 'live',
        RAZORPAY_KEY_ID: 'rzp_live_key',
        RAZORPAY_KEY_SECRET: 'secret',
        RAZORPAY_WEBHOOK_SECRET: 'webhook-secret',
        MENTOR_ONBOARDING_FEE_INR: '7500',
      } as NodeJS.ProcessEnv)
    ).toMatchObject({
      provider: 'razorpay',
      razorpayMode: 'live',
      razorpayKeyId: 'rzp_live_key',
      mentorOnboardingFeeInr: 7500,
    });
  });
});
