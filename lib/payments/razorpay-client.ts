import Razorpay from 'razorpay';

import { getPaymentConfig } from './config';

let cachedClient: Razorpay | null = null;
let cachedKeyId = '';

export function getRazorpayClient() {
  const config = getPaymentConfig();
  if (config.provider !== 'razorpay') {
    throw new Error('Razorpay client requested while PAYMENTS_PROVIDER is not razorpay.');
  }

  if (!cachedClient || cachedKeyId !== config.razorpayKeyId) {
    cachedClient = new Razorpay({
      key_id: config.razorpayKeyId,
      key_secret: config.razorpayKeySecret,
    });
    cachedKeyId = config.razorpayKeyId;
  }

  return cachedClient;
}
