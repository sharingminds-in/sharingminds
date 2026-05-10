import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const paymentIntents = pgTable(
  'payment_intents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(),
    status: text('status').notNull().default('created'),
    provider: text('provider').notNull().default('dummy'),
    providerMode: text('provider_mode').notNull().default('test'),
    providerOrderId: text('provider_order_id'),
    providerPaymentId: text('provider_payment_id'),
    providerSubscriptionId: text('provider_subscription_id'),
    providerCustomerId: text('provider_customer_id'),
    relatedResourceType: text('related_resource_type'),
    relatedResourceId: text('related_resource_id'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    amountSubunits: integer('amount_subunits').notNull(),
    currency: text('currency').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    lastError: text('last_error'),
    expiresAt: timestamp('expires_at', { withTimezone: false }),
    paidAt: timestamp('paid_at', { withTimezone: false }),
    completedAt: timestamp('completed_at', { withTimezone: false }),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('payment_intents_user_id_idx').on(table.userId),
    statusIdx: index('payment_intents_status_idx').on(table.status),
    providerOrderIdx: index('payment_intents_provider_order_id_idx').on(
      table.providerOrderId
    ),
    providerPaymentIdx: index('payment_intents_provider_payment_id_idx').on(
      table.providerPaymentId
    ),
    providerSubscriptionIdx: index(
      'payment_intents_provider_subscription_id_idx'
    ).on(table.providerSubscriptionId),
    idempotencyKeyUnique: uniqueIndex(
      'payment_intents_idempotency_key_uidx'
    ).on(table.idempotencyKey),
  })
);

export const paymentEvents = pgTable(
  'payment_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: text('provider').notNull(),
    providerMode: text('provider_mode').notNull().default('test'),
    providerEventId: text('provider_event_id').notNull(),
    eventType: text('event_type').notNull(),
    paymentIntentId: uuid('payment_intent_id').references(
      () => paymentIntents.id,
      { onDelete: 'set null' }
    ),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: false }),
    processingError: text('processing_error'),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    providerEventUnique: uniqueIndex('payment_events_provider_event_uidx').on(
      table.provider,
      table.providerEventId
    ),
    eventTypeIdx: index('payment_events_event_type_idx').on(table.eventType),
    intentIdx: index('payment_events_payment_intent_id_idx').on(
      table.paymentIntentId
    ),
  })
);

export const paymentRefunds = pgTable(
  'payment_refunds',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    paymentIntentId: uuid('payment_intent_id')
      .notNull()
      .references(() => paymentIntents.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerRefundId: text('provider_refund_id'),
    providerPaymentId: text('provider_payment_id').notNull(),
    status: text('status').notNull().default('created'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    amountSubunits: integer('amount_subunits').notNull(),
    currency: text('currency').notNull(),
    reason: text('reason').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    processedAt: timestamp('processed_at', { withTimezone: false }),
    createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
  },
  (table) => ({
    intentIdx: index('payment_refunds_payment_intent_id_idx').on(
      table.paymentIntentId
    ),
    providerRefundIdx: index('payment_refunds_provider_refund_id_idx').on(
      table.providerRefundId
    ),
  })
);

export type PaymentIntent = typeof paymentIntents.$inferSelect;
export type NewPaymentIntent = typeof paymentIntents.$inferInsert;
export type PaymentEvent = typeof paymentEvents.$inferSelect;
export type PaymentRefund = typeof paymentRefunds.$inferSelect;
