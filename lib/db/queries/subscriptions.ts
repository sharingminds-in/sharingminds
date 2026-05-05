import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  subscriptionFeatureCategories,
  subscriptionFeatures,
  subscriptionPlanFeatures,
  subscriptionPlanPrices,
  subscriptionPlans,
  subscriptions,
  subscriptionUsageEvents,
  subscriptionUsageTracking,
  users,
} from '@/lib/db/schema';

export type SubscriptionAudience = 'mentor' | 'mentee';
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'paused'
  | 'canceled'
  | 'incomplete'
  | 'expired';
export type SubscriptionPlanStatus = 'draft' | 'active' | 'archived';
export type SubscriptionBillingInterval = 'day' | 'week' | 'month' | 'year';
export type SubscriptionFeatureValueType =
  | 'boolean'
  | 'count'
  | 'minutes'
  | 'text'
  | 'amount'
  | 'percent'
  | 'json';

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === 'object') {
    return value as T;
  }
  return fallback;
}

function toIsoString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  return null;
}

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] || null : value;
}

export interface ActiveSubscriptionRow {
  subscription_id: string;
  plan_id: string;
  plan_key: string;
  plan_name: string;
  audience: SubscriptionAudience;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
}

export interface PlanFeatureRow {
  feature_key: string;
  feature_name: string;
  is_included: boolean;
  value_type: SubscriptionFeatureValueType;
  unit: string | null;
  limit_count: number | null;
  limit_minutes: number | null;
  limit_text: string | null;
  limit_amount: number | null;
  limit_percent: number | null;
  limit_json: Record<string, any> | null;
  limit_interval: SubscriptionBillingInterval | null;
  limit_interval_count: number;
  is_metered: boolean;
}

export interface UsageTrackingSummary {
  usage_count: number;
  usage_minutes: number;
  usage_amount: number;
  usage_json: Record<string, any>;
  period_start: string;
  period_end: string;
  limit_reached: boolean;
}

export interface FeatureLookup {
  id: string;
  feature_key: string;
  is_metered: boolean;
  value_type: SubscriptionFeatureValueType;
}

export interface AdminSubscriptionListOptions {
  statuses?: string[];
  audience?: 'all' | SubscriptionAudience;
  page: number;
  pageSize: number;
}

function buildPlanFeaturePayloadRows(
  features: Array<any>,
  assignments: Array<any>
) {
  const byFeatureId = new Map<string, any[]>();
  for (const assignment of assignments) {
    const rows = byFeatureId.get(assignment.feature_id) || [];
    rows.push(assignment);
    byFeatureId.set(assignment.feature_id, rows);
  }

  return features.map((feature) => ({
    id: feature.id,
    feature_key: feature.feature_key,
    name: feature.name,
    description: feature.description,
    value_type: feature.value_type,
    unit: feature.unit,
    is_metered: feature.is_metered,
    subscription_feature_categories: feature.category_id
      ? { name: feature.category_name, icon: feature.category_icon }
      : null,
    subscription_plan_features: byFeatureId.get(feature.id) || [],
  }));
}

export async function getActiveSubscriptionsByUserId(userId: string): Promise<ActiveSubscriptionRow[]> {
  const rows = await db
    .select({
      subscription_id: subscriptions.id,
      plan_id: subscriptionPlans.id,
      plan_key: subscriptionPlans.planKey,
      plan_name: subscriptionPlans.name,
      audience: subscriptionPlans.audience,
      status: subscriptions.status,
      current_period_start: subscriptions.currentPeriodStart,
      current_period_end: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptions.planId))
    .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, ['trialing', 'active'])))
    .orderBy(desc(subscriptions.createdAt));

  return rows.map((row: typeof rows[number]) => ({
    ...row,
    current_period_start: toIsoString(row.current_period_start),
    current_period_end: toIsoString(row.current_period_end),
  }));
}

export async function getPlanFeaturesByPlanId(planId: string): Promise<PlanFeatureRow[]> {
  const rows = await db
    .select({
      feature_key: subscriptionFeatures.featureKey,
      feature_name: subscriptionFeatures.name,
      is_included: subscriptionPlanFeatures.isIncluded,
      value_type: subscriptionFeatures.valueType,
      unit: subscriptionFeatures.unit,
      limit_count: subscriptionPlanFeatures.limitCount,
      limit_minutes: subscriptionPlanFeatures.limitMinutes,
      limit_text: subscriptionPlanFeatures.limitText,
      limit_amount: subscriptionPlanFeatures.limitAmount,
      limit_percent: subscriptionPlanFeatures.limitPercent,
      limit_json: subscriptionPlanFeatures.limitJson,
      limit_interval: subscriptionPlanFeatures.limitInterval,
      limit_interval_count: subscriptionPlanFeatures.limitIntervalCount,
      is_metered: subscriptionFeatures.isMetered,
    })
    .from(subscriptionPlanFeatures)
    .innerJoin(subscriptionFeatures, eq(subscriptionFeatures.id, subscriptionPlanFeatures.featureId))
    .where(and(eq(subscriptionPlanFeatures.planId, planId), eq(subscriptionPlanFeatures.isIncluded, true)));

  return rows.map((row: typeof rows[number]) => ({
    ...row,
    limit_amount: row.limit_amount === null ? null : toNumber(row.limit_amount),
    limit_percent: row.limit_percent === null ? null : toNumber(row.limit_percent),
    limit_json: normalizeJson<Record<string, any> | null>(row.limit_json, null),
  }));
}

