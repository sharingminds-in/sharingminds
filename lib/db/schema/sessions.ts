import { pgTable, text, timestamp, boolean, uuid, decimal, integer, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  mentorId: text('mentor_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  menteeId: text('mentee_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),

  // Session details
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('scheduled'), // 'scheduled', 'in_progress', 'completed', 'cancelled', 'no_show'
  sessionType: text('session_type').notNull().default('PAID'), // 'FREE', 'PAID', 'COUNSELING'
  bookingSource: text('booking_source').notNull().default('default'), // 'explore' | 'ai' | 'default'

  // Timing
  scheduledAt: timestamp('scheduled_at').notNull(),
  startedAt: timestamp('started_at'),
  endedAt: timestamp('ended_at'),
  duration: integer('duration_minutes').default(60), // Expected duration in minutes

  // Meeting details
  meetingUrl: text('meeting_url'), // Zoom/Google Meet link
  meetingType: text('meeting_type').default('video'), // 'video', 'audio', 'in_person', 'chat'
  location: text('location'), // For in-person meetings

  // Pricing
  rate: decimal('rate', { precision: 10, scale: 2 }),
  currency: text('currency').default('USD'),
  paymentIntentId: uuid('payment_intent_id'),

  // Session notes and feedback
  mentorNotes: text('mentor_notes'),
  menteeNotes: text('mentee_notes'),
  //mentorRating: integer('mentor_rating'), // 1-5 rating from mentee
  //menteeRating: integer('mentee_rating'), // 1-5 rating from mentor

  // Cancellation and rescheduling
  cancelledBy: text('cancelled_by'), // 'mentor' | 'mentee'
  cancellationReason: text('cancellation_reason'),
  rescheduledFrom: uuid('rescheduled_from').references(() => sessions.id),
  rescheduleCount: integer('reschedule_count').default(0).notNull(), // Track times rescheduled by mentee
  mentorRescheduleCount: integer('mentor_reschedule_count').default(0).notNull(), // Track times rescheduled by mentor
  noShowMarkedBy: text('no_show_marked_by'), // 'mentor' | 'system'
  noShowMarkedAt: timestamp('no_show_marked_at'),

  // Refund tracking
  refundAmount: decimal('refund_amount', { precision: 10, scale: 2 }),
  refundPercentage: integer('refund_percentage'),
  refundStatus: text('refund_status').default('none'), // 'none', 'pending', 'processed', 'failed'

  // Pending reschedule request (for quick access)
  pendingRescheduleRequestId: uuid('pending_reschedule_request_id'),
  pendingRescheduleTime: timestamp('pending_reschedule_time'),
  pendingRescheduleBy: text('pending_reschedule_by'), // 'mentor' | 'mentee'

  // Auto-reassignment tracking (when mentor cancels and a new mentor is assigned)
  wasReassigned: boolean('was_reassigned').default(false).notNull(),
  reassignedFromMentorId: text('reassigned_from_mentor_id'),
  reassignedAt: timestamp('reassigned_at'),
  reassignmentStatus: text('reassignment_status'), // 'pending_acceptance' | 'accepted' | 'rejected' | 'awaiting_mentee_choice'
  cancelledMentorIds: jsonb('cancelled_mentor_ids').default([]).notNull(), // Array of mentor IDs who cancelled this session

  // Recording configuration
  recordingConfig: jsonb('recording_config')
    .default({ enabled: true, resolution: '1280x720', fps: 30 })
    .notNull(),

  isReviewedByMentor: boolean('is_reviewed_by_mentor').default(false).notNull(),
  isReviewedByMentee: boolean('is_reviewed_by_mentee').default(false).notNull(),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const sessionsRelations = relations(sessions, ({ one }) => ({
  mentor: one(users, {
    fields: [sessions.mentorId],
    references: [users.id],
  }),
  mentee: one(users, {
    fields: [sessions.menteeId],
    references: [users.id],
  }),
}));

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert; 
