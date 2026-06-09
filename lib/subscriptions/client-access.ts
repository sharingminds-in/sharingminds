import type { FeatureKey } from '@/lib/subscriptions/feature-keys';

export interface SubscriptionFeatureRecord {
  feature_key?: string;
  is_included?: boolean;
  limit_amount?: number | string | null;
  limit_currency?: string | null;
}

export function hasIncludedFeature(
  features: SubscriptionFeatureRecord[] | null | undefined,
  featureKey: FeatureKey
) {
  return Boolean(
    features?.some(
      (feature) =>
        feature.feature_key === featureKey && Boolean(feature.is_included)
    )
  );
}

export function getNumericFeatureLimitAmount(
  features: SubscriptionFeatureRecord[] | null | undefined,
  featureKey: FeatureKey
) {
  const feature = features?.find((item) => item.feature_key === featureKey);
  const rawAmount = feature?.limit_amount ?? null;

  if (typeof rawAmount === 'number') {
    return Number.isFinite(rawAmount) ? rawAmount : null;
  }

  if (typeof rawAmount === 'string' && rawAmount.trim() !== '') {
    const parsed = Number(rawAmount);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function getFeatureLimitCurrency(
  features: SubscriptionFeatureRecord[] | null | undefined,
  featureKey: FeatureKey
) {
  const currency = features?.find(
    (item) => item.feature_key === featureKey
  )?.limit_currency;

  return currency?.trim().toUpperCase() || null;
}
