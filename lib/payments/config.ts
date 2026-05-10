import { PAYMENT_PROVIDERS, type PaymentProvider } from './types';

export class PaymentConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentConfigurationError';
  }
}

export interface PaymentConfig {
  provider: PaymentProvider;
  razorpayMode: 'test' | 'live';
  razorpayKeyId: string;
  razorpayKeySecret: string;
  razorpayWebhookSecret: string;
  mentorOnboardingFeeInr: number;
}

function normalizeProvider(value: string | undefined): PaymentProvider {
  const provider = (value || 'dummy').trim().toLowerCase();
  if (PAYMENT_PROVIDERS.includes(provider as PaymentProvider)) {
    return provider as PaymentProvider;
  }

  throw new PaymentConfigurationError(
    `PAYMENTS_PROVIDER must be "dummy" or "razorpay", received "${value}".`
  );
}

function requiredEnv(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim();
  if (!value) {
    throw new PaymentConfigurationError(`${key} is required when PAYMENTS_PROVIDER=razorpay.`);
  }
  return value;
}

function parsePositiveAmount(value: string | undefined, key: string, fallback: number) {
  const raw = value?.trim();
  if (!raw) return fallback;

  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new PaymentConfigurationError(`${key} must be a positive numeric amount.`);
  }

  return amount;
}

export function getPaymentProvider(env: NodeJS.ProcessEnv = process.env) {
  return normalizeProvider(env.PAYMENTS_PROVIDER);
}

export function isRazorpayEnabled(env: NodeJS.ProcessEnv = process.env) {
  return getPaymentProvider(env) === 'razorpay';
}

export function getPaymentConfig(
  env: NodeJS.ProcessEnv = process.env
): PaymentConfig {
  const provider = getPaymentProvider(env);
  const mode = (env.RAZORPAY_MODE || 'test').trim().toLowerCase();
  if (mode !== 'test' && mode !== 'live') {
    throw new PaymentConfigurationError('RAZORPAY_MODE must be "test" or "live".');
  }

  if (provider === 'dummy') {
    return {
      provider,
      razorpayMode: mode,
      razorpayKeyId: '',
      razorpayKeySecret: '',
      razorpayWebhookSecret: '',
      mentorOnboardingFeeInr: parsePositiveAmount(
        env.MENTOR_ONBOARDING_FEE_INR,
        'MENTOR_ONBOARDING_FEE_INR',
        5000
      ),
    };
  }

  return {
    provider,
    razorpayMode: mode,
    razorpayKeyId: requiredEnv(env, 'RAZORPAY_KEY_ID'),
    razorpayKeySecret: requiredEnv(env, 'RAZORPAY_KEY_SECRET'),
    razorpayWebhookSecret: requiredEnv(env, 'RAZORPAY_WEBHOOK_SECRET'),
    mentorOnboardingFeeInr: parsePositiveAmount(
      env.MENTOR_ONBOARDING_FEE_INR,
      'MENTOR_ONBOARDING_FEE_INR',
      5000
    ),
  };
}
