/**
 * PRODUCTION-GRADE SUBSCRIPTION ENFORCEMENT UTILITIES
 *
 * This module provides secure, reliable subscription enforcement for the entire platform.
 * All functions fail loudly - no fallbacks, no silent failures.
 *
 * Usage:
 * - Call these functions before allowing access to features
 * - Track usage immediately after consumption
 * - Always handle the error cases explicitly
 */

import {
  getActiveSubscriptionsByUserId,
  getCurrentUsageForFeature,
  getFeatureByKey,
  getPlanFeaturesByPlanId,
  recordUsageEventAndUpdateTracking,
} from '@/lib/db/queries/subscriptions';

export type SubscriptionAudience = 'mentor' | 'mentee';
export type SubscriptionActorRole = SubscriptionAudience | 'admin';

export interface SubscriptionContext {
  audience?: SubscriptionAudience;
  actorRole?: SubscriptionActorRole;
  allowAdminOverride?: boolean;
}

export interface SubscriptionPlanFeature {
  feature_key: string;
  feature_name: string;
  is_included: boolean;
  value_type: 'boolean' | 'count' | 'minutes' | 'text' | 'amount' | 'percent' | 'json';
  unit?: string | null;

  // Limit values
  limit_count: number | null;
  limit_minutes: number | null;
  limit_text: string | null;
  limit_amount: number | null;
  limit_percent: number | null;
  limit_json: Record<string, any> | null;

  // Time-based limits
  limit_interval: 'day' | 'week' | 'month' | 'year' | null;
  limit_interval_count: number;

  // Metering
  is_metered: boolean;
}

export interface SubscriptionInfo {
  subscription_id: string;
  plan_id: string;
  plan_key: string;
  plan_name: string;
  audience: SubscriptionAudience;
  status: 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled' | 'incomplete' | 'expired';
  current_period_start: string | null;
  current_period_end: string | null;
}

export interface FeatureAccess {
  has_access: boolean;
  reason?: string;
  limit?: number | string | null;
  usage?: number;
  remaining?: number | string;
}

export interface UsageInfo {
  usage_count: number;
  usage_minutes: number;
  usage_amount: number;
  usage_json: Record<string, any>;
  period_start: string;
  period_end: string;
  limit_reached: boolean;
}

