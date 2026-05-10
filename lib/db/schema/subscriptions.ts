import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const subscriptionBillingIntervalEnum = pgEnum('subscription_billing_interval', [
  'day',
  'week',
  'month',
  'year',
]);

export const subscriptionFeatureValueTypeEnum = pgEnum('subscription_feature_value_type', [
  'boolean',
  'count',
  'minutes',
  'text',
  'amount',
  'percent',
  'json',
]);

export const subscriptionPlanAudienceEnum = pgEnum('subscription_plan_audience', [
  'mentor',
  'mentee',
]);

export const subscriptionPlanStatusEnum = pgEnum('subscription_plan_status', [
  'draft',
  'active',
  'archived',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'paused',
  'canceled',
  'incomplete',
  'expired',
]);

export const subscriptionPriceTypeEnum = pgEnum('subscription_price_type', [
  'standard',
  'introductory',
]);

export const subscriptionUsageEventTypeEnum = pgEnum('subscription_usage_event_type', [
  'increment',
  'decrement',
  'reset',
]);

export const subscriptionTeamMemberRoleEnum = pgEnum('subscription_team_member_role', [
  'owner',
  'admin',
  'member',
]);

export const subscriptionTeamMemberStatusEnum = pgEnum('subscription_team_member_status', [
  'invited',
  'active',
  'removed',
]);

export const subscriptionFeatureCategories = pgTable(
  'subscription_feature_categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    categoryKey: text('category_key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    icon: text('icon'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    categoryKeyUnique: uniqueIndex('subscription_feature_categories_category_key_uidx').on(table.categoryKey),
    sortOrderIdx: index('subscription_feature_categories_sort_order_idx').on(table.sortOrder),
  })
);

export const subscriptionPlans = pgTable(
  'subscription_plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    planKey: text('plan_key').notNull(),
    audience: subscriptionPlanAudienceEnum('audience').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    status: subscriptionPlanStatusEnum('status').notNull().default('draft'),
    sortOrder: integer('sort_order').notNull().default(0),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    planKeyUnique: uniqueIndex('subscription_plans_plan_key_uidx').on(table.planKey),
    audienceSortOrderIdx: index('subscription_plans_audience_sort_order_idx').on(table.audience, table.sortOrder),
    statusIdx: index('subscription_plans_status_idx').on(table.status),
  })
);

export const subscriptionFeatures = pgTable(
  'subscription_features',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    featureKey: text('feature_key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    valueType: subscriptionFeatureValueTypeEnum('value_type').notNull(),
    unit: text('unit'),
    isMetered: boolean('is_metered').notNull().default(false),
    categoryId: uuid('category_id').references(() => subscriptionFeatureCategories.id, {
      onDelete: 'set null',
    }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    featureKeyUnique: uniqueIndex('subscription_features_feature_key_uidx').on(table.featureKey),
    categoryIdx: index('subscription_features_category_id_idx').on(table.categoryId),
  })
);

export const subscriptionPlanFeatures = pgTable(
  'subscription_plan_features',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: 'cascade' }),
    featureId: uuid('feature_id')
      .notNull()
      .references(() => subscriptionFeatures.id, { onDelete: 'cascade' }),
    isIncluded: boolean('is_included').notNull().default(false),
    limitCount: integer('limit_count'),
    limitMinutes: integer('limit_minutes'),
    limitText: text('limit_text'),
    limitAmount: numeric('limit_amount', { precision: 12, scale: 2 }),
    limitCurrency: text('limit_currency'),
    limitPercent: numeric('limit_percent', { precision: 8, scale: 2 }),
    limitJson: jsonb('limit_json').$type<Record<string, unknown> | null>(),
    limitInterval: subscriptionBillingIntervalEnum('limit_interval'),
    limitIntervalCount: integer('limit_interval_count').notNull().default(1),
    priceAmount: numeric('price_amount', { precision: 12, scale: 2 }),
    priceCurrency: text('price_currency'),
    notes: text('notes'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    planFeatureUnique: unique('subscription_plan_features_plan_id_feature_id_unique').on(
      table.planId,
      table.featureId
    ),
    planIdx: index('subscription_plan_features_plan_id_idx').on(table.planId),
    featureIdx: index('subscription_plan_features_feature_id_idx').on(table.featureId),
  })
);

