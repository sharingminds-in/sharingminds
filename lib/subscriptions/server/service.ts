import { inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import {
  cancelActiveSubscriptionsForUser,
  createFeature,
  createPlan,
  createPlanPrice,
  createSubscription,
  featureKeyExists,
  findPlanByKey,
  getAnalyticsData,
  getPlanBasic,
  getPlanPrice,
  getSubscriptionStats,
  listFeatureCategories,
  listFeatures,
  listPlanFeaturesForEditor,
  listPlanPrices,
  listPlansWithCounts,
  listSubscriptionsForAdmin,
  type SubscriptionBillingInterval,
  type SubscriptionPlanStatus,
  updateFeature,
  updatePlan,
  updatePlanPrice,
  upsertPlanFeature,
  deletePlan,
  getUsageRowsForSubscription,
} from '@/lib/db/queries/subscriptions';
import { getUserWithRoles } from '@/lib/db/user-helpers';
import {
  getPlanFeatures as getEnforcedPlanFeatures,
  getUserSubscription,
  type SubscriptionContext,
  type SubscriptionPlanFeature,
} from '@/lib/subscriptions/enforcement';
import { isRazorpayEnabled } from '@/lib/payments/config';
import type {
  AdminCreateFeatureInput,
  AdminCreatePlanInput,
  AdminCreatePlanPriceInput,
  AdminPlanFeatureUpsertInput,
  AdminSubscriptionAnalyticsInput,
  AdminSubscriptionListInput,
  AdminSubscriptionStatsInput,
  AdminUpdateFeatureInput,
  AdminUpdatePlanInput,
  AdminUpdatePlanPriceInput,
  SelectSubscriptionPlanInput,
  SubscriptionScopeInput,
} from './schemas';

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getUserWithRoles>>>;
type AudienceFilter = 'all' | 'mentor' | 'mentee';

interface AnalyticsOverview {
  totalEvents: number;
  uniqueActiveUsers: number;
  featuresAtLimit: number;
  limitBreachCount: number;
}

interface AnalyticsResponse {
  overview: AnalyticsOverview;
  usageByFeature: Array<{
    featureKey: string;
    featureName: string;
    unit: string | null;
    totalUsage: number;
    averageLimit: number;
  }>;
  usageOverTime: Array<{
    date: string;
    eventCount: number;
    uniqueUsers: number;
  }>;
  limitBreaches: Array<{
    userName: string;
    userEmail: string;
    featureName: string;
    featureKey: string;
    usageCount: number;
    limitCount: number;
    limitReachedAt: string | null;
  }>;
  planDistribution: Array<{
    planName: string;
    planKey: string;
    audience: 'mentor' | 'mentee';
    activeCount: number;
  }>;
  topConsumers: Array<{
    userName: string;
    userEmail: string;
    totalEvents: number;
    totalCount: number;
    totalMinutes: number;
  }>;
}

export class SubscriptionServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly data?: unknown
  ) {
    super(message);
    this.name = 'SubscriptionServiceError';
  }
}

function assertSubscription(
  condition: unknown,
  status: number,
  message: string,
  data?: unknown
): asserts condition {
  if (!condition) {
    throw new SubscriptionServiceError(status, message, data);
  }
}

async function getSubscriptionActor(
  userId: string,
  currentUser?: CurrentUser
): Promise<CurrentUser> {
  const resolvedUser = currentUser ?? (await getUserWithRoles(userId));
  assertSubscription(resolvedUser, 401, 'Authentication required');
  return resolvedUser;
}

function roleSet(user: CurrentUser) {
  return new Set(user.roles.map((role: { name: string }) => role.name));
}