export async function getFeatureByKey(featureKey: string): Promise<FeatureLookup | null> {
  const [row] = await db
    .select({
      id: subscriptionFeatures.id,
      feature_key: subscriptionFeatures.featureKey,
      is_metered: subscriptionFeatures.isMetered,
      value_type: subscriptionFeatures.valueType,
    })
    .from(subscriptionFeatures)
    .where(eq(subscriptionFeatures.featureKey, featureKey))
    .limit(1);

  return row || null;
}

export async function getCurrentUsageForFeature(
  subscriptionId: string,
  featureId: string
): Promise<UsageTrackingSummary | null> {
  const now = new Date();
  const [row] = await db
    .select({
      usage_count: subscriptionUsageTracking.usageCount,
      usage_minutes: subscriptionUsageTracking.usageMinutes,
      usage_amount: subscriptionUsageTracking.usageAmount,
      usage_json: subscriptionUsageTracking.usageJson,
      period_start: subscriptionUsageTracking.periodStart,
      period_end: subscriptionUsageTracking.periodEnd,
      limit_reached: subscriptionUsageTracking.limitReached,
    })
    .from(subscriptionUsageTracking)
    .where(
      and(
        eq(subscriptionUsageTracking.subscriptionId, subscriptionId),
        eq(subscriptionUsageTracking.featureId, featureId),
        sql`${subscriptionUsageTracking.periodStart} <= ${now.toISOString()}`,
        sql`${subscriptionUsageTracking.periodEnd} >= ${now.toISOString()}`
      )
    )
    .limit(1);

  if (!row) return null;

  return {
    usage_count: row.usage_count ?? 0,
    usage_minutes: row.usage_minutes ?? 0,
    usage_amount: toNumber(row.usage_amount),
    usage_json: normalizeJson<Record<string, any>>(row.usage_json, {}),
    period_start: toIsoString(row.period_start) ?? '',
    period_end: toIsoString(row.period_end) ?? '',
    limit_reached: row.limit_reached ?? false,
  };
}

export async function getUsageRowsForSubscription(subscriptionId: string) {
  const rows = await db
    .select({
      usage_count: subscriptionUsageTracking.usageCount,
      usage_minutes: subscriptionUsageTracking.usageMinutes,
      usage_amount: subscriptionUsageTracking.usageAmount,
      usage_json: subscriptionUsageTracking.usageJson,
      period_start: subscriptionUsageTracking.periodStart,
      period_end: subscriptionUsageTracking.periodEnd,
      limit_reached: subscriptionUsageTracking.limitReached,
      feature_key: subscriptionFeatures.featureKey,
      feature_name: subscriptionFeatures.name,
      value_type: subscriptionFeatures.valueType,
      unit: subscriptionFeatures.unit,
      is_metered: subscriptionFeatures.isMetered,
    })
    .from(subscriptionUsageTracking)
    .innerJoin(subscriptionFeatures, eq(subscriptionFeatures.id, subscriptionUsageTracking.featureId))
    .where(eq(subscriptionUsageTracking.subscriptionId, subscriptionId));

  return rows.map((row: typeof rows[number]) => ({
    usage_count: row.usage_count ?? 0,
    usage_minutes: row.usage_minutes ?? 0,
    usage_amount: toNumber(row.usage_amount),
    usage_json: normalizeJson<Record<string, any>>(row.usage_json, {}),
    period_start: toIsoString(row.period_start) ?? '',
    period_end: toIsoString(row.period_end) ?? '',
    limit_reached: row.limit_reached ?? false,
    subscription_features: {
      feature_key: row.feature_key,
      name: row.feature_name,
      value_type: row.value_type,
      unit: row.unit,
      is_metered: row.is_metered,
    },
  }));
}

export async function listActiveSubscriptionUserIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();

  const rows = await db
    .select({ user_id: subscriptions.userId })
    .from(subscriptions)
    .where(and(inArray(subscriptions.userId, userIds), inArray(subscriptions.status, ['trialing', 'active'])));

  return new Set(rows.map((row: typeof rows[number]) => row.user_id));
}

export async function listFeatureCategories() {
  const rows = await db
    .select({
      id: subscriptionFeatureCategories.id,
      category_key: subscriptionFeatureCategories.categoryKey,
      name: subscriptionFeatureCategories.name,
      description: subscriptionFeatureCategories.description,
      icon: subscriptionFeatureCategories.icon,
      sort_order: subscriptionFeatureCategories.sortOrder,
    })
    .from(subscriptionFeatureCategories)
    .orderBy(subscriptionFeatureCategories.sortOrder);

  return rows;
}

