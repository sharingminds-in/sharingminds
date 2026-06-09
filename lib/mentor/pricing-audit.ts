export interface MentorPricingState {
  mentorHourlyRate?: number | string | null;
  adminHourlyRateOverride?: number | string | null;
  currency?: string | null;
}

export function normalizePricingAuditAmount(
  value: number | string | null | undefined
) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : null;
}

export function resolvePricingAuditEffectiveRate(state: MentorPricingState) {
  return normalizePricingAuditAmount(
    state.adminHourlyRateOverride ?? state.mentorHourlyRate
  );
}

export function hasMentorPricingChanged(
  previous: MentorPricingState,
  next: MentorPricingState
) {
  return (
    normalizePricingAuditAmount(previous.mentorHourlyRate) !==
      normalizePricingAuditAmount(next.mentorHourlyRate) ||
    (previous.currency || 'USD') !== (next.currency || 'USD')
  );
}

export function hasAdminPricingOverrideChanged(
  previous: MentorPricingState,
  next: MentorPricingState
) {
  return (
    normalizePricingAuditAmount(previous.adminHourlyRateOverride) !==
    normalizePricingAuditAmount(next.adminHourlyRateOverride)
  );
}

export function buildPricingAuditSnapshot(
  previous: MentorPricingState,
  next: MentorPricingState
) {
  return {
    previousMentorRate: normalizePricingAuditAmount(
      previous.mentorHourlyRate
    ),
    newMentorRate: normalizePricingAuditAmount(next.mentorHourlyRate),
    previousAdminOverride: normalizePricingAuditAmount(
      previous.adminHourlyRateOverride
    ),
    newAdminOverride: normalizePricingAuditAmount(
      next.adminHourlyRateOverride
    ),
    previousEffectiveRate: resolvePricingAuditEffectiveRate(previous),
    newEffectiveRate: resolvePricingAuditEffectiveRate(next),
    currency: next.currency || previous.currency || 'USD',
  };
}