function resolveSubscriptionContext(
  input?: SubscriptionScopeInput
): SubscriptionContext | undefined {
  if (!input?.audience) {
    return undefined;
  }

  return {
    audience: input.audience,
    actorRole: input.audience,
  };
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function addInterval(
  date: Date,
  interval: SubscriptionBillingInterval,
  count: number
) {
  const result = new Date(date);
  switch (interval) {
    case 'day':
      result.setDate(result.getDate() + count);
      break;
    case 'week':
      result.setDate(result.getDate() + count * 7);
      break;
    case 'year':
      result.setFullYear(result.getFullYear() + count);
      break;
    case 'month':
    default:
      result.setMonth(result.getMonth() + count);
      break;
  }
  return result;
}

function parseDateParam(
  value: string | undefined,
  fallback: Date,
  endOfDay: boolean
) {
  if (!value) {
    return fallback;
  }

  const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
  const normalized = dateOnlyPattern.test(value)
    ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
    : value;
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw new SubscriptionServiceError(
      400,
      `Invalid date format: ${value}`
    );
  }

  return parsed;
}

function getDateKey(value: string) {
  return value.slice(0, 10);
}

function getDateRangeKeys(start: Date, end: Date) {
  const keys: string[] = [];
  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  );
  const endUtcDate = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  );

  while (cursor.getTime() <= endUtcDate.getTime()) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return keys;
}

function getUsageMetricValue(
  valueType: string,
  usageCount: number,
  usageMinutes: number,
  usageAmount: number | string | null
) {
  if (valueType === 'minutes') return usageMinutes || 0;
  if (valueType === 'amount') return toNumber(usageAmount);
  if (valueType === 'count') return usageCount || 0;
  if (usageCount) return usageCount;
  if (usageMinutes) return usageMinutes;
  return toNumber(usageAmount);
}

function getLimitValue(
  valueType: string,
  planLimit: {
    limit_count: number | null;
    limit_minutes: number | null;
    limit_amount: number | string | null;
  } | null
) {
  if (!planLimit) return null;
  if (valueType === 'minutes') return planLimit.limit_minutes ?? null;
  if (valueType === 'amount') {
    const amount = toNumber(planLimit.limit_amount);
    return amount > 0 ? amount : null;
  }
  if (valueType === 'count') return planLimit.limit_count ?? null;
  return (
    planLimit.limit_count ??
    planLimit.limit_minutes ??
    toNumber(planLimit.limit_amount)
  );
}

function emptyAnalyticsPayload(): AnalyticsResponse {
  return {
    overview: {
      totalEvents: 0,
      uniqueActiveUsers: 0,
      featuresAtLimit: 0,
      limitBreachCount: 0,
    },
    usageByFeature: [],
    usageOverTime: [],
    limitBreaches: [],
    planDistribution: [],
    topConsumers: [],
  };
}

async function getAnalyticsUsersById(userIds: string[]) {
  if (userIds.length === 0) {
    return new Map<string, { id: string; name: string | null; email: string | null }>();
  }

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(inArray(users.id, userIds));

  return new Map(rows.map((row) => [row.id, row]));
}