export async function listFeatures() {
  const rows = await db
    .select({
      id: subscriptionFeatures.id,
      category_id: subscriptionFeatures.categoryId,
      feature_key: subscriptionFeatures.featureKey,
      name: subscriptionFeatures.name,
      description: subscriptionFeatures.description,
      value_type: subscriptionFeatures.valueType,
      unit: subscriptionFeatures.unit,
      is_metered: subscriptionFeatures.isMetered,
      metadata: subscriptionFeatures.metadata,
      created_at: subscriptionFeatures.createdAt,
      category_name: subscriptionFeatureCategories.name,
    })
    .from(subscriptionFeatures)
    .leftJoin(subscriptionFeatureCategories, eq(subscriptionFeatureCategories.id, subscriptionFeatures.categoryId))
    .orderBy(desc(subscriptionFeatures.createdAt));

  return rows.map((row: typeof rows[number]) => ({
    ...row,
    category_name: row.category_name || null,
    created_at: toIsoString(row.created_at) ?? '',
  }));
}

export async function featureKeyExists(featureKey: string, excludeId?: string): Promise<boolean> {
  const base = await db
    .select({ id: subscriptionFeatures.id })
    .from(subscriptionFeatures)
    .where(eq(subscriptionFeatures.featureKey, featureKey));

  if (!excludeId) {
    return base.length > 0;
  }

  return base.some((row: typeof base[number]) => row.id !== excludeId);
}

export async function createFeature(input: {
  feature_key: string;
  name: string;
  description: string | null;
  category_id: string | null;
  value_type: SubscriptionFeatureValueType;
  unit: string | null;
  is_metered: boolean;
}) {
  const [row] = await db
    .insert(subscriptionFeatures)
    .values({
      featureKey: input.feature_key,
      name: input.name,
      description: input.description,
      categoryId: input.category_id,
      valueType: input.value_type,
      unit: input.unit,
      isMetered: input.is_metered,
      metadata: {},
    })
    .returning({
      id: subscriptionFeatures.id,
      category_id: subscriptionFeatures.categoryId,
      feature_key: subscriptionFeatures.featureKey,
      name: subscriptionFeatures.name,
      description: subscriptionFeatures.description,
      value_type: subscriptionFeatures.valueType,
      unit: subscriptionFeatures.unit,
      is_metered: subscriptionFeatures.isMetered,
    });

  const category = row.category_id
    ? firstOf(
        await db
          .select({ name: subscriptionFeatureCategories.name })
          .from(subscriptionFeatureCategories)
          .where(eq(subscriptionFeatureCategories.id, row.category_id))
          .limit(1)
      )
    : null;

  return {
    ...row,
    category_name: category?.name || null,
  };
}

export async function updateFeature(
  featureId: string,
  updates: Partial<{
    name: string;
    feature_key: string;
    description: string | null;
    category_id: string | null;
    value_type: SubscriptionFeatureValueType;
    unit: string | null;
    is_metered: boolean;
  }>
) {
  const [row] = await db
    .update(subscriptionFeatures)
    .set({
      name: updates.name,
      featureKey: updates.feature_key,
      description: updates.description,
      categoryId: updates.category_id,
      valueType: updates.value_type,
      unit: updates.unit,
      isMetered: updates.is_metered,
      updatedAt: new Date(),
    })
    .where(eq(subscriptionFeatures.id, featureId))
    .returning({
      id: subscriptionFeatures.id,
      category_id: subscriptionFeatures.categoryId,
      feature_key: subscriptionFeatures.featureKey,
      name: subscriptionFeatures.name,
      description: subscriptionFeatures.description,
      value_type: subscriptionFeatures.valueType,
      unit: subscriptionFeatures.unit,
      is_metered: subscriptionFeatures.isMetered,
    });

  if (!row) return null;

  const category = row.category_id
    ? firstOf(
        await db
          .select({ name: subscriptionFeatureCategories.name })
          .from(subscriptionFeatureCategories)
          .where(eq(subscriptionFeatureCategories.id, row.category_id))
          .limit(1)
      )
    : null;

  return {
    ...row,
    category_name: category?.name || null,
  };
}

export async function listPlansWithCounts() {
  const rows = await db.execute(sql<{
    id: string;
    plan_key: string;
    audience: SubscriptionAudience;
    name: string;
    description: string | null;
    status: SubscriptionPlanStatus;
    sort_order: number;
    metadata: Record<string, any> | null;
    created_at: Date;
    feature_count: number;
    price_count: number;
  }>`
    SELECT
      sp.id,
      sp.plan_key,
      sp.audience,
      sp.name,
      sp.description,
      sp.status,
      sp.sort_order,
      sp.metadata,
      sp.created_at,
      COUNT(DISTINCT spf.id)::int AS feature_count,
      COUNT(DISTINCT spp.id)::int AS price_count
    FROM subscription_plans sp
    LEFT JOIN subscription_plan_features spf ON spf.plan_id = sp.id
    LEFT JOIN subscription_plan_prices spp ON spp.plan_id = sp.id
    GROUP BY sp.id
    ORDER BY sp.sort_order ASC, sp.created_at DESC
  `);

  return rows.map((row: typeof rows[number]) => ({
    ...row,
    metadata: normalizeJson<Record<string, any>>(row.metadata, {}),
    created_at: toIsoString(row.created_at) ?? '',
  }));
}

