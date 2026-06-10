import { z } from 'zod';

import {
  createBookingSchema as baseCreateBookingSchema,
} from '@/lib/validations/booking';
import {
  CANCELLATION_REASONS,
  MENTOR_CANCELLATION_REASONS,
} from '@/lib/db/schema/session-policies';

const allReasonValues = [
  ...CANCELLATION_REASONS.map((reason) => reason.value),
  ...MENTOR_CANCELLATION_REASONS.map((reason) => reason.value),
] as [string, ...string[]];

export const listBookingsInputSchema = z.object({
  role: z.enum(['mentor', 'mentee']).default('mentee'),
  status: z.string().optional(),
  mentorId: z.string().optional(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
}).superRefine((value, ctx) => {
  const rangeFieldCount = [value.mentorId, value.start, value.end].filter(
    Boolean
  ).length;

  if (rangeFieldCount > 0 && rangeFieldCount < 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'mentorId, start, and end must be provided together',
      path: ['mentorId'],
    });
  }
});

export const getBookingInputSchema = z.object({
  bookingId: z.string().uuid('Invalid booking identifier'),
});

export const sessionViewInputSchema = z.object({
  sessionId: z.string().uuid('Invalid session identifier'),
});

export const createBookingInputSchema = baseCreateBookingSchema.extend({
  bookingSource: z.enum(['default', 'ai', 'explore']).optional(),
  aiConversationId: z.string().uuid().optional(),
  aiRecommendationRunId: z.string().uuid().optional(),
  aiMentorProfileId: z.string().uuid().optional(),
});

export const updateBookingInputSchema = z
  .object({
    bookingId: z.string().uuid('Invalid booking identifier'),
    status: z
      .enum(['in_progress', 'completed'])
      .optional(),
    meetingUrl: z.string().url('Invalid meeting URL').optional(),
    mentorNotes: z
      .string()
      .max(2000, 'Mentor notes must be less than 2000 characters')
      .optional(),
    menteeNotes: z
      .string()
      .max(2000, 'Mentee notes must be less than 2000 characters')
      .optional(),
  })
  .refine(
    (value) =>
      value.status !== undefined ||
      value.meetingUrl !== undefined ||
      value.mentorNotes !== undefined ||
      value.menteeNotes !== undefined,
    {
      message: 'At least one booking update field is required',
      path: ['bookingId'],
    }
  );

export const getSessionPoliciesInputSchema = z.object({
  role: z.enum(['mentor', 'mentee']).optional(),
});

export const cancelBookingInputSchema = z.object({
  bookingId: z.string().uuid('Invalid booking identifier'),
  reasonCategory: z.enum(allReasonValues),
  reasonDetails: z
    .string()
    .max(500, 'Reason details must be less than 500 characters')
    .optional(),
});

export const createRescheduleRequestInputSchema = z.object({
  bookingId: z.string().uuid('Invalid booking identifier'),
  scheduledAt: z
    .string()
    .datetime('Invalid date format')
    .refine((value) => new Date(value) > new Date(), {
      message: 'Session must be rescheduled to a future time',
    }),
  duration: z
    .number()
    .min(15, 'Session must be at least 15 minutes')
    .max(240, 'Session cannot exceed 4 hours')
    .optional(),
});

export const respondRescheduleInputSchema = z.object({
  bookingId: z.string().uuid('Invalid booking identifier'),
  requestId: z.string().uuid('Invalid request identifier'),
  action: z.enum(['accept', 'reject', 'counter_propose', 'cancel_session']),
  counterProposedTime: z.string().datetime().optional(),
  cancellationReason: z.string().max(500).optional(),
});

export const withdrawRescheduleRequestInputSchema = z.object({
  bookingId: z.string().uuid('Invalid booking identifier'),
});

export const markBookingNoShowInputSchema = z.object({
  bookingId: z.string().uuid('Invalid booking identifier'),
});

export const listAlternativeMentorsInputSchema = z.object({
  bookingId: z.string().uuid('Invalid booking identifier'),
  fixedTime: z.boolean().default(true),
});

export const acceptReassignmentInputSchema = z.object({
  bookingId: z.string().uuid('Invalid booking identifier'),
});

export const rejectReassignmentInputSchema = z.object({
  bookingId: z.string().uuid('Invalid booking identifier'),
  reason: z
    .string()
    .max(500, 'Reason must be less than 500 characters')
    .optional(),
});

export const selectAlternativeMentorInputSchema = z.object({
  bookingId: z.string().uuid('Invalid booking identifier'),
  newMentorId: z.string().min(1, 'New mentor ID is required'),
  scheduledAt: z.string().datetime().optional(),
});