export async function getSelfSubscription(
  userId: string,
  input?: SubscriptionScopeInput,
  currentUser?: CurrentUser
) {
  await getSubscriptionActor(userId, currentUser);

  const subscriptionContext = resolveSubscriptionContext(input);

  try {
    const [subscription, features] = await Promise.all([
      getUserSubscription(userId, subscriptionContext),
      getEnforcedPlanFeatures(userId, subscriptionContext),
    ]);

    return {
      subscription,
      features,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '';
    if (errorMessage.includes('audience context is required')) {
      throw new SubscriptionServiceError(
        409,
        'Multiple active subscriptions found. Please provide audience=mentor|mentee.'
      );
    }

    return {
      subscription: null,
      features: [] as SubscriptionPlanFeature[],
    };
  }
}

export async function getSelfSubscriptionUsage(
  userId: string,
  input?: SubscriptionScopeInput,
  currentUser?: CurrentUser
) {
  await getSubscriptionActor(userId, currentUser);

  const subscriptionContext = resolveSubscriptionContext(input);

  try {
    const subscription = await getUserSubscription(userId, subscriptionContext);
    const planFeatures = await getEnforcedPlanFeatures(userId, subscriptionContext);
    const usageRows = await getUsageRowsForSubscription(subscription.subscription_id);

    type UsageRow = Awaited<ReturnType<typeof getUsageRowsForSubscription>>[number];
    const usageByFeatureKey = new Map<string, UsageRow>(
      usageRows.map((item) => [item.subscription_features?.feature_key, item])
    );

    return planFeatures.filter((feature) => feature.is_metered).map((feature) => {
      const usage = usageByFeatureKey.get(feature.feature_key);
      return {
        feature_key: feature.feature_key,
        name: feature.feature_name,
        value_type: feature.value_type,
        unit: feature.unit ?? null,
        usage_count: usage?.usage_count ?? 0,
        usage_minutes: usage?.usage_minutes ?? 0,
        usage_amount: usage?.usage_amount ?? 0,
        usage_json: usage?.usage_json ?? {},
        period_start: usage?.period_start ?? subscription.current_period_start,
        period_end: usage?.period_end ?? subscription.current_period_end,
        limit_reached: usage?.limit_reached ?? false,
        limit_count: feature.limit_count,
        limit_minutes: feature.limit_minutes,
        limit_amount: feature.limit_amount,
        limit_percent: feature.limit_percent,
        limit_text: feature.limit_text,
        limit_interval: feature.limit_interval,
        limit_interval_count: feature.limit_interval_count,
      };
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '';
    if (errorMessage.includes('audience context is required')) {
      throw new SubscriptionServiceError(
        409,
        'Multiple active subscriptions found. Please provide audience=mentor|mentee.'
      );
    }

    return [];
  }
}

export async function selectSelfSubscriptionPlan(
  userId: string,
  input: SelectSubscriptionPlanInput,
  currentUser?: CurrentUser
) {
  const actor = await getSubscriptionActor(userId, currentUser);
  const roles = roleSet(actor);

  const plan = await getPlanBasic(input.planId);
  assertSubscription(plan, 404, 'Plan not found');

  const isAdmin = roles.has('admin');
  if (!isAdmin) {
    const allowedAudiences = new Set<string>();
    if (roles.has('mentor')) allowedAudiences.add('mentor');
    if (roles.has('mentee')) allowedAudiences.add('mentee');

    assertSubscription(
      allowedAudiences.has(plan.audience),
      403,
      'Plan audience does not match your role'
    );
  }

  let periodEnd = addInterval(new Date(), 'month', 1);
  let selectedPriceId = input.priceId ?? null;

  if (input.priceId) {
    const price = await getPlanPrice(input.priceId);
    assertSubscription(price && price.plan_id === input.planId, 400, 'Invalid price');
    if (isRazorpayEnabled() && toNumber(price.amount) > 0) {
      throw new SubscriptionServiceError(
        402,
        'Paid subscription plans must be selected through payment checkout.'
      );
    }

    periodEnd = addInterval(
      new Date(),
      price.billing_interval || 'month',
      price.billing_interval_count || 1
    );
  } else if (isRazorpayEnabled()) {
    const prices = await listPlanPrices(input.planId);
    const hasActivePaidPrice = prices.some(
      (price) => price.is_active && toNumber(price.amount) > 0
    );

    if (hasActivePaidPrice) {
      throw new SubscriptionServiceError(
        402,
        'Paid subscription plans must be selected through payment checkout.'
      );
    }
  }

  await cancelActiveSubscriptionsForUser(userId);

  const now = new Date();
  return createSubscription({
    user_id: userId,
    plan_id: input.planId,
    price_id: selectedPriceId,
    status: input.status || 'active',
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
  });
}

export async function getAdminSubscriptionStats(
  _input?: AdminSubscriptionStatsInput
) {
  const data = await getSubscriptionStats();

  return {
    totalPlans: data.total_plans || 0,
    activePlans: data.active_plans || 0,
    totalFeatures: data.total_features || 0,
    activeSubscriptions: data.active_subscriptions || 0,
  };
}

export async function listAdminSubscriptionPlans() {
  return listPlansWithCounts();
}

export async function createAdminSubscriptionPlan(input: AdminCreatePlanInput) {
  if (await findPlanByKey(input.plan_key)) {
    throw new SubscriptionServiceError(409, 'Plan key already exists');
  }

  return createPlan({
    plan_key: input.plan_key,
    audience: input.audience,
    name: input.name,
    description: input.description,
    status: input.status,
  });
}

export async function updateAdminSubscriptionPlan(input: AdminUpdatePlanInput) {
  const data = await updatePlan(input.planId, {
    name: input.name,
    description: input.description,
    status: input.status as SubscriptionPlanStatus | undefined,
    sort_order: input.sort_order,
    metadata: input.metadata as Record<string, any> | undefined,
  });

  assertSubscription(data, 404, 'Plan not found');
  return data;
}

export async function deleteAdminSubscriptionPlan(planId: string) {
  await deletePlan(planId);
  return { success: true };
}

export async function listAdminSubscriptionFeatures() {
  return listFeatures();
}

export async function listAdminSubscriptionFeatureCategories() {
  return listFeatureCategories();
}

export async function createAdminSubscriptionFeature(
  input: AdminCreateFeatureInput
) {
  if (await featureKeyExists(input.feature_key)) {
    throw new SubscriptionServiceError(
      409,
      `Feature key '${input.feature_key}' already exists`
    );
  }

  return createFeature({
    feature_key: input.feature_key,
    name: input.name,
    description: input.description?.trim() || null,
    category_id: input.category_id || null,
    value_type: input.value_type,
    unit: input.unit?.trim() || null,
    is_metered: input.is_metered,
  });
}

export async function updateAdminSubscriptionFeature(
  input: AdminUpdateFeatureInput
) {
  if (
    input.feature_key &&
    (await featureKeyExists(input.feature_key, input.featureId))
  ) {
    throw new SubscriptionServiceError(
      409,
      `Feature key '${input.feature_key}' already exists`
    );
  }

  const data = await updateFeature(input.featureId, {
    name: input.name,
    feature_key: input.feature_key,
    description: input.description,
    category_id: input.category_id,
    value_type: input.value_type,
    unit: input.unit,
    is_metered: input.is_metered,
  });

  assertSubscription(data, 404, 'Feature not found');
  return data;
}

export async function listAdminSubscriptionPlanFeatures(planId: string) {
  return listPlanFeaturesForEditor(planId);
}

export async function upsertAdminSubscriptionPlanFeature(
  input: AdminPlanFeatureUpsertInput
) {
  const data = await upsertPlanFeature(input.planId, {
    feature_id: input.feature_id,
    is_included: input.is_included,
    limit_count: input.limit_count,
    limit_minutes: input.limit_minutes,
    limit_text: input.limit_text,
    limit_amount: input.limit_amount,
    limit_currency: input.limit_currency,
    limit_percent: input.limit_percent,
    limit_json: (input.limit_json as Record<string, any> | null | undefined) ?? null,
    limit_interval: input.limit_interval,
    limit_interval_count: input.limit_interval_count,
  });

  assertSubscription(data, 404, 'Plan feature could not be saved');
  return data;
}

export async function listAdminSubscriptionPlanPrices(planId: string) {
  return listPlanPrices(planId);
}

export async function createAdminSubscriptionPlanPrice(
  input: AdminCreatePlanPriceInput
) {
  return createPlanPrice(input.planId, {
    price_type: input.price_type,
    billing_interval: input.billing_interval,
    billing_interval_count: input.billing_interval_count,
    amount: input.amount,
    currency: input.currency,
    is_active: input.is_active,
    effective_from: input.effective_from,
    effective_to: input.effective_to,
  });
}

export async function updateAdminSubscriptionPlanPrice(
  input: AdminUpdatePlanPriceInput
) {
  const data = await updatePlanPrice(input.planId, input.priceId, {
    price_type: input.price_type,
    billing_interval: input.billing_interval,
    billing_interval_count: input.billing_interval_count,
    amount: input.amount,
    currency: input.currency,
    is_active: input.is_active,
    effective_from: input.effective_from,
    effective_to: input.effective_to,
  });

  assertSubscription(data, 404, 'Price not found');
  return data;
}

export async function listAdminSubscriptions(input: AdminSubscriptionListInput) {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 25;
  const audience = input.audience ?? 'all';

  const result = await listSubscriptionsForAdmin({
    statuses: input.statuses,
    audience,
    page,
    pageSize,
  });

  return {
    data: result.rows,
    meta: {
      page,
      pageSize,
      total: result.total || 0,
    },
  };
}

export async function getAdminSubscriptionAnalytics(
  input?: AdminSubscriptionAnalyticsInput
) {
  const today = new Date();
  const defaultEnd = new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
      23,
      59,
      59,
      999
    )
  );
  const defaultStart = new Date(defaultEnd);
  defaultStart.setUTCDate(defaultStart.getUTCDate() - 30);
  defaultStart.setUTCHours(0, 0, 0, 0);

  const startDate = parseDateParam(input?.startDate, defaultStart, false);
  const endDate = parseDateParam(input?.endDate, defaultEnd, true);

  if (startDate.getTime() > endDate.getTime()) {
    throw new SubscriptionServiceError(
      400,
      'startDate must be earlier than or equal to endDate.'
    );
  }

  const audience = (input?.audience ?? 'all') as AudienceFilter;
  const result = await getAnalyticsData(
    startDate.toISOString(),
    endDate.toISOString(),
    audience
  );

  if (
    !result.events.length &&
    !result.usageByFeatureRows.length &&
    !result.planDistribution.length
  ) {
    return emptyAnalyticsPayload();
  }

  const overview: AnalyticsOverview = {
    totalEvents: result.events.length,
    uniqueActiveUsers: new Set(
      result.events.map((event: any) => event.user_id).filter(Boolean)
    ).size,
    featuresAtLimit: result.featuresAtLimitCount,
    limitBreachCount: result.events.filter((event: any) =>
      Boolean(event.limit_exceeded)
    ).length,
  };

  const planFeatureLimitMap = new Map<
    string,
    {
      limit_count: number | null;
      limit_minutes: number | null;
      limit_amount: number | string | null;
    }
  >();

  for (const row of result.planLimits) {
    planFeatureLimitMap.set(`${row.plan_id}:${row.feature_id}`, row);
  }

  const usageByFeatureAccumulator = new Map<
    string,
    {
      featureKey: string;
      featureName: string;
      unit: string | null;
      totalUsage: number;
      totalLimit: number;
      limitSamples: number;
    }
  >();

  for (const row of result.usageByFeatureRows) {
    const usageValue = getUsageMetricValue(
      row.value_type,
      row.usage_count,
      row.usage_minutes,
      row.usage_amount
    );

    const current = usageByFeatureAccumulator.get(row.feature_key) || {
      featureKey: row.feature_key,
      featureName: row.name,
      unit: row.unit,
      totalUsage: 0,
      totalLimit: 0,
      limitSamples: 0,
    };

    current.totalUsage += usageValue;

    const limitValue = getLimitValue(
      row.value_type,
      planFeatureLimitMap.get(`${row.plan_id}:${row.feature_id}`) || null
    );

    if (limitValue !== null) {
      current.totalLimit += limitValue;
      current.limitSamples += 1;
    }

    usageByFeatureAccumulator.set(row.feature_key, current);
  }

  const usageByFeature = Array.from(usageByFeatureAccumulator.values())
    .map((row) => ({
      featureKey: row.featureKey,
      featureName: row.featureName,
      unit: row.unit,
      totalUsage: Number(row.totalUsage.toFixed(2)),
      averageLimit:
        row.limitSamples > 0
          ? Number((row.totalLimit / row.limitSamples).toFixed(2))
          : 0,
    }))
    .sort((a, b) => b.totalUsage - a.totalUsage);

  const eventBuckets = new Map<
    string,
    { eventCount: number; uniqueUsers: Set<string> }
  >();
  for (const key of getDateRangeKeys(startDate, endDate)) {
    eventBuckets.set(key, { eventCount: 0, uniqueUsers: new Set() });
  }

  for (const event of result.events) {
    const key = getDateKey(new Date(event.created_at).toISOString());
    const bucket = eventBuckets.get(key);
    if (!bucket) {
      continue;
    }

    bucket.eventCount += 1;
    if (event.user_id) {
      bucket.uniqueUsers.add(event.user_id);
    }
  }

  const usageOverTime = Array.from(eventBuckets.entries()).map(([date, bucket]) => ({
    date,
    eventCount: bucket.eventCount,
    uniqueUsers: bucket.uniqueUsers.size,
  }));

  const breachedUserIds = Array.from(
    new Set(
      result.limitBreaches
        .map((row: any) => row.user_id)
        .filter((userId: string | null): userId is string => Boolean(userId))
    )
  );
  const breachUsersById = await getAnalyticsUsersById(breachedUserIds);

  const limitBreaches = result.limitBreaches.map((row: any) => {
    const user = row.user_id ? breachUsersById.get(row.user_id) : null;
    const usageValue = getUsageMetricValue(
      row.value_type,
      row.usage_count,
      row.usage_minutes,
      row.usage_amount
    );
    const planLimit = planFeatureLimitMap.get(`${row.plan_id}:${row.feature_id}`) || null;
    const limitValue = getLimitValue(row.value_type, planLimit);

    return {
      userName: user?.name || 'Unknown user',
      userEmail: user?.email || 'No email',
      featureName: row.name,
      featureKey: row.feature_key,
      usageCount: Number(usageValue.toFixed(2)),
      limitCount: limitValue === null ? 0 : Number(limitValue.toFixed(2)),
      limitReachedAt: row.limit_reached_at
        ? new Date(row.limit_reached_at).toISOString()
        : null,
    };
  });

  const planDistribution = result.planDistribution.map((row: any) => ({
    planName: row.name,
    planKey: row.plan_key,
    audience: row.audience,
    activeCount: row.active_count,
  }));

  const consumerStats = new Map<
    string,
    { totalEvents: number; totalCount: number; totalMinutes: number }
  >();
  for (const event of result.events) {
    if (!event.user_id) continue;
    const current = consumerStats.get(event.user_id) || {
      totalEvents: 0,
      totalCount: 0,
      totalMinutes: 0,
    };
    current.totalEvents += 1;
    current.totalCount += event.count_delta ?? 0;
    current.totalMinutes += event.minutes_delta ?? 0;
    consumerStats.set(event.user_id, current);
  }

  const topConsumerIds = Array.from(consumerStats.keys());
  const topUsersById = await getAnalyticsUsersById(topConsumerIds);

  const topConsumers = Array.from(consumerStats.entries())
    .map(([userId, stats]) => {
      const user = topUsersById.get(userId);
      return {
        userName: user?.name || 'Unknown user',
        userEmail: user?.email || 'No email',
        totalEvents: stats.totalEvents,
        totalCount: stats.totalCount,
        totalMinutes: stats.totalMinutes,
      };
    })
    .sort((a, b) => {
      if (b.totalEvents !== a.totalEvents) {
        return b.totalEvents - a.totalEvents;
      }
      if (b.totalCount !== a.totalCount) {
        return b.totalCount - a.totalCount;
      }
      return b.totalMinutes - a.totalMinutes;
    })
    .slice(0, 10);

  return {
    overview,
    usageByFeature,
    usageOverTime,
    limitBreaches,
    planDistribution,
    topConsumers,
  };
}