export async function findPlanByKey(planKey: string) {
  const [row] = await db
    .select({ id: subscriptionPlans.id })
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.planKey, planKey))
    .limit(1);
  return row || null;
}

export async function getMaxPlanSortOrder(audience: SubscriptionAudience) {
  const [row] = await db
    .select({ sort_order: subscriptionPlans.sortOrder })
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.audience, audience))
    .orderBy(desc(subscriptionPlans.sortOrder))
    .limit(1);

  return row?.sort_order ?? 0;
}

export async function createPlan(input: {
  plan_key: string;
  audience: SubscriptionAudience;
  name: string;
  description?: string;
  status: 'draft' | 'active';
}) {
  const [row] = await db
    .insert(subscriptionPlans)
    .values({
      planKey: input.plan_key,
      audience: input.audience,
      name: input.name,
      description: input.description || null,
      status: input.status,
      sortOrder: (await getMaxPlanSortOrder(input.audience)) + 1,
      metadata: {},
    })
    .returning();

  return row;
}

export async function updatePlan(
  planId: string,
  updates: Partial<{
    name: string;
    description: string | null;
    status: SubscriptionPlanStatus;
    sort_order: number;
    metadata: Record<string, any>;
  }>
) {
  const [row] = await db
    .update(subscriptionPlans)
    .set({
      name: updates.name,
      description: updates.description,
      status: updates.status,
      sortOrder: updates.sort_order,
      metadata: updates.metadata,
      updatedAt: new Date(),
    })
    .where(eq(subscriptionPlans.id, planId))
    .returning();
  return row || null;
}

export async function deletePlan(planId: string) {
  await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, planId));
}

export async function getPlanBasic(planId: string) {
  const [row] = await db
    .select({
      id: subscriptionPlans.id,
      audience: subscriptionPlans.audience,
      name: subscriptionPlans.name,
      plan_key: subscriptionPlans.planKey,
    })
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, planId))
    .limit(1);

  return row || null;
}

export async function listPlanFeaturesForEditor(planId: string) {
  const features = await db.execute(sql<{
    id: string;
    feature_key: string;
    name: string;
    description: string | null;
    value_type: SubscriptionFeatureValueType;
    unit: string | null;
    is_metered: boolean;
    category_id: string | null;
    category_name: string | null;
    category_icon: string | null;
  }>`
    SELECT
      sf.id,
      sf.feature_key,
      sf.name,
      sf.description,
      sf.value_type,
      sf.unit,
      sf.is_metered,
      sf.category_id,
      sfc.name AS category_name,
      sfc.icon AS category_icon
    FROM subscription_features sf
    LEFT JOIN subscription_feature_categories sfc ON sfc.id = sf.category_id
    ORDER BY sf.created_at DESC
  `);

  const assignments = await db.execute(sql<{
    id: string;
    feature_id: string;
    plan_id: string;
    is_included: boolean;
    limit_count: number | null;
    limit_minutes: number | null;
    limit_text: string | null;
    limit_amount: string | number | null;
    limit_currency: string | null;
    limit_percent: string | number | null;
    limit_json: Record<string, any> | null;
    limit_interval: SubscriptionBillingInterval | null;
    limit_interval_count: number | null;
  }>`
    SELECT
      id,
      feature_id,
      plan_id,
      is_included,
      limit_count,
      limit_minutes,
      limit_text,
      limit_amount,
      limit_currency,
      limit_percent,
      limit_json,
      limit_interval,
      limit_interval_count
    FROM subscription_plan_features
    WHERE plan_id = ${planId}
  `);

  return buildPlanFeaturePayloadRows(
    features,
    assignments.map((assignment: typeof assignments[number]) => ({
      ...assignment,
      limit_amount: assignment.limit_amount === null ? null : toNumber(assignment.limit_amount),
      limit_percent: assignment.limit_percent === null ? null : toNumber(assignment.limit_percent),
      limit_json: normalizeJson<Record<string, any> | null>(assignment.limit_json, null),
    }))
  );
}

