import { createHmac, timingSafeEqual } from 'crypto';

function hmacSha256Hex(message: string, secret: string) {
  return createHmac('sha256', secret).update(message).digest('hex');
}

function safeCompareHex(left: string, right: string) {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function signRazorpayOrderPayment(
  orderId: string,
  paymentId: string,
  secret: string
) {
  return hmacSha256Hex(`${orderId}|${paymentId}`, secret);
}

export function verifyRazorpayOrderPaymentSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
  secret: string;
}) {
  return safeCompareHex(
    signRazorpayOrderPayment(input.orderId, input.paymentId, input.secret),
    input.signature
  );
}

export function signRazorpaySubscriptionPayment(
  paymentId: string,
  subscriptionId: string,
  secret: string
) {
  return hmacSha256Hex(`${paymentId}|${subscriptionId}`, secret);
}

export function verifyRazorpaySubscriptionPaymentSignature(input: {
  paymentId: string;
  subscriptionId: string;
  signature: string;
  secret: string;
}) {
  return safeCompareHex(
    signRazorpaySubscriptionPayment(
      input.paymentId,
      input.subscriptionId,
      input.secret
    ),
    input.signature
  );
}

export function verifyRazorpayWebhookSignature(input: {
  rawBody: string;
  signature: string;
  secret: string;
}) {
  return safeCompareHex(
    hmacSha256Hex(input.rawBody, input.secret),
    input.signature
  );
}
