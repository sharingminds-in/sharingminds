export type SessionRateSource =
  | 'free'
  | 'ai_plan'
  | 'admin_override'
  | 'mentor';

interface ResolveSessionPriceInput {
  sessionType: 'FREE' | 'PAID' | 'COUNSELING';
  bookingSource?: 'default' | 'ai' | 'explore';
  durationMinutes: number;
  mentorHourlyRate: number | string | null | undefined;
  mentorCurrency: string | null | undefined;
  adminHourlyRateOverride?: number | string | null;
  aiPlanHourlyRate?: number | string | null;
  aiPlanCurrency?: string | null;
}

export interface ResolvedSessionPrice {
  hourlyRate: number;
  amount: number;
  currency: string;
  source: SessionRateSource;
}

function toOptionalNonNegativeNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function roundCurrencyAmount(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function resolveSessionPrice(
  input: ResolveSessionPriceInput
): ResolvedSessionPrice {
  const mentorCurrency = input.mentorCurrency?.trim().toUpperCase() || 'USD';

  if (input.sessionType === 'FREE') {
    return {
      hourlyRate: 0,
      amount: 0,
      currency: mentorCurrency,
      source: 'free',
    };
  }

  const aiPlanHourlyRate = toOptionalNonNegativeNumber(
    input.aiPlanHourlyRate
  );
  const adminHourlyRateOverride = toOptionalNonNegativeNumber(
    input.adminHourlyRateOverride
  );
  const mentorHourlyRate =
    toOptionalNonNegativeNumber(input.mentorHourlyRate) ?? 0;

  let hourlyRate = mentorHourlyRate;
  let currency = mentorCurrency;
  let source: SessionRateSource = 'mentor';

  if (
    input.bookingSource === 'ai' &&
    input.sessionType === 'PAID' &&
    aiPlanHourlyRate !== null &&
    aiPlanHourlyRate > 0
  ) {
    hourlyRate = aiPlanHourlyRate;
    currency = input.aiPlanCurrency?.trim().toUpperCase() || mentorCurrency;
    source = 'ai_plan';
  } else if (adminHourlyRateOverride !== null) {
    hourlyRate = adminHourlyRateOverride;
    source = 'admin_override';
  }

  return {
    hourlyRate,
    amount: roundCurrencyAmount(
      hourlyRate * (Math.max(0, input.durationMinutes) / 60)
    ),
    currency,
    source,
  };
}