export async function upsertPlanFeature(
  planId: string,
  payload: {
    feature_id: string;
    is_included?: boolean;
    limit_count?: number | null;
    limit_minutes?: number | null;
    limit_text?: string | null;
    limit_amount?: number | null;
    limit_currency?: string | null;
    limit_percent?: number | null;
    limit_json?: Record<string, any> | null;
    limit_interval?: SubscriptionBillingInterval | null;
    limit_interval_count?: number | null;
  }
) {
  const rows = await db.execute(sql<any>`
    INSERT INTO subscription_plan_features (
      plan_id,
      feature_id,
      is_included,
      limit_count,
      limit_minutes,
      limit_text,
      limit_amount,
      limit_currency,
      limit_percent,
      limit_json,
      limit_interval,
      limit_interval_count,
      created_at,
      updated_at
    )
    VALUES (
      ${planId},
      ${payload.feature_id},
      ${payload.is_included ?? false},
      ${payload.limit_count ?? null},
      ${payload.limit_minutes ?? null},
      ${payload.limit_text ?? null},
      ${payload.limit_amount ?? null},
      ${payload.limit_currency ?? null},
      ${payload.limit_percent ?? null},
      ${payload.limit_json ?? null},
      ${payload.limit_interval ?? null},
      ${payload.limit_interval_count ?? 1},
      now(),
      now()
    )
    ON CONFLICT (plan_id, feature_id)
    DO UPDATE SET
      is_included = EXCLUDED.is_included,
      limit_count = EXCLUDED.limit_count,
      limit_minutes = EXCLUDED.limit_minutes,
      limit_text = EXCLUDED.limit_text,
      limit_amount = EXCLUDED.limit_amount,
      limit_currency = EXCLUDED.limit_currency,
      limit_percent = EXCLUDED.limit_percent,
      limit_json = EXCLUDED.limit_json,
      limit_interval = EXCLUDED.limit_interval,
      limit_interval_count = EXCLUDED.limit_interval_count,
      updated_at = now()
    RETURNING *
  `);

  const row = rows[0];
  return row
    ? {
        ...row,
        limit_amount: row.limit_amount === null ? null : toNumber(row.limit_amount),
        limit_percent: row.limit_percent === null ? null : toNumber(row.limit_percent),
      }
    : null;
}

export async function listPlanPrices(planId: string) {
  const rows = await db
    .select({
      id: subscriptionPlanPrices.id,
      plan_id: subscriptionPlanPrices.planId,
      price_type: subscriptionPlanPrices.priceType,
      billing_interval: subscriptionPlanPrices.billingInterval,
      billing_interval_count: subscriptionPlanPrices.billingIntervalCount,
      amount: subscriptionPlanPrices.amount,
      currency: subscriptionPlanPrices.currency,
      is_active: subscriptionPlanPrices.isActive,
      effective_from: subscriptionPlanPrices.effectiveFrom,
      effective_to: subscriptionPlanPrices.effectiveTo,
      created_at: subscriptionPlanPrices.createdAt,
    })
    .from(subscriptionPlanPrices)
    .where(eq(subscriptionPlanPrices.planId, planId))
    .orderBy(desc(subscriptionPlanPrices.createdAt));

  return rows.map((row: typeof rows[number]) => ({
    ...row,
    amount: toNumber(row.amount),
    effective_from: toIsoString(row.effective_from),
    effective_to: toIsoString(row.effective_to),
    created_at: toIsoString(row.created_at) ?? '',
  }));
}

export async function createPlanPrice(planId: string, payload: {
  price_type: 'standard' | 'introductory';
  billing_interval: SubscriptionBillingInterval;
  billing_interval_count: number;
  amount: number;
  currency: string;
  is_active?: boolean;
  effective_from?: string | null;
  effective_to?: string | null;
}) {
  const [row] = await db
    .insert(subscriptionPlanPrices)
    .values({
      planId,
      priceType: payload.price_type,
      billingInterval: payload.billing_interval,
      billingIntervalCount: payload.billing_interval_count,
      amount: payload.amount.toString(),
      currency: payload.currency,
      isActive: payload.is_active ?? true,
      effectiveFrom: payload.effective_from ? new Date(payload.effective_from) : null,
      effectiveTo: payload.effective_to ? new Date(payload.effective_to) : null,
    })
    .returning();
  return row;
}

export async function updatePlanPrice(
  planId: string,
  priceId: string,
  updates: Partial<{
    price_type: 'standard' | 'introductory';
    billing_interval: SubscriptionBillingInterval;
    billing_interval_count: number;
    amount: number;
    currency: string;
    is_active: boolean;
    effective_from: string | null;
    effective_to: string | null;
  }>
) {
  const [row] = await db
    .update(subscriptionPlanPrices)
    .set({
      priceType: updates.price_type,
      billingInterval: updates.billing_interval,
      billingIntervalCount: updates.billing_interval_count,
      amount: updates.amount === undefined ? undefined : updates.amount.toString(),
      currency: updates.currency,
      isActive: updates.is_active,
      effectiveFrom: updates.effective_from === undefined
        ? undefined
        : updates.effective_from
          ? new Date(updates.effective_from)
          : null,
      effectiveTo: updates.effective_to === undefined
        ? undefined
        : updates.effective_to
          ? new Date(updates.effective_to)
          : null,
      updatedAt: new Date(),
    })
    .where(and(eq(subscriptionPlanPrices.id, priceId), eq(subscriptionPlanPrices.planId, planId)))
    .returning();
  return row || null;
}

export async function getPlanPrice(priceId: string) {
  const [row] = await db
    .select({
      id: subscriptionPlanPrices.id,
      plan_id: subscriptionPlanPrices.planId,
      billing_interval: subscriptionPlanPrices.billingInterval,
      billing_interval_count: subscriptionPlanPrices.billingIntervalCount,
      amount: subscriptionPlanPrices.amount,
    })
    .from(subscriptionPlanPrices)
    .where(eq(subscriptionPlanPrices.id, priceId))
    .limit(1);

  if (!row) return null;

  return {
    ...row,
    amount: toNumber(row.amount),
  };
}

