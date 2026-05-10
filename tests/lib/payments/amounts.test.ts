import { describe, expect, it } from 'vitest';

import {
  assertRazorpayPaymentAmount,
  assertRazorpayCurrency,
  toCurrencySubunits,
} from '@/lib/payments/amounts';

describe('payment amounts', () => {
  it('converts INR amounts to paise', () => {
    expect(toCurrencySubunits(499.5, 'INR')).toBe(49950);
  });

  it('rejects unsupported Razorpay currencies', () => {
    expect(() => assertRazorpayCurrency('USD')).toThrow(
      'Razorpay payments are currently enabled only for INR'
    );
  });

  it('rejects invalid currency codes', () => {
    expect(() => toCurrencySubunits(10, 'Rupees')).toThrow(
      'Invalid payment currency'
    );
  });

  it('rejects Razorpay INR amounts below one rupee', () => {
    expect(() => assertRazorpayPaymentAmount('INR', 99)).toThrow(
      'Razorpay INR payments must be at least INR 1.00'
    );
  });
});