export const adminListBookingsInputSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  status: z.array(z.string()).optional(),
  mentorId: z.string().optional(),
  menteeId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  meetingType: z.string().optional(),
  refundStatus: z.string().optional(),
  wasReassigned: z.boolean().optional(),
  search: z.string().trim().min(1).optional(),
  sortBy: z
    .enum(['scheduledAt', 'createdAt', 'updatedAt', 'status'])
    .default('scheduledAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const adminSessionStatsInputSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const adminGetBookingInputSchema = z.object({
  bookingId: z.string().uuid('Invalid booking identifier'),
});

export const adminCancelBookingInputSchema = z.object({
  bookingId: z.string().uuid('Invalid booking identifier'),
  reason: z.string().min(1, 'Reason is required'),
  refundPercentage: z.number().min(0).max(100).default(100),
  notifyParties: z.boolean().default(true),
});

export const adminCompleteBookingInputSchema = z.object({
  bookingId: z.string().uuid('Invalid booking identifier'),
  reason: z.string().min(1, 'Reason is required'),
  actualDuration: z.number().int().min(1).max(24 * 60).optional(),
});

export const adminRefundBookingInputSchema = z.object({
  bookingId: z.string().uuid('Invalid booking identifier'),
  amount: z.number().min(0, 'Amount must be positive'),
  reason: z.string().min(1, 'Reason is required'),
  refundType: z.enum(['full', 'partial', 'bonus']).default('partial'),
});

export const adminClearNoShowInputSchema = z.object({
  bookingId: z.string().uuid('Invalid booking identifier'),
  reason: z.string().min(1, 'Reason is required'),
  restoreStatus: z.enum(['completed', 'cancelled']).default('completed'),
});

export const adminReassignBookingInputSchema = z.object({
  bookingId: z.string().uuid('Invalid booking identifier'),
  newMentorId: z.string().min(1, 'New mentor ID is required'),
  reason: z.string().min(1, 'Reason is required'),
  notifyParties: z.boolean().default(true),
});

export const adminListBookingNotesInputSchema = z.object({
  bookingId: z.string().uuid('Invalid booking identifier'),
});

export const adminAddBookingNoteInputSchema = z.object({
  bookingId: z.string().uuid('Invalid booking identifier'),
  note: z.string().min(1, 'Note is required').max(5000, 'Note too long'),
});

export type ListBookingsInput = z.infer<typeof listBookingsInputSchema>;
export type GetBookingInput = z.infer<typeof getBookingInputSchema>;
export type SessionViewInput = z.infer<typeof sessionViewInputSchema>;
export type CreateBookingInput = z.infer<typeof createBookingInputSchema>;
export type UpdateBookingInput = z.infer<typeof updateBookingInputSchema>;
export type GetSessionPoliciesInput = z.infer<
  typeof getSessionPoliciesInputSchema
>;
export type CancelBookingInput = z.infer<typeof cancelBookingInputSchema>;
export type CreateRescheduleRequestInput = z.infer<
  typeof createRescheduleRequestInputSchema
>;
export type RespondRescheduleInput = z.infer<
  typeof respondRescheduleInputSchema
>;
export type WithdrawRescheduleRequestInput = z.infer<
  typeof withdrawRescheduleRequestInputSchema
>;
export type MarkBookingNoShowInput = z.infer<
  typeof markBookingNoShowInputSchema
>;
export type ListAlternativeMentorsInput = z.infer<
  typeof listAlternativeMentorsInputSchema
>;
export type AcceptReassignmentInput = z.infer<
  typeof acceptReassignmentInputSchema
>;
export type RejectReassignmentInput = z.infer<
  typeof rejectReassignmentInputSchema
>;
export type SelectAlternativeMentorInput = z.infer<
  typeof selectAlternativeMentorInputSchema
>;
export type AdminListBookingsInput = z.infer<
  typeof adminListBookingsInputSchema
>;
export type AdminSessionStatsInput = z.infer<
  typeof adminSessionStatsInputSchema
>;
export type AdminGetBookingInput = z.infer<
  typeof adminGetBookingInputSchema
>;
export type AdminCancelBookingInput = z.infer<
  typeof adminCancelBookingInputSchema
>;
export type AdminCompleteBookingInput = z.infer<
  typeof adminCompleteBookingInputSchema
>;
export type AdminRefundBookingInput = z.infer<
  typeof adminRefundBookingInputSchema
>;
export type AdminClearNoShowInput = z.infer<
  typeof adminClearNoShowInputSchema
>;
export type AdminReassignBookingInput = z.infer<
  typeof adminReassignBookingInputSchema
>;
export type AdminListBookingNotesInput = z.infer<
  typeof adminListBookingNotesInputSchema
>;
export type AdminAddBookingNoteInput = z.infer<
  typeof adminAddBookingNoteInputSchema
>;