export async function cancelActiveSubscriptionsForUser(userId: string) {
  await db
    .update(subscriptions)
    .set({
      status: 'canceled',
      updatedAt: new Date(),
    })
    .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, ['trialing', 'active'])));
}

export async function createSubscription(input: {
  user_id: string;
  plan_id: string;
  price_id: string | null;
  status: 'active' | 'trialing';
  current_period_start: string;
  current_period_end: string;
}) {
  const [row] = await db
    .insert(subscriptions)
    .values({
      userId: input.user_id,
      planId: input.plan_id,
      priceId: input.price_id,
      status: input.status,
      currentPeriodStart: new Date(input.current_period_start),
      currentPeriodEnd: new Date(input.current_period_end),
    })
    .returning();

  return row;
}

export async function listPublicPlans(audience?: SubscriptionAudience, includeFallback = false) {
  const planFilter = audience
    ? includeFallback
      ? eq(subscriptionPlans.audience, audience)
      : and(eq(subscriptionPlans.audience, audience), eq(subscriptionPlans.status, 'active'))
    : includeFallback
      ? undefined
      : eq(subscriptionPlans.status, 'active');

  const plans = await db
    .select({
      id: subscriptionPlans.id,
      plan_key: subscriptionPlans.planKey,
      audience: subscriptionPlans.audience,
      name: subscriptionPlans.name,
      description: subscriptionPlans.description,
      status: subscriptionPlans.status,
      sort_order: subscriptionPlans.sortOrder,
      metadata: subscriptionPlans.metadata,
      created_at: subscriptionPlans.createdAt,
    })
    .from(subscriptionPlans)
    .where(planFilter)
    .orderBy(subscriptionPlans.sortOrder);

  if (plans.length === 0) return [];

  const planIds = plans.map((plan: typeof plans[number]) => plan.id);
  const features = await db.execute(sql<any>`
    SELECT
      spf.plan_id,
      spf.id,
      spf.feature_id,
      spf.is_included,
      spf.limit_count,
      spf.limit_minutes,
      spf.limit_text,
      spf.limit_amount,
      spf.limit_currency,
      spf.limit_percent,
      spf.limit_json,
      spf.limit_interval,
      spf.limit_interval_count,
      sf.feature_key,
      sf.name,
      sf.description,
      sf.value_type,
      sf.unit,
      sf.is_metered
    FROM subscription_plan_features spf
    INNER JOIN subscription_features sf ON sf.id = spf.feature_id
    WHERE spf.plan_id IN (${sql.join(planIds.map((id: string) => sql`${id}`), sql`, `)})
      AND spf.is_included = true
    ORDER BY spf.created_at ASC
  `);

  const prices = await db.execute(sql<any>`
    SELECT
      id,
      plan_id,
      price_type,
      billing_interval,
      billing_interval_count,
      amount,
      currency,
      is_active,
      effective_from,
      effective_to,
      created_at
    FROM subscription_plan_prices
    WHERE plan_id IN (${sql.join(planIds.map((id: string) => sql`${id}`), sql`, `)})
    ORDER BY created_at DESC
  `);

  const featuresByPlan = new Map<string, any[]>();
  for (const feature of features) {
    const rows = featuresByPlan.get(feature.plan_id) || [];
    rows.push({
      id: feature.id,
      feature_id: feature.feature_id,
      is_included: feature.is_included,
      limit_count: feature.limit_count,
      limit_minutes: feature.limit_minutes,
      limit_text: feature.limit_text,
      limit_amount: feature.limit_amount === null ? null : toNumber(feature.limit_amount),
      limit_currency: feature.limit_currency,
      limit_percent: feature.limit_percent === null ? null : toNumber(feature.limit_percent),
      limit_json: normalizeJson<Record<string, any> | null>(feature.limit_json, null),
      limit_interval: feature.limit_interval,
      limit_interval_count: feature.limit_interval_count,
      subscription_features: {
        id: feature.feature_id,
        feature_key: feature.feature_key,
        name: feature.name,
        description: feature.description,
        value_type: feature.value_type,
        unit: feature.unit,
        is_metered: feature.is_metered,
      },
    });
    featuresByPlan.set(feature.plan_id, rows);
  }

  const pricesByPlan = new Map<string, any[]>();
  for (const price of prices) {
    const rows = pricesByPlan.get(price.plan_id) || [];
    rows.push({
      ...price,
      amount: toNumber(price.amount),
      effective_from: toIsoString(price.effective_from),
      effective_to: toIsoString(price.effective_to),
      created_at: toIsoString(price.created_at) ?? '',
    });
    pricesByPlan.set(price.plan_id, rows);
  }

  return plans.map((plan: typeof plans[number]) => ({
    ...plan,
    metadata: normalizeJson<Record<string, any>>(plan.metadata, {}),
    created_at: toIsoString(plan.created_at) ?? '',
    subscription_plan_features: featuresByPlan.get(plan.id) || [],
    subscription_plan_prices: pricesByPlan.get(plan.id) || [],
  }));
}

