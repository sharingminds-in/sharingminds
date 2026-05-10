import { createHash } from 'crypto';

export function buildPaymentIdempotencyKey(input: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex');
}