export const subscriptionPlanPrices = pgTable(
  'subscription_plan_prices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: 'cascade' }),
    priceType: subscriptionPriceTypeEnum('price_type').notNull().default('standard'),
    billingInterval: subscriptionBillingIntervalEnum('billing_interval').notNull(),
    billingIntervalCount: integer('billing_interval_count').notNull().default(1),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('USD'),
    isActive: boolean('is_active').notNull().default(true),
    introDurationIntervals: integer('intro_duration_intervals'),
    providerPlanId: text('provider_plan_id'),
    effectiveFrom: timestamp('effective_from', { withTimezone: false }),
    effectiveTo: timestamp('effective_to', { withTimezone: false }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    planIdx: index('subscription_plan_prices_plan_id_idx').on(table.planId),
    activeIdx: index('subscription_plan_prices_active_idx').on(table.isActive),
  })
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: 'restrict' }),
    priceId: uuid('price_id').references(() => subscriptionPlanPrices.id, { onDelete: 'set null' }),
    status: subscriptionStatusEnum('status').notNull().default('active'),
    quantity: integer('quantity').notNull().default(1),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: false }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: false }),
    trialEnd: timestamp('trial_end', { withTimezone: false }),
    cancelAt: timestamp('cancel_at', { withTimezone: false }),
    canceledAt: timestamp('canceled_at', { withTimezone: false }),
    endedAt: timestamp('ended_at', { withTimezone: false }),
    autoRenew: boolean('auto_renew').notNull().default(true),
    provider: text('provider'),
    providerCustomerId: text('provider_customer_id'),
    providerSubscriptionId: text('provider_subscription_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('subscriptions_user_id_idx').on(table.userId),
    planIdx: index('subscriptions_plan_id_idx').on(table.planId),
    priceIdx: index('subscriptions_price_id_idx').on(table.priceId),
    statusIdx: index('subscriptions_status_idx').on(table.status),
    activeLookupIdx: index('subscriptions_user_status_idx').on(table.userId, table.status),
  })
);

export const subscriptionUsageTracking = pgTable(
  'subscription_usage_tracking',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    featureId: uuid('feature_id')
      .notNull()
      .references(() => subscriptionFeatures.id, { onDelete: 'cascade' }),
    usageCount: integer('usage_count').notNull().default(0),
    usageMinutes: integer('usage_minutes').notNull().default(0),
    usageAmount: numeric('usage_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    usageJson: jsonb('usage_json').$type<Record<string, unknown>>().notNull().default({}),
    periodStart: timestamp('period_start', { withTimezone: false }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: false }).notNull(),
    intervalType: subscriptionBillingIntervalEnum('interval_type').notNull().default('month'),
    intervalCount: integer('interval_count').notNull().default(1),
    limitReached: boolean('limit_reached').notNull().default(false),
    limitReachedAt: timestamp('limit_reached_at', { withTimezone: false }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    uniquePeriod: unique('subscription_usage_tracking_subscription_id_feature_id_period_unique').on(
      table.subscriptionId,
      table.featureId,
      table.periodStart,
      table.periodEnd
    ),
    subscriptionIdx: index('subscription_usage_tracking_subscription_id_idx').on(table.subscriptionId),
    featureIdx: index('subscription_usage_tracking_feature_id_idx').on(table.featureId),
  })
);

export const subscriptionUsageEvents = pgTable(
  'subscription_usage_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    featureId: uuid('feature_id')
      .notNull()
      .references(() => subscriptionFeatures.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull().default('increment'),
    countDelta: integer('count_delta').notNull().default(0),
    minutesDelta: integer('minutes_delta').notNull().default(0),
    amountDelta: numeric('amount_delta', { precision: 12, scale: 2 }).notNull().default('0'),
    resourceType: text('resource_type'),
    resourceId: text('resource_id'),
    limitExceeded: boolean('limit_exceeded').notNull().default(false),
    idempotencyKey: text('idempotency_key'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    subscriptionIdx: index('subscription_usage_events_subscription_id_idx').on(table.subscriptionId),
    featureIdx: index('subscription_usage_events_feature_id_idx').on(table.featureId),
    userIdx: index('subscription_usage_events_user_id_idx').on(table.userId),
    createdAtIdx: index('subscription_usage_events_created_at_idx').on(table.createdAt),
    idempotencyKeyUnique: uniqueIndex('subscription_usage_events_idempotency_key_uidx').on(
      table.idempotencyKey
    ),
  })
);

export const subscriptionTeamMembers = pgTable(
  'subscription_team_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: subscriptionTeamMemberRoleEnum('role').notNull().default('member'),
    invitedBy: text('invited_by').references(() => users.id, { onDelete: 'set null' }),
    invitedAt: timestamp('invited_at', { withTimezone: false }).notNull().defaultNow(),
    joinedAt: timestamp('joined_at', { withTimezone: false }),
    status: text('status').notNull().default('pending'),
    removedAt: timestamp('removed_at', { withTimezone: false }),
    removedBy: text('removed_by').references(() => users.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    subscriptionIdx: index('subscription_team_members_subscription_id_idx').on(table.subscriptionId),
    userIdx: index('subscription_team_members_user_id_idx').on(table.userId),
    membershipUnique: unique('subscription_team_members_subscription_id_user_id_unique').on(
      table.subscriptionId,
      table.userId
    ),
  })
);