export async function listSubscriptionsForAdmin(options: AdminSubscriptionListOptions) {
  const whereParts = [sql`1 = 1`];

  if (options.statuses && options.statuses.length > 0) {
    whereParts.push(sql`s.status IN (${sql.join(options.statuses.map((status) => sql`${status}`), sql`, `)})`);
  }

  if (options.audience && options.audience !== 'all') {
    whereParts.push(sql`sp.audience = ${options.audience}`);
  }

  const whereClause = sql.join(whereParts, sql` AND `);
  const offset = (options.page - 1) * options.pageSize;

  const totalRows = await db.execute(sql<{ total: number }>`
    SELECT COUNT(*)::int AS total
    FROM subscriptions s
    INNER JOIN subscription_plans sp ON sp.id = s.plan_id
    WHERE ${whereClause}
  `);
  const total = totalRows[0]?.total ?? 0;

  const rows = await db.execute(sql<any>`
    SELECT
      s.id,
      s.user_id,
      s.status,
      s.quantity,
      s.current_period_start,
      s.current_period_end,
      s.provider,
      s.provider_subscription_id,
      s.created_at,
      sp.id AS plan_id,
      sp.plan_key,
      sp.name AS plan_name,
      sp.audience,
      spp.id AS price_id,
      spp.amount,
      spp.currency,
      spp.billing_interval,
      spp.billing_interval_count,
      spp.price_type,
      spp.is_active
    FROM subscriptions s
    INNER JOIN subscription_plans sp ON sp.id = s.plan_id
    LEFT JOIN subscription_plan_prices spp ON spp.id = s.price_id
    WHERE ${whereClause}
    ORDER BY s.created_at DESC
    LIMIT ${options.pageSize}
    OFFSET ${offset}
  `);

  const userIds: string[] = Array.from(
    new Set(rows.map((row: typeof rows[number]) => row.user_id).filter((id: string | null): id is string => Boolean(id)))
  );
  const usersById = new Map<string, { id: string; name: string | null; email: string | null }>();

  if (userIds.length > 0) {
    const userRows = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(inArray(users.id, userIds));

    for (const user of userRows) {
      usersById.set(user.id, user);
    }
  }

  return {
    total,
    rows: rows.map((row: typeof rows[number]) => ({
      id: row.id,
      user_id: row.user_id,
      status: row.status,
      quantity: row.quantity,
      current_period_start: row.current_period_start ? new Date(row.current_period_start).toISOString() : null,
      current_period_end: row.current_period_end ? new Date(row.current_period_end).toISOString() : null,
      provider: row.provider,
      provider_subscription_id: row.provider_subscription_id,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
      subscription_plans: {
        id: row.plan_id,
        plan_key: row.plan_key,
        name: row.plan_name,
        audience: row.audience,
      },
      subscription_plan_prices: row.price_id
        ? {
            id: row.price_id,
            amount: toNumber(row.amount),
            currency: row.currency,
            billing_interval: row.billing_interval,
            billing_interval_count: row.billing_interval_count,
            price_type: row.price_type,
            is_active: row.is_active,
          }
        : null,
      user: row.user_id ? usersById.get(row.user_id) || null : null,
    })),
  };
}

export async function getSubscriptionStats() {
  const [totals] = await db.execute(sql<{
    total_plans: number;
    active_plans: number;
    total_features: number;
    active_subscriptions: number;
  }>`
    SELECT
      (SELECT COUNT(*)::int FROM subscription_plans) AS total_plans,
      (SELECT COUNT(*)::int FROM subscription_plans WHERE status = 'active') AS active_plans,
      (SELECT COUNT(*)::int FROM subscription_features) AS total_features,
      (SELECT COUNT(*)::int FROM subscriptions WHERE status IN ('trialing', 'active')) AS active_subscriptions
  `);

  return totals;
}

