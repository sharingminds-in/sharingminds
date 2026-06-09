import {
  decimal,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { mentors } from './mentors';
import { users } from './users';

export const mentorPricingActorRoleEnum = pgEnum(
  'mentor_pricing_actor_role',
  ['mentor', 'admin']
);

export const mentorPricingActionEnum = pgEnum('mentor_pricing_action', [
  'MENTOR_RATE_SET',
  'MENTOR_RATE_UPDATED',
  'ADMIN_OVERRIDE_UPDATED',
  'ADMIN_OVERRIDE_CLEARED',
]);

export const mentorPricingAudit = pgTable(
  'mentor_pricing_audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mentorId: uuid('mentor_id')
      .references(() => mentors.id, { onDelete: 'cascade' })
      .notNull(),
    actorUserId: text('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    actorRole: mentorPricingActorRoleEnum('actor_role').notNull(),
    action: mentorPricingActionEnum('action').notNull(),
    previousMentorRate: decimal('previous_mentor_rate', {
      precision: 10,
      scale: 2,
    }),
    newMentorRate: decimal('new_mentor_rate', {
      precision: 10,
      scale: 2,
    }),
    previousAdminOverride: decimal('previous_admin_override', {
      precision: 10,
      scale: 2,
    }),
    newAdminOverride: decimal('new_admin_override', {
      precision: 10,
      scale: 2,
    }),
    previousEffectiveRate: decimal('previous_effective_rate', {
      precision: 10,
      scale: 2,
    }),
    newEffectiveRate: decimal('new_effective_rate', {
      precision: 10,
      scale: 2,
    }),
    currency: text('currency').default('USD').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    mentorCreatedAtIdx: index(
      'mentor_pricing_audit_mentor_created_at_idx'
    ).on(table.mentorId, table.createdAt),
    actorCreatedAtIdx: index(
      'mentor_pricing_audit_actor_created_at_idx'
    ).on(table.actorUserId, table.createdAt),
  })
);

export type MentorPricingAuditEntry = typeof mentorPricingAudit.$inferSelect;
export type NewMentorPricingAuditEntry = typeof mentorPricingAudit.$inferInsert;
export type MentorPricingActorRole =
  (typeof mentorPricingActorRoleEnum.enumValues)[number];
export type MentorPricingAction =
  (typeof mentorPricingActionEnum.enumValues)[number];