function normalizeDeltaValue(value: number | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

function resolveUsageIdempotencyKey(
  userId: string,
  featureKey: string,
  delta: { count?: number; minutes?: number; amount?: number },
  resourceType?: string,
  resourceId?: string,
  idempotencyKey?: string
) {
  const explicitKey = idempotencyKey?.trim();
  if (explicitKey) {
    return explicitKey;
  }

  // Deterministic key when usage is tied to a concrete domain resource.
  if (resourceType && resourceId) {
    return [
      'usage',
      userId,
      featureKey,
      resourceType,
      resourceId,
      `count=${normalizeDeltaValue(delta.count)}`,
      `minutes=${normalizeDeltaValue(delta.minutes)}`,
      `amount=${normalizeDeltaValue(delta.amount)}`,
    ].join(':');
  }

  // Fallback for legacy call sites without a resource identifier.
  return globalThis.crypto?.randomUUID?.() || `usage-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function resolveExpectedAudience(context?: SubscriptionContext): SubscriptionAudience | undefined {
  if (context?.audience) {
    return context.audience;
  }

  if (context?.actorRole === 'mentor' || context?.actorRole === 'mentee') {
    return context.actorRole;
  }

  return undefined;
}

async function getActiveSubscriptions(userId: string): Promise<SubscriptionInfo[]> {
  return getActiveSubscriptionsByUserId(userId);
}

function resolveSubscriptionForContext(
  subscriptions: SubscriptionInfo[],
  userId: string,
  context?: SubscriptionContext
): SubscriptionInfo {
  const expectedAudience = resolveExpectedAudience(context);
  const matches = expectedAudience
    ? subscriptions.filter((subscription) => subscription.audience === expectedAudience)
    : subscriptions;

  if (matches.length === 0) {
    if (expectedAudience) {
      throw new Error(`No active ${expectedAudience} subscription found for user ${userId}`);
    }
    throw new Error(`No active subscription found for user ${userId}`);
  }

  if (matches.length === 1) {
    return matches[0];
  }

  if (expectedAudience) {
    throw new Error(
      `Multiple active ${expectedAudience} subscriptions found for user ${userId}; resolve data before enforcing limits`
    );
  }

  const audiences = Array.from(new Set(matches.map((subscription) => subscription.audience))).join(', ');
  throw new Error(
    `Multiple active subscriptions found for user ${userId} across audiences (${audiences}); audience context is required`
  );
}

/**
 * Get the active subscription for a user
 * Throws if no active subscription found
 */
export async function getUserSubscription(
  userId: string,
  context?: SubscriptionContext
): Promise<SubscriptionInfo> {
  const subscriptions = await getActiveSubscriptions(userId);
  return resolveSubscriptionForContext(subscriptions, userId, context);
}

/**
 * Get all features included in a user's subscription plan
 * Throws if subscription or features cannot be loaded
 */
export async function getPlanFeatures(
  userId: string,
  context?: SubscriptionContext
): Promise<SubscriptionPlanFeature[]> {
  const subscription = await getUserSubscription(userId, context);
  return getPlanFeaturesByPlanId(subscription.plan_id);
}

/**
 * Check if user has access to a specific feature
 * Returns access status with detailed information
 *
 * For boolean features: returns has_access true/false
 * For metered features: returns has_access, usage, limit, remaining
 */
export async function checkFeatureAccess(
  userId: string,
  featureKey: string,
  context?: SubscriptionContext
): Promise<FeatureAccess> {
  try {
    const expectedAudience = resolveExpectedAudience(context);

    if (context?.actorRole === 'admin' && context.allowAdminOverride) {
      return {
        has_access: true,
        reason: 'Access granted via explicit admin override',
      };
    }

    if (context?.actorRole === 'admin' && !expectedAudience) {
      throw new Error('Admin entitlement checks must specify audience or explicit override');
    }

    const features = await getPlanFeatures(userId, context);
    const feature = features.find(f => f.feature_key === featureKey);

    if (!feature) {
      return {
        has_access: false,
        reason: `Feature '${featureKey}' not included in your plan`,
      };
    }

    // Boolean features - simple yes/no
    if (feature.value_type === 'boolean') {
      return {
        has_access: feature.is_included,
      };
    }

    // Text features - just return the limit text
    if (feature.value_type === 'text') {
      return {
        has_access: feature.is_included,
        limit: feature.limit_text,
      };
    }

    // Metered features - check usage against limits
    if (feature.is_metered) {
      const subscription = await getUserSubscription(userId, context);
      const usage = await getFeatureUsage(subscription.subscription_id, featureKey);

      // Count-based limits
      if (feature.value_type === 'count' && feature.limit_count !== null) {
        const remaining = feature.limit_count - usage.usage_count;
        return {
          has_access: remaining > 0,
          reason: remaining <= 0 ? 'Usage limit reached' : undefined,
          limit: feature.limit_count,
          usage: usage.usage_count,
          remaining: remaining,
        };
      }

      // Minutes-based limits
      if (feature.value_type === 'minutes' && feature.limit_minutes !== null) {
        const remaining = feature.limit_minutes - usage.usage_minutes;
        return {
          has_access: remaining > 0,
          reason: remaining <= 0 ? 'Time limit reached' : undefined,
          limit: feature.limit_minutes,
          usage: usage.usage_minutes,
          remaining: remaining,
        };
      }

      // Amount-based limits
      if (feature.value_type === 'amount' && feature.limit_amount !== null) {
        const remaining = Number(feature.limit_amount) - usage.usage_amount;
        return {
          has_access: remaining > 0,
          reason: remaining <= 0 ? 'Amount limit reached' : undefined,
          limit: feature.limit_amount,
          usage: usage.usage_amount,
          remaining: remaining,
        };
      }
    }

    // Non-metered features with limits - just return the limit info
    return {
      has_access: feature.is_included,
      limit: feature.limit_count || feature.limit_minutes || feature.limit_text,
    };

  } catch (error) {
    console.error('[subscriptions] checkFeatureAccess failed:', { featureKey, error });
    throw new Error(`Failed to check feature access for '${featureKey}': ${error}`);
  }
}

/**
 * Get current usage for a metered feature in the current billing period
 * Returns zero usage if no tracking record exists yet
 */
async function getFeatureUsage(
  subscriptionId: string,
  featureKey: string
): Promise<UsageInfo> {
  const featureData = await getFeatureByKey(featureKey);
  if (!featureData) {
    throw new Error(`Feature '${featureKey}' not found`);
  }

  const data = await getCurrentUsageForFeature(subscriptionId, featureData.id);

  if (!data) {
    // No usage tracking record yet - return zeros
    const periodStart = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    return {
      usage_count: 0,
      usage_minutes: 0,
      usage_amount: 0,
      usage_json: {},
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      limit_reached: false,
    };
  }

  return data;
}

/**
 * Track usage of a metered feature
 * Increments usage counters and logs the event
 * Throws if tracking fails - NEVER silently fails
 *
 * @param userId - User consuming the feature
 * @param featureKey - Feature being consumed
 * @param delta - Amount to increment (count, minutes, or amount)
 * @param resourceType - Type of resource (e.g., 'session', 'message', 'course')
 * @param resourceId - ID of the resource being consumed
 * @param context - Optional audience/actor context used to resolve the correct subscription
 */
export async function trackFeatureUsage(
  userId: string,
  featureKey: string,
  delta: { count?: number; minutes?: number; amount?: number },
  resourceType?: string,
  resourceId?: string,
  idempotencyKey?: string,
  context?: SubscriptionContext
): Promise<void> {
  try {
    const expectedAudience = resolveExpectedAudience(context);

    if (context?.actorRole === 'admin' && context.allowAdminOverride) {
      return;
    }

    if (context?.actorRole === 'admin' && !expectedAudience) {
      throw new Error('Admin usage tracking must specify audience or explicit override');
    }

    // Get subscription
    const subscription = await getUserSubscription(userId, context);

    // Get feature
    const featureData = await getFeatureByKey(featureKey);
    if (!featureData) {
      throw new Error(`Feature '${featureKey}' not found`);
    }

    if (!featureData.is_metered) {
      throw new Error(`Feature '${featureKey}' is not metered - cannot track usage`);
    }

    const resolvedIdempotencyKey = resolveUsageIdempotencyKey(
      userId,
      featureKey,
      delta,
      resourceType,
      resourceId,
      idempotencyKey
    );

    const result = await recordUsageEventAndUpdateTracking({
      subscriptionId: subscription.subscription_id,
      featureId: featureData.id,
      userId,
      countDelta: delta.count || 0,
      minutesDelta: delta.minutes || 0,
      amountDelta: delta.amount || 0,
      resourceType,
      resourceId,
      idempotencyKey: resolvedIdempotencyKey,
    });

    if (result.alreadyRecorded) {
      return;
    }
  } catch (error) {
    throw new Error(`Failed to track feature usage: ${error}`);
  }
}