export async function getAnalyticsData(startIso: string, endIso: string, audience: 'all' | SubscriptionAudience) {
  const audienceJoin = audience === 'all' ? sql`` : sql`AND sp.audience = ${audience}`;

  const events = await db.execute(sql<any>`
    SELECT
      sue.subscription_id,
      sue.user_id,
      sue.count_delta,
      sue.minutes_delta,
      sue.limit_exceeded,
      sue.created_at
    FROM subscription_usage_events sue
    INNER JOIN subscriptions s ON s.id = sue.subscription_id
    INNER JOIN subscription_plans sp ON sp.id = s.plan_id
    WHERE sue.created_at >= ${new Date(startIso)}
      AND sue.created_at <= ${new Date(endIso)}
      ${audienceJoin}
  `);

  const featuresAtLimitRows = await db.execute(sql<{ count: number }>`
    SELECT COUNT(*)::int AS count
    FROM subscription_usage_tracking sut
    INNER JOIN subscriptions s ON s.id = sut.subscription_id
    INNER JOIN subscription_plans sp ON sp.id = s.plan_id
    WHERE sut.limit_reached = true
      AND sut.period_start <= ${new Date(endIso)}
      AND sut.period_end >= ${new Date(startIso)}
      ${audienceJoin}
  `);

  const usageByFeatureRows = await db.execute(sql<any>`
    SELECT
      sut.subscription_id,
      sut.feature_id,
      sut.usage_count,
      sut.usage_minutes,
      sut.usage_amount,
      sf.feature_key,
      sf.name,
      sf.unit,
      sf.value_type,
      s.user_id,
      s.plan_id
    FROM subscription_usage_tracking sut
    INNER JOIN subscription_features sf ON sf.id = sut.feature_id
    INNER JOIN subscriptions s ON s.id = sut.subscription_id
    INNER JOIN subscription_plans sp ON sp.id = s.plan_id
    WHERE sut.period_start <= ${new Date(endIso)}
      AND sut.period_end >= ${new Date(startIso)}
      ${audienceJoin}
  `);

  const planLimits = await db.execute(sql<any>`
    SELECT plan_id, feature_id, is_included, limit_count, limit_minutes, limit_amount
    FROM subscription_plan_features
    WHERE is_included = true
  `);

  const planDistribution = await db.execute(sql<any>`
    SELECT
      sp.plan_key,
      sp.name,
      sp.audience,
      COUNT(*)::int AS active_count
    FROM subscriptions s
    INNER JOIN subscription_plans sp ON sp.id = s.plan_id
    WHERE s.status IN ('active', 'trialing')
      ${audienceJoin}
    GROUP BY sp.plan_key, sp.name, sp.audience
    ORDER BY active_count DESC
  `);

  const limitBreaches = await db.execute(sql<any>`
    SELECT
      sut.subscription_id,
      sut.feature_id,
      sut.usage_count,
      sut.usage_minutes,
      sut.usage_amount,
      sut.limit_reached,
      sut.limit_reached_at,
      s.user_id,
      s.plan_id,
      sf.feature_key,
      sf.name,
      sf.unit,
      sf.value_type
    FROM subscription_usage_tracking sut
    INNER JOIN subscriptions s ON s.id = sut.subscription_id
    INNER JOIN subscription_features sf ON sf.id = sut.feature_id
    INNER JOIN subscription_plans sp ON sp.id = s.plan_id
    WHERE sut.limit_reached = true
      AND sut.period_start <= ${new Date(endIso)}
      AND sut.period_end >= ${new Date(startIso)}
      ${audienceJoin}
    ORDER BY sut.limit_reached_at DESC
  `);

  return {
    events,
    featuresAtLimitCount: featuresAtLimitRows[0]?.count ?? 0,
    usageByFeatureRows,
    planLimits,
    planDistribution,
    limitBreaches,
  };
}

export async function recordUsageEventAndUpdateTracking(input: {
  subscriptionId: string;
  featureId: string;
  userId: string;
  countDelta: number;
  minutesDelta: number;
  amountDelta: number;
  resourceType?: string;
  resourceId?: string;
  idempotencyKey?: string | null;
}) {
  return db.transaction(async (tx: any) => {
    if (input.idempotencyKey) {
      const existing = await tx.execute(sql<{ id: string }>`
        SELECT id
        FROM subscription_usage_events
        WHERE idempotency_key = ${input.idempotencyKey}
        LIMIT 1
      `);

      if (existing.length > 0) {
        return { alreadyRecorded: true };
      }
    }

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    await tx.execute(sql`
      INSERT INTO subscription_usage_events (
        subscription_id,
        feature_id,
        user_id,
        event_type,
        count_delta,
        minutes_delta,
        amount_delta,
        resource_type,
        resource_id,
        limit_exceeded,
        idempotency_key,
        metadata,
        created_at
      )
      VALUES (
        ${input.subscriptionId},
        ${input.featureId},
        ${input.userId},
        'increment',
        ${input.countDelta},
        ${input.minutesDelta},
        ${input.amountDelta},
        ${input.resourceType ?? null},
        ${input.resourceId ?? null},
        false,
        ${input.idempotencyKey ?? null},
        '{}'::jsonb,
        now()
      )
    `);

    await tx.execute(sql`
      INSERT INTO subscription_usage_tracking (
        subscription_id,
        feature_id,
        usage_count,
        usage_minutes,
        usage_amount,
        usage_json,
        period_start,
        period_end,
        interval_type,
        interval_count,
        limit_reached,
        created_at,
        updated_at
      )
      VALUES (
        ${input.subscriptionId},
        ${input.featureId},
        ${input.countDelta},
        ${input.minutesDelta},
        ${input.amountDelta},
        '{}'::jsonb,
        ${periodStart.toISOString()},
        ${periodEnd.toISOString()},
        'month',
        1,
        false,
        now(),
        now()
      )
      ON CONFLICT (subscription_id, feature_id, period_start, period_end)
      DO UPDATE SET
        usage_count = subscription_usage_tracking.usage_count + EXCLUDED.usage_count,
        usage_minutes = subscription_usage_tracking.usage_minutes + EXCLUDED.usage_minutes,
        usage_amount = subscription_usage_tracking.usage_amount + EXCLUDED.usage_amount,
        updated_at = now()
    `);

    return { alreadyRecorded: false };
  });
}
