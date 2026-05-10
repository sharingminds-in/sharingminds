import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';

import {
  verifyRazorpayOrderPaymentSignature,
  verifyRazorpaySubscriptionPaymentSignature,
  verifyRazorpayWebhookSignature,
} from '@/lib/payments/signatures';

function sign(message: string, secret: string) {
  return createHmac('sha256', secret).update(message).digest('hex');
}

describe('Razorpay signatures', () => {
  it('verifies standard checkout order signatures', () => {
    const secret = 'secret';
    expect(
      verifyRazorpayOrderPaymentSignature({
        orderId: 'order_123',
        paymentId: 'pay_123',
        signature: sign('order_123|pay_123', secret),
        secret,
      })
    ).toBe(true);
  });

  it('verifies subscription checkout signatures', () => {
    const secret = 'secret';
    expect(
      verifyRazorpaySubscriptionPaymentSignature({
        paymentId: 'pay_123',
        subscriptionId: 'sub_123',
        signature: sign('pay_123|sub_123', secret),
        secret,
      })
    ).toBe(true);
  });

  it('verifies webhook raw body signatures', () => {
    const secret = 'webhook-secret';
    const body = JSON.stringify({ event: 'payment.captured' });
    expect(
      verifyRazorpayWebhookSignature({
        rawBody: body,
        signature: sign(body, secret),
        secret,
      })
    ).toBe(true);
  });

  it('rejects mismatched signatures', () => {
    expect(
      verifyRazorpayOrderPaymentSignature({
        orderId: 'order_123',
        paymentId: 'pay_123',
        signature: sign('order_123|pay_wrong', 'secret'),
        secret: 'secret',
      })
    ).toBe(false);
  });
});
