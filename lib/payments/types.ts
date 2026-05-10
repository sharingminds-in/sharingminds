export const PAYMENT_PROVIDERS = ['dummy', 'razorpay'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_PURPOSES = [
  'mentor_onboarding',
  'session_booking',
  'subscription',
  'course_enrollment',
] as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

export type PaymentIntentStatus =
  | 'created'
  | 'requires_action'
  | 'paid'
  | 'completed'
  | 'failed'
  | 'action_failed'
  | 'refunded'
  | 'expired';

export interface CheckoutPrefill {
  name?: string | null;
  email?: string | null;
  contact?: string | null;
}

export interface PaymentCheckoutPayload {
  provider: PaymentProvider;
  purpose: PaymentPurpose;
  status: 'completed' | 'requires_checkout' | 'processing';
  intentId: string | null;
  keyId?: string;
  orderId?: string;
  subscriptionId?: string;
  amount: number;
  amountSubunits: number;
  currency: string;
  name: string;
  description: string;
  prefill?: CheckoutPrefill;
  notes?: Record<string, string | number>;
  resource?: {
    type: string;
    id: string;
  } | null;
}

export interface RazorpayCheckoutResponse {
  razorpay_payment_id: string;
  razorpay_signature: string;
  razorpay_order_id?: string;
  razorpay_subscription_id?: string;
}

export interface PaymentVerificationResult {
  status: 'completed' | 'processing' | 'failed';
  intentId: string;
  resource?: {
    type: string;
    id: string;
  } | null;
  message: string;
}
