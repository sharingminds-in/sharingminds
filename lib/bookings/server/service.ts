import {
  and,
  desc,
  eq,
  gte,
  inArray,
  lte,
  or,
} from 'drizzle-orm';
import {
  addHours,
  addMinutes,
  format,
  getDay,
} from 'date-fns';

import {
  AccessPolicyError,
  assertMentorFeatureAccess as assertSharedMentorFeatureAccess,
} from '@/lib/access-policy/server';
import type { TRPCContext } from '@/lib/trpc/context';
import { db } from '@/lib/db';
import {
  mentorAvailabilityExceptions,
  mentorAvailabilitySchedules,
  mentorWeeklyPatterns,
  mentors,
  rescheduleRequests,
  sessionAuditLog,
  sessionPolicies,
  sessions,
  users,
} from '@/lib/db/schema';
import { DEFAULT_SESSION_POLICIES } from '@/lib/db/schema/session-policies';
import { getUserWithRoles, userHasRole } from '@/lib/db/user-helpers';
import { createNotificationRecord } from '@/lib/notifications/server/service';
import { validateBookingTime } from '@/lib/validations/booking';
import { bookingRateLimit } from '@/lib/rate-limit';
import { LiveKitRoomManager } from '@/lib/livekit/room-manager';
import { getPlanFeatures } from '@/lib/subscriptions/enforcement';
import {
  consumeFeature,
  enforceFeature,
  isSubscriptionPolicyError,
} from '@/lib/subscriptions/policy-runtime';
import {
  ACTION_POLICIES,
  resolveMenteeBookingAction,
} from '@/lib/subscriptions/policies';
import { FEATURE_KEYS } from '@/lib/subscriptions/feature-keys';
import { findAvailableReplacementMentor } from '@/lib/services/mentor-matching';
import { MENTOR_FEATURE_KEYS } from '@/lib/mentor/access-policy';
import {
  sendAlternativeMentorSelectedEmail,
  sendBookingConfirmedEmail,
  sendMenteeCancelledEmail,
  sendMenteeCancellationConfirmationEmail,
  sendMentorCancelledNoMentorEmail,
  sendMentorCancelledReassignedEmail,
  sendMentorCancellationConfirmationEmail,
  sendNewBookingAlertEmail,
  sendNewMentorAssignedEmail,
  sendRescheduleConfirmedEmail,
  sendRescheduleRequestEmail,
} from '@/lib/email';
import {
  assertBooking,
  BookingServiceError,
} from './errors';
import { findBlockingAvailabilityException } from '@/lib/mentor/availability-rules';
import {
  resolveAuthorizedBookingUpdate,
  resolveListBookingsAccess,
} from '@/lib/bookings/authorization';
import { calculateRefundPercentage } from '../policy-utils';
import type {
  AcceptReassignmentInput,
  CancelBookingInput,
  CreateBookingInput,
  CreateRescheduleRequestInput,
  GetBookingInput,
  GetSessionPoliciesInput,
  ListAlternativeMentorsInput,
  ListBookingsInput,
  MarkBookingNoShowInput,
  RejectReassignmentInput,
  RespondRescheduleInput,
  SelectAlternativeMentorInput,
  UpdateBookingInput,
  WithdrawRescheduleRequestInput,
} from './schemas';
import {
  acceptReassignmentInputSchema,
  cancelBookingInputSchema,
  createBookingInputSchema,
  createRescheduleRequestInputSchema,
  getBookingInputSchema,
  getSessionPoliciesInputSchema,
  listAlternativeMentorsInputSchema,
  listBookingsInputSchema,
  markBookingNoShowInputSchema,
  rejectReassignmentInputSchema,
  respondRescheduleInputSchema,
  selectAlternativeMentorInputSchema,
  updateBookingInputSchema,
  withdrawRescheduleRequestInputSchema,
} from './schemas';

type AuthenticatedContext = TRPCContext & {
  session: NonNullable<TRPCContext['session']>;
  userId: string;
};

type AlternativeMentor = {
  id: string;
  userId: string;
  name: string;
  avatar?: string;
  expertise: string[];
  hourlyRate: number;
  isAvailableAtOriginalTime: boolean;
};

function getRequestIp(context: AuthenticatedContext) {
  return (
    context.req.headers.get('x-forwarded-for') ??
    context.req.headers.get('x-real-ip') ??
    'unknown'
  );
}

function getRequestUserAgent(context: AuthenticatedContext) {
  return context.req.headers.get('user-agent') ?? 'unknown';
}

async function ensureRole(
  userId: string,
  allowedRoles: Array<'admin' | 'mentor' | 'mentee'>
) {
  for (const role of allowedRoles) {
    if (await userHasRole(userId, role)) {
      return;
    }
  }

  throw new BookingServiceError(403, 'Access denied');
}

async function getActorRoleFlags(userId: string) {
  const user = await getUserWithRoles(userId);

  assertBooking(user, 404, 'User not found');

  const roleNames = new Set(user.roles.map((role) => role.name));

  return {
    userId,
    isAdmin: roleNames.has('admin'),
    isMentor: roleNames.has('mentor'),
    isMentee: roleNames.has('mentee'),
  };
}

async function assertMentorScheduleFeatureAccess(userId: string) {
  try {
    await assertSharedMentorFeatureAccess({
      userId,
      feature: MENTOR_FEATURE_KEYS.scheduleManage,
      source: 'bookings.schedule.manage',
    });
  } catch (error) {
    if (error instanceof AccessPolicyError) {
      throw new BookingServiceError(error.status, error.message, error.data);
    }

    throw error;
  }
}

async function getPolicyValue(key: string, defaultValue: string) {
  const [policy] = await db
    .select()
    .from(sessionPolicies)
    .where(eq(sessionPolicies.policyKey, key))
    .limit(1);

  return policy?.policyValue ?? defaultValue;
}

export async function getSessionPolicies(input: GetSessionPoliciesInput) {
  const parsed = getSessionPoliciesInputSchema.parse(input);

  const [
    cancellationCutoffHours,
    rescheduleCutoffHours,
    maxReschedules,
    mentorCancellationCutoffHours,
    mentorRescheduleCutoffHours,
    mentorMaxReschedules,
    freeCancellationHours,
    partialRefundPercentage,
    lateCancellationRefundPercentage,
    defaultSessionPrice,
  ] = await Promise.all([
    getPolicyValue(
      DEFAULT_SESSION_POLICIES.CANCELLATION_CUTOFF_HOURS.key,
      DEFAULT_SESSION_POLICIES.CANCELLATION_CUTOFF_HOURS.value
    ),
    getPolicyValue(
      DEFAULT_SESSION_POLICIES.RESCHEDULE_CUTOFF_HOURS.key,
      DEFAULT_SESSION_POLICIES.RESCHEDULE_CUTOFF_HOURS.value
    ),
    getPolicyValue(
      DEFAULT_SESSION_POLICIES.MAX_RESCHEDULES_PER_SESSION.key,
      DEFAULT_SESSION_POLICIES.MAX_RESCHEDULES_PER_SESSION.value
    ),
    getPolicyValue(
      DEFAULT_SESSION_POLICIES.MENTOR_CANCELLATION_CUTOFF_HOURS.key,
      DEFAULT_SESSION_POLICIES.MENTOR_CANCELLATION_CUTOFF_HOURS.value
    ),
    getPolicyValue(
      DEFAULT_SESSION_POLICIES.MENTOR_RESCHEDULE_CUTOFF_HOURS.key,
      DEFAULT_SESSION_POLICIES.MENTOR_RESCHEDULE_CUTOFF_HOURS.value
    ),
    getPolicyValue(
      DEFAULT_SESSION_POLICIES.MENTOR_MAX_RESCHEDULES_PER_SESSION.key,
      DEFAULT_SESSION_POLICIES.MENTOR_MAX_RESCHEDULES_PER_SESSION.value
    ),
    getPolicyValue(
      DEFAULT_SESSION_POLICIES.FREE_CANCELLATION_HOURS.key,
      DEFAULT_SESSION_POLICIES.FREE_CANCELLATION_HOURS.value
    ),
    getPolicyValue(
      DEFAULT_SESSION_POLICIES.PARTIAL_REFUND_PERCENTAGE.key,
      DEFAULT_SESSION_POLICIES.PARTIAL_REFUND_PERCENTAGE.value
    ),
    getPolicyValue(
      DEFAULT_SESSION_POLICIES.LATE_CANCELLATION_REFUND_PERCENTAGE.key,
      DEFAULT_SESSION_POLICIES.LATE_CANCELLATION_REFUND_PERCENTAGE.value
    ),
    getPolicyValue(
      DEFAULT_SESSION_POLICIES.DEFAULT_SESSION_PRICE.key,
      DEFAULT_SESSION_POLICIES.DEFAULT_SESSION_PRICE.value
    ),
  ]);

  if (parsed.role === 'mentor') {
    return {
      cancellationCutoffHours: parseInt(mentorCancellationCutoffHours, 10),
      rescheduleCutoffHours: parseInt(mentorRescheduleCutoffHours, 10),
      maxReschedules: parseInt(mentorMaxReschedules, 10),
      freeCancellationHours: parseInt(freeCancellationHours, 10),
      partialRefundPercentage: parseInt(partialRefundPercentage, 10),
      lateCancellationRefundPercentage: parseInt(
        lateCancellationRefundPercentage,
        10
      ),
      defaultSessionPrice: parseInt(defaultSessionPrice, 10),
    };
  }

  if (parsed.role === 'mentee') {
    return {
      cancellationCutoffHours: parseInt(cancellationCutoffHours, 10),
      rescheduleCutoffHours: parseInt(rescheduleCutoffHours, 10),
      maxReschedules: parseInt(maxReschedules, 10),
      freeCancellationHours: parseInt(freeCancellationHours, 10),
      partialRefundPercentage: parseInt(partialRefundPercentage, 10),
      lateCancellationRefundPercentage: parseInt(
        lateCancellationRefundPercentage,
        10
      ),
      defaultSessionPrice: parseInt(defaultSessionPrice, 10),
    };
  }

  return {
    mentee: {
      cancellationCutoffHours: parseInt(cancellationCutoffHours, 10),
      rescheduleCutoffHours: parseInt(rescheduleCutoffHours, 10),
      maxReschedules: parseInt(maxReschedules, 10),
    },
    mentor: {
      cancellationCutoffHours: parseInt(mentorCancellationCutoffHours, 10),
      rescheduleCutoffHours: parseInt(mentorRescheduleCutoffHours, 10),
      maxReschedules: parseInt(mentorMaxReschedules, 10),
    },
    freeCancellationHours: parseInt(freeCancellationHours, 10),
    partialRefundPercentage: parseInt(partialRefundPercentage, 10),
    lateCancellationRefundPercentage: parseInt(
      lateCancellationRefundPercentage,
      10
    ),
    defaultSessionPrice: parseInt(defaultSessionPrice, 10),
  };
}

export async function listBookings(
  context: AuthenticatedContext,
  input: ListBookingsInput
) {
  const parsed = listBookingsInputSchema.parse(input);
  const actor = await getActorRoleFlags(context.userId);
  if (parsed.role === 'mentor' && actor.isMentor && !actor.isAdmin) {
    await assertMentorScheduleFeatureAccess(context.userId);
  }
  const access = resolveListBookingsAccess(actor, parsed);
  const conditions = [];

  if (access.kind === 'mentor-range') {
    conditions.push(eq(sessions.mentorId, access.mentorId));
    conditions.push(gte(sessions.scheduledAt, new Date(access.start)));
    conditions.push(lte(sessions.scheduledAt, new Date(access.end)));
  } else if (access.kind === 'self-mentor') {
    conditions.push(eq(sessions.mentorId, context.userId));
  } else {
    conditions.push(eq(sessions.menteeId, context.userId));
  }

  if (access.status) {
    conditions.push(eq(sessions.status, access.status));
  }

  const whereCondition =
    conditions.length === 1 ? conditions[0] : and(...conditions);

  return db
    .select({
      id: sessions.id,
      title: sessions.title,
      description: sessions.description,
      status: sessions.status,
      scheduledAt: sessions.scheduledAt,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
      duration: sessions.duration,
      meetingType: sessions.meetingType,
      location: sessions.location,
      meetingUrl: sessions.meetingUrl,
      rate: sessions.rate,
      currency: sessions.currency,
      mentorNotes: sessions.mentorNotes,
      menteeNotes: sessions.menteeNotes,
      createdAt: sessions.createdAt,
      updatedAt: sessions.updatedAt,
      mentorId: sessions.mentorId,
      menteeId: sessions.menteeId,
      rescheduleCount: sessions.rescheduleCount,
      mentorRescheduleCount: sessions.mentorRescheduleCount,
      cancelledBy: sessions.cancelledBy,
      pendingRescheduleRequestId: sessions.pendingRescheduleRequestId,
      pendingRescheduleTime: sessions.pendingRescheduleTime,
      pendingRescheduleBy: sessions.pendingRescheduleBy,
      wasReassigned: sessions.wasReassigned,
      reassignedFromMentorId: sessions.reassignedFromMentorId,
      reassignedAt: sessions.reassignedAt,
      reassignmentStatus: sessions.reassignmentStatus,
      cancelledMentorIds: sessions.cancelledMentorIds,
      mentorName: mentors.fullName,
      mentorAvatar: mentors.profileImageUrl,
      menteeName: users.name,
      menteeAvatar: users.image,
    })
    .from(sessions)
    .leftJoin(mentors, eq(sessions.mentorId, mentors.userId))
    .leftJoin(users, eq(sessions.menteeId, users.id))
    .where(whereCondition)
    .orderBy(desc(sessions.scheduledAt));
}

export async function getBooking(
  context: AuthenticatedContext,
  input: GetBookingInput
) {
  const parsed = getBookingInputSchema.parse(input);

  const [booking] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.id, parsed.bookingId),
        or(
          eq(sessions.mentorId, context.userId),
          eq(sessions.menteeId, context.userId)
        )
      )
    )
    .limit(1);

  assertBooking(booking, 404, 'Booking not found or access denied');

  if (booking.mentorId === context.userId) {
    await assertMentorScheduleFeatureAccess(context.userId);
  }

  return booking;
}

export async function updateBooking(
  context: AuthenticatedContext,
  input: UpdateBookingInput
) {
  const parsed = updateBookingInputSchema.parse(input);
  const booking = await getBooking(context, { bookingId: parsed.bookingId });
  const isMentor = booking.mentorId === context.userId;
  const actorRole = isMentor ? 'mentor' : 'mentee';
  const authorizedUpdate = resolveAuthorizedBookingUpdate({
    actorRole,
    currentStatus: booking.status,
    input: parsed,
  });

  const [updatedBooking] = await db
    .update(sessions)
    .set({
      ...authorizedUpdate,
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, parsed.bookingId))
    .returning();

  assertBooking(updatedBooking, 500, 'Failed to update booking');

  if (authorizedUpdate.status && authorizedUpdate.status !== booking.status) {
    const otherUserId = isMentor ? booking.menteeId : booking.mentorId;
    const userRole = isMentor ? 'mentor' : 'mentee';

    let notificationType:
      | 'BOOKING_CONFIRMED'
      | 'BOOKING_CANCELLED'
      | 'BOOKING_RESCHEDULED'
      | 'SESSION_COMPLETED' = 'BOOKING_CONFIRMED';
    let title = 'Session Updated';
    let message = `Your session "${booking.title}" has been updated by the ${userRole}`;

    if (authorizedUpdate.status === 'cancelled') {
      notificationType = 'BOOKING_CANCELLED';
      title = 'Session Cancelled';
      message = `Your session "${booking.title}" has been cancelled by the ${userRole}`;
    } else if (authorizedUpdate.status === 'completed') {
      notificationType = 'SESSION_COMPLETED';
      title = 'Session Completed';
      message = `Your session "${booking.title}" has been marked as completed`;
    }

    await createNotificationRecord({
      userId: otherUserId,
      type: notificationType,
      title,
      message,
      relatedId: booking.id,
      relatedType: 'session',
      actionUrl: `/dashboard?section=${isMentor ? 'sessions' : 'schedule'}`,
      actionText: 'View Details',
    });
  }

  return {
    booking: updatedBooking,
    message: 'Booking updated successfully!',
  };
}

export async function createBooking(
  context: AuthenticatedContext,
  input: CreateBookingInput
) {
  const parsed = createBookingInputSchema.parse(input);
  await ensureRole(context.userId, ['mentee']);
  bookingRateLimit.check(context.req, context.userId);

  const scheduledAt = new Date(parsed.scheduledAt);
  const timeErrors = validateBookingTime(scheduledAt, parsed.duration);

  assertBooking(timeErrors.length === 0, 400, 'Invalid booking time', {
    details: timeErrors,
  });
  assertBooking(
    parsed.mentorId !== context.userId,
    400,
    'You cannot book a session with yourself'
  );

  const menteeSessionAction = resolveMenteeBookingAction(parsed.sessionType);
  const bookingSource = parsed.bookingSource ?? 'default';
  const isAiBooking = bookingSource === 'ai';
  let aiSpecialRate: number | null = null;
  let mentorSessionFeatureAction:
    | 'mentor.free_session_availability'
    | 'mentor.paid_session_availability'
    | null = null;

  if (isAiBooking) {
    try {
      await enforceFeature({
        action: menteeSessionAction,
        userId: context.userId,
        failureMessage: 'You have reached your session limit for this type',
      });
    } catch (error) {
      if (isSubscriptionPolicyError(error)) {
        throw new BookingServiceError(error.status, error.payload.error, error.payload);
      }
      throw error;
    }

    const visibilityAccess = await enforceFeature({
      action: 'mentor.ai.visibility',
      userId: parsed.mentorId,
      failureMessage: 'Mentor AI visibility is not included in their plan',
    }).catch((error) => {
      if (isSubscriptionPolicyError(error)) {
        return null;
      }
      throw error;
    });

    assertBooking(visibilityAccess?.has_access, 403, 'Mentor is not visible to AI search');

    mentorSessionFeatureAction =
      parsed.sessionType === 'FREE'
        ? 'mentor.free_session_availability'
        : 'mentor.paid_session_availability';

    const mentorSessionAccess = await enforceFeature({
      action: mentorSessionFeatureAction,
      userId: parsed.mentorId,
      failureMessage: 'Mentor has reached their session limit',
    }).catch((error) => {
      if (isSubscriptionPolicyError(error)) {
        return null;
      }
      throw error;
    });

    assertBooking(
      mentorSessionAccess?.has_access,
      403,
      'Mentor has no session availability'
    );

    if (parsed.sessionType === 'PAID') {
      try {
        const menteeFeatures = await getPlanFeatures(context.userId, {
          audience: 'mentee',
          actorRole: 'mentee',
        });
        const paidVideoFeature = menteeFeatures.find(
          (feature) =>
            feature.feature_key === FEATURE_KEYS.PAID_VIDEO_SESSIONS_MONTHLY
        );
        const paidVideoPlanRate = paidVideoFeature?.limit_amount ?? null;
        if (
          paidVideoPlanRate !== null &&
          !Number.isNaN(paidVideoPlanRate) &&
          paidVideoPlanRate > 0
        ) {
          aiSpecialRate = paidVideoPlanRate;
        }
      } catch (error) {
        console.error('Failed to load plan features for AI rate:', error);
      }
    }
  }

  const [mentor] = await db
    .select()
    .from(mentors)
    .where(eq(mentors.userId, parsed.mentorId))
    .limit(1);

  assertBooking(mentor?.isAvailable, 404, 'Mentor not found or not available');

  if (isAiBooking) {
    assertBooking(
      mentor.searchMode === 'AI_SEARCH',
      403,
      'Mentor is not visible to AI search'
    );
  }

  const [availabilitySchedule] = await db
    .select()
    .from(mentorAvailabilitySchedules)
    .where(eq(mentorAvailabilitySchedules.mentorId, mentor.id))
    .limit(1);

  assertBooking(
    availabilitySchedule?.isActive,
    400,
    'Mentor has not set up availability'
  );

  const now = new Date();
  const minBookingTime = new Date(
    now.getTime() + availabilitySchedule.minAdvanceBookingHours * 60 * 60 * 1000
  );
  const maxBookingTime = new Date(
    now.getTime() + availabilitySchedule.maxAdvanceBookingDays * 24 * 60 * 60 * 1000
  );

  assertBooking(
    scheduledAt >= minBookingTime,
    400,
    `Bookings must be made at least ${availabilitySchedule.minAdvanceBookingHours} hours in advance`
  );
  assertBooking(
    scheduledAt <= maxBookingTime,
    400,
    `Bookings cannot be made more than ${availabilitySchedule.maxAdvanceBookingDays} days in advance`
  );

  const dayOfWeek = getDay(scheduledAt);
  const [weeklyPattern] = await db
    .select()
    .from(mentorWeeklyPatterns)
    .where(
      and(
        eq(mentorWeeklyPatterns.scheduleId, availabilitySchedule.id),
        eq(mentorWeeklyPatterns.dayOfWeek, dayOfWeek)
      )
    )
    .limit(1);

  assertBooking(
    weeklyPattern?.isEnabled,
    400,
    'Mentor is not available on this day'
  );

  const timeBlocks = (weeklyPattern.timeBlocks as any[]) ?? [];
  const bookingTimeStr = `${scheduledAt.getHours().toString().padStart(2, '0')}:${scheduledAt.getMinutes().toString().padStart(2, '0')}`;
  let isInAvailableBlock = false;

  for (const block of timeBlocks) {
    if (block.type !== 'AVAILABLE') {
      continue;
    }

    if (bookingTimeStr >= block.startTime && bookingTimeStr < block.endTime) {
      const sessionEndTime = addMinutes(scheduledAt, parsed.duration);
      const sessionEndStr = `${sessionEndTime.getHours().toString().padStart(2, '0')}:${sessionEndTime.getMinutes().toString().padStart(2, '0')}`;

      if (sessionEndStr <= block.endTime) {
        isInAvailableBlock = true;
        break;
      }
    }
  }

  assertBooking(
    isInAvailableBlock,
    400,
    "This time slot is not within mentor's available hours"
  );

  const exceptions = await db
    .select()
    .from(mentorAvailabilityExceptions)
    .where(
      and(
        eq(mentorAvailabilityExceptions.scheduleId, availabilitySchedule.id),
        lte(mentorAvailabilityExceptions.startDate, scheduledAt),
        gte(mentorAvailabilityExceptions.endDate, scheduledAt)
      )
    );

  const blockingException = findBlockingAvailabilityException(exceptions);
  assertBooking(
    !blockingException,
    400,
    `Mentor is unavailable: ${blockingException?.reason || 'Time off'}`
  );

  const bufferTime = availabilitySchedule.bufferTimeBetweenSessions || 0;
  const newBookingStart = scheduledAt;
  const newBookingEnd = addMinutes(newBookingStart, parsed.duration);

  const potentialConflicts = await db
    .select({
      scheduledAt: sessions.scheduledAt,
      duration: sessions.duration,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.mentorId, parsed.mentorId),
        eq(sessions.status, 'scheduled')
      )
    );

  for (const existingBooking of potentialConflicts) {
    const existingBookingStart = new Date(existingBooking.scheduledAt);
    const existingBookingEnd = addMinutes(
      existingBookingStart,
      existingBooking.duration
    );
    const existingStartWithBuffer = new Date(
      existingBookingStart.getTime() - bufferTime * 60 * 1000
    );
    const existingEndWithBuffer = new Date(
      existingBookingEnd.getTime() + bufferTime * 60 * 1000
    );

    assertBooking(
      !(
        newBookingStart < existingEndWithBuffer &&
        newBookingEnd > existingStartWithBuffer
      ),
      409,
      'This time slot conflicts with another booking'
    );
  }

  const mentorBaseRate = mentor.hourlyRate ? Number(mentor.hourlyRate) : 0;
  const sessionRate =
    isAiBooking &&
    parsed.sessionType === 'PAID' &&
    aiSpecialRate !== null
      ? aiSpecialRate
      : mentorBaseRate;

  const [newBooking] = await db
    .insert(sessions)
    .values({
      mentorId: parsed.mentorId,
      menteeId: context.userId,
      title: parsed.title,
      description: parsed.description,
      sessionType: parsed.sessionType,
      bookingSource,
      scheduledAt,
      duration: parsed.duration,
      meetingType: parsed.meetingType,
      location: parsed.location,
      status: 'scheduled',
      rate: sessionRate,
      currency: mentor.currency || 'USD',
    })
    .returning();

  if (isAiBooking && mentorSessionFeatureAction) {
    try {
      await consumeFeature({
        action: menteeSessionAction,
        userId: context.userId,
        delta: { count: 1, minutes: parsed.duration },
        resourceType: 'session',
        resourceId: newBooking.id,
      });

      await consumeFeature({
        action: mentorSessionFeatureAction,
        userId: parsed.mentorId,
        delta: { count: 1, minutes: parsed.duration },
        resourceType: 'session',
        resourceId: newBooking.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('No active mentor subscription')) {
        throw new BookingServiceError(500, 'Failed to track session usage');
      }
      console.warn('Usage tracking warning (mentor lacks subscription):', message);
    }
  }

  await createNotificationRecord({
    userId: parsed.mentorId,
    type: 'BOOKING_REQUEST',
    title: 'New Session Booked!',
    message: `${context.session.user.name || 'A mentee'} has booked a session with you for ${parsed.title}`,
    relatedId: newBooking.id,
    relatedType: 'session',
    actionUrl: '/dashboard?section=schedule',
    actionText: 'View Schedule',
  });

  await createNotificationRecord({
    userId: context.userId,
    type: 'BOOKING_CONFIRMED',
    title: 'Session Booking Confirmed',
    message: `Your session "${parsed.title}" has been scheduled successfully`,
    relatedId: newBooking.id,
    relatedType: 'session',
    actionUrl: '/dashboard?section=sessions',
    actionText: 'View Sessions',
  });

  const bookingEmailData = {
    sessionId: newBooking.id,
    sessionTitle: parsed.title,
    scheduledAt,
    duration: parsed.duration,
    meetingType: parsed.meetingType as 'video' | 'audio' | 'chat',
  };

  const [mentorEmailData] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, parsed.mentorId))
    .limit(1);
  const [menteeData] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, context.userId))
    .limit(1);

  if (menteeData?.email) {
    await sendBookingConfirmedEmail(
      menteeData.email,
      menteeData.name || 'Mentee',
      mentorEmailData?.name || 'Your Mentor',
      bookingEmailData
    );
  }

  if (mentorEmailData?.email) {
    await sendNewBookingAlertEmail(
      mentorEmailData.email,
      mentorEmailData.name || 'Mentor',
      context.session.user.name || 'A Mentee',
      bookingEmailData
    );
  }

  try {
    const { meetingUrl } = await LiveKitRoomManager.createRoomForSession(
      newBooking.id
    );

    await db
      .update(sessions)
      .set({ meetingUrl })
      .where(eq(sessions.id, newBooking.id));
  } catch (roomError) {
    console.error('Failed to create LiveKit room for session', {
      sessionId: newBooking.id,
      error: roomError instanceof Error ? roomError.message : 'Unknown error',
    });
  }

  return {
    booking: newBooking,
    message: 'Session booked successfully!',
  };
}

export async function markBookingNoShow(
  context: AuthenticatedContext,
  input: MarkBookingNoShowInput
) {
  const parsed = markBookingNoShowInputSchema.parse(input);
  await ensureRole(context.userId, ['mentor', 'admin']);

  const [booking] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, parsed.bookingId))
    .limit(1);

  assertBooking(booking, 404, 'Booking not found');
  assertBooking(
    booking.mentorId === context.userId,
    403,
    'Only mentors can mark sessions as no-show'
  );
  await assertMentorScheduleFeatureAccess(context.userId);
  assertBooking(
    booking.status === 'scheduled',
    400,
    `Cannot mark a ${booking.status} session as no-show`
  );

  const scheduledTime = new Date(booking.scheduledAt);
  const now = new Date();
  assertBooking(now >= scheduledTime, 400, 'Cannot mark future sessions as no-show');

  const hoursSinceSession =
    (now.getTime() - scheduledTime.getTime()) / (1000 * 60 * 60);
  assertBooking(
    hoursSinceSession <= 24,
    400,
    'Cannot mark sessions as no-show after 24 hours'
  );

  const [updatedBooking] = await db
    .update(sessions)
    .set({
      status: 'no_show',
      noShowMarkedBy: 'mentor',
      noShowMarkedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, parsed.bookingId))
    .returning();

  await createNotificationRecord({
    userId: booking.menteeId,
    type: 'SESSION_REMINDER',
    title: 'Session Marked as No-Show',
    message: `Your session "${booking.title}" was marked as no-show. Please ensure to attend future sessions or cancel in advance.`,
    relatedId: booking.id,
    relatedType: 'session',
    actionUrl: '/dashboard?section=sessions',
    actionText: 'View Sessions',
  });

  return {
    booking: updatedBooking,
    message: 'Session marked as no-show',
  };
}

async function findAvailableMentorsForSession(
  scheduledAt: Date,
  duration: number,
  excludeMentorIds: string[],
  fixedTimeOnly: boolean
): Promise<AlternativeMentor[]> {
  const dayOfWeek = getDay(scheduledAt);
  const sessionEndTime = addMinutes(scheduledAt, duration);
  const bookingTimeStr = `${scheduledAt.getHours().toString().padStart(2, '0')}:${scheduledAt.getMinutes().toString().padStart(2, '0')}`;
  const sessionEndStr = `${sessionEndTime.getHours().toString().padStart(2, '0')}:${sessionEndTime.getMinutes().toString().padStart(2, '0')}`;

  const potentialMentors = await db
    .select({
      mentorId: mentors.id,
      userId: mentors.userId,
      scheduleId: mentorAvailabilitySchedules.id,
      bufferTime: mentorAvailabilitySchedules.bufferTimeBetweenSessions,
    })
    .from(mentors)
    .innerJoin(
      mentorAvailabilitySchedules,
      eq(mentors.id, mentorAvailabilitySchedules.mentorId)
    )
    .where(
      and(
        eq(mentors.isAvailable, true),
        eq(mentors.verificationStatus, 'VERIFIED'),
        eq(mentorAvailabilitySchedules.isActive, true)
      )
    );

  const filteredMentors = potentialMentors.filter(
    (mentor) => !excludeMentorIds.includes(mentor.userId)
  );
  const availableMentors: AlternativeMentor[] = [];

  for (const mentor of filteredMentors) {
    const [weeklyPattern] = await db
      .select()
      .from(mentorWeeklyPatterns)
      .where(
        and(
          eq(mentorWeeklyPatterns.scheduleId, mentor.scheduleId),
          eq(mentorWeeklyPatterns.dayOfWeek, dayOfWeek),
          eq(mentorWeeklyPatterns.isEnabled, true)
        )
      )
      .limit(1);

    if (!weeklyPattern) {
      continue;
    }

    const timeBlocks = (weeklyPattern.timeBlocks as any[]) ?? [];
    let isTimeSlotAvailable = false;

    for (const block of timeBlocks) {
      if (block.type === 'AVAILABLE') {
        if (
          bookingTimeStr >= block.startTime &&
          sessionEndStr <= block.endTime
        ) {
          isTimeSlotAvailable = true;
          break;
        }
      }
    }

    if (fixedTimeOnly && !isTimeSlotAvailable) {
      continue;
    }

    const exceptions = await db
      .select()
      .from(mentorAvailabilityExceptions)
      .where(eq(mentorAvailabilityExceptions.scheduleId, mentor.scheduleId));

    let isBlockedByException = false;
    for (const exception of exceptions) {
      const exceptionStart = new Date(exception.startDate);
      const exceptionEnd = new Date(exception.endDate);

      if (scheduledAt >= exceptionStart && scheduledAt <= exceptionEnd) {
        if (
          (exception.type === 'BLOCKED' || exception.type === 'BREAK') &&
          exception.isFullDay
        ) {
          isBlockedByException = true;
          break;
        }
      }
    }

    if (isBlockedByException) {
      continue;
    }

    const conflicts = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.mentorId, mentor.userId),
          inArray(sessions.status, ['scheduled', 'in_progress'])
        )
      );

    let hasConflict = false;
    const bufferMinutes = mentor.bufferTime || 0;

    for (const session of conflicts) {
      const existingStart = new Date(session.scheduledAt);
      const existingEnd = addMinutes(existingStart, session.duration || 60);
      const blockedStart = addMinutes(existingStart, -bufferMinutes);
      const blockedEnd = addMinutes(existingEnd, bufferMinutes);

      if (scheduledAt < blockedEnd && sessionEndTime > blockedStart) {
        hasConflict = true;
        break;
      }
    }

    if (fixedTimeOnly && hasConflict) {
      continue;
    }

    const [mentorDetails] = await db
      .select({
        id: mentors.id,
        userId: mentors.userId,
        expertise: mentors.expertise,
        hourlyRate: mentors.hourlyRate,
      })
      .from(mentors)
      .where(eq(mentors.userId, mentor.userId))
      .limit(1);
    const [userDetails] = await db
      .select({ name: users.name, image: users.image })
      .from(users)
      .where(eq(users.id, mentor.userId))
      .limit(1);

    if (!mentorDetails || !userDetails) {
      continue;
    }

    availableMentors.push({
      id: mentorDetails.id,
      userId: mentorDetails.userId,
      name: userDetails.name || 'Unknown',
      avatar: userDetails.image || undefined,
      expertise: (mentorDetails.expertise as string[]) || [],
      hourlyRate: Number(mentorDetails.hourlyRate) || 0,
      isAvailableAtOriginalTime: isTimeSlotAvailable && !hasConflict,
    });
  }

  return availableMentors;
}

export async function listAlternativeMentors(
  context: AuthenticatedContext,
  input: ListAlternativeMentorsInput
) {
  const parsed = listAlternativeMentorsInputSchema.parse(input);
  const [booking] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, parsed.bookingId))
    .limit(1);

  assertBooking(booking, 404, 'Session not found');
  assertBooking(booking.menteeId === context.userId, 403, 'Unauthorized');

  const cancelledMentorIds = (booking.cancelledMentorIds as string[]) || [];
  const availableMentors = await findAvailableMentorsForSession(
    booking.scheduledAt,
    booking.duration || 60,
    cancelledMentorIds,
    parsed.fixedTime
  );

  return {
    mentors: availableMentors,
    originalScheduledAt: booking.scheduledAt.toISOString(),
    originalDuration: booking.duration || 60,
    sessionTitle: booking.title,
    fixedTime: parsed.fixedTime,
  };
}

export async function acceptReassignment(
  context: AuthenticatedContext,
  input: AcceptReassignmentInput
) {
  const parsed = acceptReassignmentInputSchema.parse(input);
  const [booking] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, parsed.bookingId))
    .limit(1);

  assertBooking(booking, 404, 'Booking not found');
  assertBooking(
    booking.menteeId === context.userId,
    403,
    'Only the mentee can accept a reassignment'
  );
  assertBooking(
    booking.wasReassigned &&
      booking.reassignmentStatus === 'pending_acceptance',
    400,
    'This session is not pending reassignment acceptance'
  );

  const [updatedBooking] = await db
    .update(sessions)
    .set({
      reassignmentStatus: 'accepted',
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, parsed.bookingId))
    .returning();

  const [newMentorData] = await db
    .select({ name: users.name })
    .from(mentors)
    .innerJoin(users, eq(mentors.userId, users.id))
    .where(eq(mentors.userId, booking.mentorId))
    .limit(1);

  await createNotificationRecord({
    userId: booking.mentorId,
    type: 'REASSIGNMENT_ACCEPTED',
    title: 'Mentee Confirmed Session',
    message: `The mentee has confirmed the reassigned session "${booking.title}". The session will proceed as scheduled.`,
    relatedId: booking.id,
    relatedType: 'session',
    actionUrl: '/dashboard?section=schedule',
    actionText: 'View Session',
  });

  await db.insert(sessionAuditLog).values({
    sessionId: booking.id,
    userId: context.userId,
    action: 'reassignment_accepted',
    reasonDetails: 'Mentee accepted auto-reassigned mentor',
    policySnapshot: {
      originalMentor: booking.reassignedFromMentorId,
      newMentor: booking.mentorId,
    },
    ipAddress: getRequestIp(context),
    userAgent: getRequestUserAgent(context),
  });

  return {
    booking: updatedBooking,
    message: `Great! You've confirmed your session with ${newMentorData?.name || 'your mentor'}.`,
  };
}

export async function rejectReassignment(
  context: AuthenticatedContext,
  input: RejectReassignmentInput
) {
  const parsed = rejectReassignmentInputSchema.parse(input);
  const [booking] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, parsed.bookingId))
    .limit(1);

  assertBooking(booking, 404, 'Booking not found');
  assertBooking(
    booking.menteeId === context.userId,
    403,
    'Only the mentee can reject a reassignment'
  );
  assertBooking(
    ['pending_acceptance', 'awaiting_mentee_choice'].includes(
      booking.reassignmentStatus || ''
    ),
    400,
    'This session is not pending reassignment decision'
  );

  const sessionRate = booking.rate ? parseFloat(booking.rate) : 0;
  const refundAmount = sessionRate;
  const refundPercentage = 100;

  const [cancelledBooking] = await db
    .update(sessions)
    .set({
      status: 'cancelled',
      reassignmentStatus: 'rejected',
      cancelledBy: 'mentee',
      cancellationReason:
        parsed.reason || 'Mentee rejected auto-reassigned mentor',
      refundPercentage,
      refundAmount: refundAmount.toFixed(2),
      refundStatus: refundAmount > 0 ? 'pending' : 'none',
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, parsed.bookingId))
    .returning();

  await createNotificationRecord({
    userId: booking.mentorId,
    type: 'REASSIGNMENT_REJECTED',
    title: 'Session Cancelled - Mentee Declined Reassignment',
    message: `The mentee declined the reassigned session "${booking.title}". The session has been cancelled.`,
    relatedId: booking.id,
    relatedType: 'session',
    actionUrl: '/dashboard?section=schedule',
    actionText: 'View Schedule',
  });

  if (
    booking.reassignedFromMentorId &&
    booking.reassignedFromMentorId !== booking.mentorId
  ) {
    await createNotificationRecord({
      userId: booking.reassignedFromMentorId,
      type: 'BOOKING_CANCELLED',
      title: 'Reassigned Session Cancelled',
      message: `The session "${booking.title}" that was reassigned after your cancellation has been fully cancelled by the mentee.`,
      relatedId: booking.id,
      relatedType: 'session',
    });
  }

  await createNotificationRecord({
    userId: booking.menteeId,
    type: 'BOOKING_CANCELLED',
    title: 'Session Cancelled',
    message: `Your session "${booking.title}" has been cancelled.${refundAmount > 0 ? ` A full refund of $${refundAmount.toFixed(2)} will be processed.` : ''}`,
    relatedId: booking.id,
    relatedType: 'session',
    actionUrl: '/dashboard?section=sessions',
    actionText: 'View Sessions',
  });

  await db.insert(sessionAuditLog).values({
    sessionId: booking.id,
    userId: context.userId,
    action: 'reassignment_rejected',
    reasonDetails: parsed.reason || 'Mentee rejected auto-reassigned mentor',
    policySnapshot: {
      originalMentor: booking.reassignedFromMentorId,
      rejectedMentor: booking.mentorId,
      refundPercentage,
      refundAmount,
      reason: 'Full refund due to mentor cancellation + reassignment rejection',
    },
    ipAddress: getRequestIp(context),
    userAgent: getRequestUserAgent(context),
  });

  return {
    booking: cancelledBooking,
    refundPercentage,
    refundAmount,
    message: `Session cancelled. You will receive a full refund of $${refundAmount.toFixed(2)}.`,
  };
}

export async function selectAlternativeMentor(
  context: AuthenticatedContext,
  input: SelectAlternativeMentorInput
) {
  const parsed = selectAlternativeMentorInputSchema.parse(input);
  const [booking] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, parsed.bookingId))
    .limit(1);

  assertBooking(booking, 404, 'Session not found');
  assertBooking(booking.menteeId === context.userId, 403, 'Unauthorized');
  assertBooking(
    ['pending_acceptance', 'awaiting_mentee_choice'].includes(
      booking.reassignmentStatus || ''
    ),
    400,
    'Session is not in a reassignable state'
  );

  const [newMentorUser] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, parsed.newMentorId))
    .limit(1);

  assertBooking(newMentorUser, 404, 'Mentor not found');

  const updateData: Record<string, unknown> = {
    mentorId: parsed.newMentorId,
    reassignmentStatus: 'accepted',
    wasReassigned: true,
    reassignedAt: new Date(),
    updatedAt: new Date(),
  };

  if (parsed.scheduledAt) {
    updateData.scheduledAt = new Date(parsed.scheduledAt);
  }

  await db
    .update(sessions)
    .set(updateData)
    .where(eq(sessions.id, parsed.bookingId));

  const [menteeData] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, booking.menteeId))
    .limit(1);

  const finalScheduledAt = parsed.scheduledAt
    ? new Date(parsed.scheduledAt)
    : booking.scheduledAt;
  const bookingEmailData = {
    sessionId: booking.id,
    sessionTitle: booking.title,
    scheduledAt: finalScheduledAt,
    duration: booking.duration,
    meetingType: booking.meetingType as 'video' | 'audio' | 'chat',
  };

  if (menteeData?.email) {
    await sendAlternativeMentorSelectedEmail(
      menteeData.email,
      menteeData.name || 'Mentee',
      newMentorUser.name || 'Your New Mentor',
      bookingEmailData
    );
  }

  if (newMentorUser.email) {
    await sendNewMentorAssignedEmail(
      newMentorUser.email,
      newMentorUser.name || 'Mentor',
      menteeData?.name || context.session.user.name || 'A Mentee',
      bookingEmailData,
      false
    );
  }

  return {
    message: `Session has been assigned to ${newMentorUser.name}.`,
    newMentorName: newMentorUser.name,
    scheduledAt: parsed.scheduledAt || booking.scheduledAt.toISOString(),
  };
}

export async function withdrawRescheduleRequest(
  context: AuthenticatedContext,
  input: WithdrawRescheduleRequestInput
) {
  const parsed = withdrawRescheduleRequestInputSchema.parse(input);
  const [booking] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, parsed.bookingId))
    .limit(1);

  assertBooking(booking, 404, 'Session not found');
  assertBooking(
    booking.pendingRescheduleRequestId,
    400,
    'No pending reschedule request to withdraw'
  );

  const [rescheduleRequest] = await db
    .select()
    .from(rescheduleRequests)
    .where(
      and(
        eq(rescheduleRequests.id, booking.pendingRescheduleRequestId!),
        eq(rescheduleRequests.sessionId, parsed.bookingId)
      )
    )
    .limit(1);

  assertBooking(rescheduleRequest, 404, 'Reschedule request not found');
  assertBooking(
    ['pending', 'counter_proposed'].includes(rescheduleRequest.status),
    400,
    'This reschedule request cannot be withdrawn - it has already been resolved'
  );
  assertBooking(
    rescheduleRequest.initiatorId === context.userId,
    403,
    'Only the initiator can withdraw a reschedule request'
  );

  const now = new Date();
  const userRole = rescheduleRequest.initiatedBy;
  if (booking.mentorId === context.userId) {
    await assertMentorScheduleFeatureAccess(context.userId);
  }

  await db
    .update(rescheduleRequests)
    .set({
      status: 'cancelled',
      resolvedBy: userRole,
      resolverId: context.userId,
      resolvedAt: now,
      resolutionNote: 'Withdrawn by initiator',
      updatedAt: now,
    })
    .where(eq(rescheduleRequests.id, rescheduleRequest.id));

  await db
    .update(sessions)
    .set({
      pendingRescheduleRequestId: null,
      pendingRescheduleTime: null,
      pendingRescheduleBy: null,
      updatedAt: now,
    })
    .where(eq(sessions.id, parsed.bookingId));

  await db.insert(sessionAuditLog).values({
    sessionId: booking.id,
    userId: context.userId,
    action: 'reschedule_withdrawn',
    previousScheduledAt: rescheduleRequest.proposedTime,
    newScheduledAt: null,
    policySnapshot: {
      withdrawnBy: userRole,
      originalTime: booking.scheduledAt,
      proposedTime: rescheduleRequest.proposedTime,
      requestId: rescheduleRequest.id,
    },
  });

  const otherPartyId = userRole === 'mentor' ? booking.menteeId : booking.mentorId;
  const initiatorLabel = userRole === 'mentor' ? 'Your mentor' : 'Your mentee';
  const originalTimeStr = format(
    new Date(booking.scheduledAt),
    "EEEE, MMMM d 'at' h:mm a"
  );

  await createNotificationRecord({
    userId: otherPartyId,
    type: 'RESCHEDULE_WITHDRAWN',
    title: 'Reschedule Request Withdrawn',
    message: `${initiatorLabel} has withdrawn their reschedule request for "${booking.title}". The session remains scheduled for ${originalTimeStr}.`,
    relatedId: booking.id,
    relatedType: 'session',
    actionUrl: '/dashboard?section=sessions',
    actionText: 'View Session',
  });

  return {
    message:
      'Reschedule request withdrawn successfully. The session remains at its original time.',
    originalScheduledAt: booking.scheduledAt,
  };
}

export async function createRescheduleRequest(
  context: AuthenticatedContext,
  input: CreateRescheduleRequestInput
) {
  const parsed = createRescheduleRequestInputSchema.parse(input);
  const [booking] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, parsed.bookingId))
    .limit(1);

  assertBooking(booking, 404, 'Booking not found');

  const isMentor = booking.mentorId === context.userId;
  const isMentee = booking.menteeId === context.userId;
  if (isMentor) {
    await assertMentorScheduleFeatureAccess(context.userId);
  }
  assertBooking(
    isMentor || isMentee,
    403,
    'You are not authorized to reschedule this session.'
  );
  assertBooking(
    !['cancelled', 'completed', 'no_show', 'in_progress'].includes(
      booking.status
    ),
    400,
    `Cannot reschedule a ${booking.status} session`
  );

  const [existingRequest] = await db
    .select()
    .from(rescheduleRequests)
    .where(
      and(
        eq(rescheduleRequests.sessionId, parsed.bookingId),
        eq(rescheduleRequests.status, 'pending')
      )
    )
    .limit(1);

  assertBooking(
    !existingRequest,
    400,
    'There is already a pending reschedule request for this session. Please wait for a response or cancel the existing request.'
  );

  const [
    rescheduleCutoffHours,
    mentorRescheduleCutoffHours,
    maxReschedules,
    mentorMaxReschedules,
    expiryHours,
  ] = await Promise.all([
    getPolicyValue(
      DEFAULT_SESSION_POLICIES.RESCHEDULE_CUTOFF_HOURS.key,
      DEFAULT_SESSION_POLICIES.RESCHEDULE_CUTOFF_HOURS.value
    ),
    getPolicyValue(
      DEFAULT_SESSION_POLICIES.MENTOR_RESCHEDULE_CUTOFF_HOURS.key,
      DEFAULT_SESSION_POLICIES.MENTOR_RESCHEDULE_CUTOFF_HOURS.value
    ),
    getPolicyValue(
      DEFAULT_SESSION_POLICIES.MAX_RESCHEDULES_PER_SESSION.key,
      DEFAULT_SESSION_POLICIES.MAX_RESCHEDULES_PER_SESSION.value
    ),
    getPolicyValue(
      DEFAULT_SESSION_POLICIES.MENTOR_MAX_RESCHEDULES_PER_SESSION.key,
      DEFAULT_SESSION_POLICIES.MENTOR_MAX_RESCHEDULES_PER_SESSION.value
    ),
    getPolicyValue(
      DEFAULT_SESSION_POLICIES.RESCHEDULE_REQUEST_EXPIRY_HOURS.key,
      DEFAULT_SESSION_POLICIES.RESCHEDULE_REQUEST_EXPIRY_HOURS.value
    ),
  ]);

  const cutoffHours = isMentor
    ? parseInt(mentorRescheduleCutoffHours, 10)
    : parseInt(rescheduleCutoffHours, 10);
  const maxAllowed = isMentor
    ? parseInt(mentorMaxReschedules, 10)
    : parseInt(maxReschedules, 10);
  const currentCount = isMentor
    ? (booking.mentorRescheduleCount ?? 0)
    : booking.rescheduleCount;

  assertBooking(
    currentCount < maxAllowed,
    400,
    `This session has already been rescheduled ${maxAllowed} time(s) by the ${isMentor ? 'mentor' : 'mentee'}. No further rescheduling is allowed.`,
    {
      rescheduleCount: currentCount,
      maxReschedules: maxAllowed,
    }
  );

  const oldScheduledTime = new Date(booking.scheduledAt);
  const now = new Date();
  const hoursUntilSession =
    (oldScheduledTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  assertBooking(
    !(hoursUntilSession < cutoffHours && hoursUntilSession > 0),
    400,
    `${isMentor ? 'Mentors' : 'Mentees'} cannot reschedule sessions within ${cutoffHours} hour(s) of the scheduled time`
  );

  const proposedTime = new Date(parsed.scheduledAt);
  const expiresAt = addHours(now, parseInt(expiryHours, 10));
  const initiatedBy = isMentor ? 'mentor' : 'mentee';

  const [rescheduleRequest] = await db
    .insert(rescheduleRequests)
    .values({
      sessionId: parsed.bookingId,
      initiatedBy,
      initiatorId: context.userId,
      status: 'pending',
      proposedTime,
      proposedDuration: parsed.duration || booking.duration,
      originalTime: oldScheduledTime,
      expiresAt,
    })
    .returning();

  await db
    .update(sessions)
    .set({
      pendingRescheduleRequestId: rescheduleRequest.id,
      pendingRescheduleTime: proposedTime,
      pendingRescheduleBy: initiatedBy,
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, parsed.bookingId));

  const newDateStr = format(proposedTime, "EEEE, MMMM d 'at' h:mm a");
  const expiryDateStr = format(expiresAt, "EEEE, MMMM d 'at' h:mm a");
  const recipientId = isMentor ? booking.menteeId : booking.mentorId;

  await createNotificationRecord({
    userId: recipientId,
    type: 'RESCHEDULE_REQUEST',
    title: 'Reschedule Request',
    message: `${isMentor ? 'Your mentor' : 'Your mentee'} wants to reschedule "${booking.title}" to ${newDateStr}. Please respond by ${expiryDateStr}.`,
    relatedId: booking.id,
    relatedType: 'session',
    actionUrl: `/dashboard?section=${isMentor ? 'sessions' : 'schedule'}&action=reschedule-response&sessionId=${booking.id}`,
    actionText: 'Respond Now',
  });

  const [recipientData] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, recipientId))
    .limit(1);

  if (recipientData?.email) {
    const [initiatorData] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, context.userId))
      .limit(1);

    await sendRescheduleRequestEmail(
      recipientData.email,
      recipientData.name || 'User',
      initiatorData?.name ||
        context.session.user.name ||
        (isMentor ? 'Your Mentor' : 'Your Mentee'),
      initiatedBy,
      {
        sessionId: booking.id,
        sessionTitle: booking.title,
        scheduledAt: booking.scheduledAt,
        duration: booking.duration,
        meetingType: booking.meetingType as 'video' | 'audio' | 'chat',
      },
      proposedTime
    );
  }

  return {
    requestId: rescheduleRequest.id,
    status: 'pending',
    proposedTime: proposedTime.toISOString(),
    expiresAt: expiresAt.toISOString(),
    message: `Reschedule request sent. Waiting for ${isMentor ? 'mentee' : 'mentor'} approval.`,
  };
}

export async function respondToRescheduleRequest(
  context: AuthenticatedContext,
  input: RespondRescheduleInput
) {
  const parsed = respondRescheduleInputSchema.parse(input);

  const [rescheduleRequest] = await db
    .select()
    .from(rescheduleRequests)
    .where(
      and(
        eq(rescheduleRequests.id, parsed.requestId),
        eq(rescheduleRequests.sessionId, parsed.bookingId),
        or(
          eq(rescheduleRequests.status, 'pending'),
          eq(rescheduleRequests.status, 'counter_proposed')
        )
      )
    )
    .limit(1);

  assertBooking(
    rescheduleRequest,
    404,
    'Reschedule request not found or already resolved'
  );

  if (rescheduleRequest.expiresAt && new Date() > rescheduleRequest.expiresAt) {
    await db
      .update(rescheduleRequests)
      .set({ status: 'expired', resolvedAt: new Date() })
      .where(eq(rescheduleRequests.id, parsed.requestId));

    throw new BookingServiceError(400, 'This reschedule request has expired');
  }

  const [booking] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, parsed.bookingId))
    .limit(1);

  assertBooking(booking, 404, 'Session not found');

  const isMentor = booking.mentorId === context.userId;
  const isMentee = booking.menteeId === context.userId;
  if (isMentor) {
    await assertMentorScheduleFeatureAccess(context.userId);
  }
  const userRole = isMentor ? 'mentor' : 'mentee';
  const lastActionBy =
    rescheduleRequest.status === 'counter_proposed'
      ? rescheduleRequest.counterProposedBy
      : rescheduleRequest.initiatedBy;

  assertBooking(
    isMentor || isMentee,
    403,
    'You are not authorized to respond to this request'
  );
  assertBooking(
    lastActionBy !== userRole,
    403,
    'You cannot respond to your own request/proposal'
  );

  const now = new Date();

  if (parsed.action === 'accept') {
    const acceptedTime =
      rescheduleRequest.status === 'counter_proposed'
        ? rescheduleRequest.counterProposedTime
        : rescheduleRequest.proposedTime;

    assertBooking(acceptedTime, 400, 'No valid time found to accept');

    const updateData: Record<string, unknown> = {
      scheduledAt: acceptedTime,
      duration: rescheduleRequest.proposedDuration || booking.duration,
      pendingRescheduleRequestId: null,
      pendingRescheduleTime: null,
      pendingRescheduleBy: null,
      updatedAt: now,
    };

    if (rescheduleRequest.initiatedBy === 'mentor') {
      updateData.mentorRescheduleCount =
        (booking.mentorRescheduleCount ?? 0) + 1;
    } else {
      updateData.rescheduleCount = booking.rescheduleCount + 1;
    }

    await db.update(sessions).set(updateData).where(eq(sessions.id, parsed.bookingId));
    await db
      .update(rescheduleRequests)
      .set({
        status: 'accepted',
        resolvedBy: userRole,
        resolverId: context.userId,
        resolvedAt: now,
        updatedAt: now,
      })
      .where(eq(rescheduleRequests.id, parsed.requestId));

    const otherPartyId = isMentor ? booking.menteeId : booking.mentorId;
    const newDateStr = format(acceptedTime, "EEEE, MMMM d 'at' h:mm a");

    await createNotificationRecord({
      userId: otherPartyId,
      type: 'RESCHEDULE_ACCEPTED',
      title: 'Reschedule Accepted',
      message: `Your reschedule proposal for "${booking.title}" has been accepted. New time: ${newDateStr}`,
      relatedId: booking.id,
      relatedType: 'session',
      actionUrl: `/dashboard?section=${isMentor ? 'schedule' : 'sessions'}`,
      actionText: 'View Session',
    });

    await db.insert(sessionAuditLog).values({
      sessionId: booking.id,
      userId: context.userId,
      action: 'reschedule_accepted',
      previousScheduledAt: booking.scheduledAt,
      newScheduledAt: acceptedTime,
      policySnapshot: {
        initiatedBy: rescheduleRequest.initiatedBy,
        acceptedBy: userRole,
        status: rescheduleRequest.status,
      },
    });

    const [mentorData] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, booking.mentorId))
      .limit(1);
    const [menteeData] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, booking.menteeId))
      .limit(1);

    const bookingData = {
      sessionId: booking.id,
      sessionTitle: booking.title,
      scheduledAt: acceptedTime,
      duration: rescheduleRequest.proposedDuration || booking.duration,
      meetingType: booking.meetingType as 'video' | 'audio' | 'chat',
    };
    const oldTime = booking.scheduledAt;

    if (mentorData?.email) {
      await sendRescheduleConfirmedEmail(
        mentorData.email,
        mentorData.name || 'Mentor',
        'mentor',
        menteeData?.name || 'Your Mentee',
        bookingData,
        oldTime,
        acceptedTime
      );
    }

    if (menteeData?.email) {
      await sendRescheduleConfirmedEmail(
        menteeData.email,
        menteeData.name || 'Mentee',
        'mentee',
        mentorData?.name || 'Your Mentor',
        bookingData,
        oldTime,
        acceptedTime
      );
    }

    return {
      action: 'accepted',
      newScheduledAt: acceptedTime,
      message: 'Reschedule request accepted. Session has been updated.',
    };
  }

  if (parsed.action === 'reject') {
    await db
      .update(sessions)
      .set({
        pendingRescheduleRequestId: null,
        pendingRescheduleTime: null,
        pendingRescheduleBy: null,
        updatedAt: now,
      })
      .where(eq(sessions.id, parsed.bookingId));
    await db
      .update(rescheduleRequests)
      .set({
        status: 'rejected',
        resolvedBy: userRole,
        resolverId: context.userId,
        resolvedAt: now,
        updatedAt: now,
      })
      .where(eq(rescheduleRequests.id, parsed.requestId));

    const initiatorId =
      rescheduleRequest.initiatedBy === 'mentor'
        ? booking.mentorId
        : booking.menteeId;

    await createNotificationRecord({
      userId: initiatorId,
      type: 'RESCHEDULE_REJECTED',
      title: 'Reschedule Request Declined',
      message: `Your reschedule request for "${booking.title}" was not accepted. The original time remains.`,
      relatedId: booking.id,
      relatedType: 'session',
      actionUrl: `/dashboard?section=${isMentor ? 'schedule' : 'sessions'}`,
      actionText: 'View Session',
    });

    return {
      action: 'rejected',
      message: 'Reschedule request declined. Original time remains.',
    };
  }

  if (parsed.action === 'counter_propose') {
    assertBooking(
      parsed.counterProposedTime,
      400,
      'Counter proposed time is required'
    );
    const counterTime = new Date(parsed.counterProposedTime);
    const maxCounterProposals = parseInt(
      await getPolicyValue(
        DEFAULT_SESSION_POLICIES.MAX_COUNTER_PROPOSALS.key,
        DEFAULT_SESSION_POLICIES.MAX_COUNTER_PROPOSALS.value
      ),
      10
    );

    assertBooking(
      rescheduleRequest.counterProposalCount < maxCounterProposals,
      400,
      `Maximum of ${maxCounterProposals} counter-proposals reached. Please accept, reject, or cancel.`
    );

    const expiresAt = addHours(
      now,
      parseInt(
        await getPolicyValue(
          DEFAULT_SESSION_POLICIES.RESCHEDULE_REQUEST_EXPIRY_HOURS.key,
          DEFAULT_SESSION_POLICIES.RESCHEDULE_REQUEST_EXPIRY_HOURS.value
        ),
        10
      )
    );

    await db
      .update(rescheduleRequests)
      .set({
        status: 'counter_proposed',
        counterProposedTime: counterTime,
        counterProposedBy: userRole,
        counterProposalCount: rescheduleRequest.counterProposalCount + 1,
        expiresAt,
        updatedAt: now,
      })
      .where(eq(rescheduleRequests.id, parsed.requestId));

    await db
      .update(sessions)
      .set({
        pendingRescheduleTime: counterTime,
        pendingRescheduleBy: userRole,
        updatedAt: now,
      })
      .where(eq(sessions.id, parsed.bookingId));

    const recipientId = isMentor ? booking.menteeId : booking.mentorId;
    await createNotificationRecord({
      userId: recipientId,
      type: 'RESCHEDULE_COUNTER',
      title: 'Counter-Proposal Received',
      message: `A new time has been proposed for "${booking.title}": ${format(counterTime, "EEEE, MMMM d 'at' h:mm a")}.`,
      relatedId: booking.id,
      relatedType: 'session',
      actionUrl: `/dashboard?section=${isMentor ? 'schedule' : 'sessions'}`,
      actionText: 'Review Proposal',
    });

    return {
      action: 'counter_proposed',
      counterProposedTime: counterTime.toISOString(),
      message: 'Counter-proposal sent successfully.',
    };
  }

  assertBooking(
    parsed.action === 'cancel_session',
    400,
    'Invalid reschedule action'
  );
  assertBooking(
    isMentee,
    403,
    'Only the mentee can cancel a session from the reschedule flow'
  );

  await db
    .update(sessions)
    .set({
      status: 'cancelled',
      cancelledBy: 'mentee',
      cancellationReason:
        parsed.cancellationReason || 'Cancelled during reschedule flow',
      refundPercentage: 100,
      refundAmount: booking.rate ?? '0',
      refundStatus: booking.rate ? 'pending' : 'none',
      pendingRescheduleRequestId: null,
      pendingRescheduleTime: null,
      pendingRescheduleBy: null,
      updatedAt: now,
    })
    .where(eq(sessions.id, parsed.bookingId));
  await db
    .update(rescheduleRequests)
    .set({
      status: 'cancelled',
      resolvedBy: 'mentee',
      resolverId: context.userId,
      resolvedAt: now,
      cancellationReason: parsed.cancellationReason,
      updatedAt: now,
    })
    .where(eq(rescheduleRequests.id, parsed.requestId));

  await createNotificationRecord({
    userId: booking.mentorId,
    type: 'BOOKING_CANCELLED',
    title: 'Session Cancelled',
    message: `The mentee has cancelled "${booking.title}" during the reschedule process.`,
    relatedId: booking.id,
    relatedType: 'session',
    actionUrl: '/dashboard?section=schedule',
    actionText: 'View Session',
  });

  return {
    action: 'cancelled',
    message: 'Session cancelled successfully.',
  };
}

export async function cancelBooking(
  context: AuthenticatedContext,
  input: CancelBookingInput
) {
  const parsed = cancelBookingInputSchema.parse(input);
  const [booking] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, parsed.bookingId))
    .limit(1);

  assertBooking(booking, 404, 'Booking not found');

  const isMentor = booking.mentorId === context.userId;
  const isMentee = booking.menteeId === context.userId;
  if (isMentor) {
    await assertMentorScheduleFeatureAccess(context.userId);
  }

  assertBooking(
    isMentor || isMentee,
    403,
    'You are not authorized to cancel this session.'
  );
  assertBooking(booking.status !== 'cancelled', 400, 'Booking is already cancelled');
  assertBooking(booking.status !== 'completed', 400, 'Cannot cancel a completed session');
  assertBooking(booking.status !== 'in_progress', 400, 'Cannot cancel a session that is in progress');

  const [
    menteeCancellationCutoffHours,
    mentorCancellationCutoffHours,
    freeCancellationHours,
    partialRefundPercentage,
    lateCancellationRefundPercentage,
  ] = await Promise.all([
    getPolicyValue(
      DEFAULT_SESSION_POLICIES.CANCELLATION_CUTOFF_HOURS.key,
      DEFAULT_SESSION_POLICIES.CANCELLATION_CUTOFF_HOURS.value
    ),
    getPolicyValue(
      DEFAULT_SESSION_POLICIES.MENTOR_CANCELLATION_CUTOFF_HOURS.key,
      DEFAULT_SESSION_POLICIES.MENTOR_CANCELLATION_CUTOFF_HOURS.value
    ),
    getPolicyValue(
      DEFAULT_SESSION_POLICIES.FREE_CANCELLATION_HOURS.key,
      DEFAULT_SESSION_POLICIES.FREE_CANCELLATION_HOURS.value
    ),
    getPolicyValue(
      DEFAULT_SESSION_POLICIES.PARTIAL_REFUND_PERCENTAGE.key,
      DEFAULT_SESSION_POLICIES.PARTIAL_REFUND_PERCENTAGE.value
    ),
    getPolicyValue(
      DEFAULT_SESSION_POLICIES.LATE_CANCELLATION_REFUND_PERCENTAGE.key,
      DEFAULT_SESSION_POLICIES.LATE_CANCELLATION_REFUND_PERCENTAGE.value
    ),
  ]);

  const cancellationCutoffHours = isMentor
    ? parseInt(mentorCancellationCutoffHours, 10)
    : parseInt(menteeCancellationCutoffHours, 10);
  const scheduledTime = new Date(booking.scheduledAt);
  const now = new Date();
  const hoursUntilSession =
    (scheduledTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  assertBooking(
    isMentor || !(hoursUntilSession < cancellationCutoffHours && hoursUntilSession > 0),
    400,
    `Mentees cannot cancel sessions within ${cancellationCutoffHours} hour(s) of the scheduled time`
  );

  if (isMentor) {
    const newMentorId = await findAvailableReplacementMentor(
      booking.scheduledAt,
      booking.duration,
      context.userId
    );

    if (newMentorId) {
      const [newMentorUser] = await db
        .select({ name: users.name })
        .from(mentors)
        .innerJoin(users, eq(mentors.userId, users.id))
        .where(eq(mentors.userId, newMentorId))
        .limit(1);

      const newMentorName = newMentorUser?.name || 'Another Mentor';
      const existingCancelledMentors = (booking.cancelledMentorIds as string[]) || [];
      const updatedCancelledMentors = [...existingCancelledMentors, booking.mentorId];

      const [updatedBooking] = await db
        .update(sessions)
        .set({
          mentorId: newMentorId,
          mentorNotes: `Auto-reassigned from original mentor (${context.session.user.name || 'Unknown'}) who cancelled due to: ${parsed.reasonCategory}`,
          wasReassigned: true,
          reassignedFromMentorId: booking.mentorId,
          reassignedAt: new Date(),
          reassignmentStatus: 'pending_acceptance',
          cancelledMentorIds: updatedCancelledMentors,
          updatedAt: new Date(),
        })
        .where(eq(sessions.id, parsed.bookingId))
        .returning();

      await createNotificationRecord({
        userId: booking.menteeId,
        type: 'SESSION_REASSIGNED',
        title: 'Mentor Changed - Your Session Has Been Reassigned',
        message: `Your original mentor for "${booking.title}" had to cancel. You've been reassigned to ${newMentorName}. You can continue with the new mentor or cancel for a full refund.`,
        relatedId: booking.id,
        relatedType: 'session',
        actionUrl: '/dashboard?section=sessions',
        actionText: 'View Options',
      });
      await createNotificationRecord({
        userId: booking.mentorId,
        type: 'BOOKING_CANCELLED',
        title: 'Session Cancelled & Reassigned',
        message: `You cancelled "${booking.title}". The session was successfully reassigned to another mentor.`,
        relatedId: booking.id,
        relatedType: 'session',
        actionUrl: '/dashboard?section=schedule',
        actionText: 'View Schedule',
      });
      await createNotificationRecord({
        userId: newMentorId,
        type: 'BOOKING_REQUEST',
        title: 'New Session Assigned (Reassignment)',
        message: `You have been assigned an urgent session "${booking.title}" (Reassigned from another mentor).`,
        relatedId: booking.id,
        relatedType: 'session',
        actionUrl: '/dashboard?section=schedule',
        actionText: 'View Session',
      });

      const [menteeData] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, booking.menteeId))
        .limit(1);
      const [originalMentorData] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, booking.mentorId))
        .limit(1);

      if (menteeData?.email) {
        await sendMentorCancelledReassignedEmail(
          menteeData.email,
          menteeData.name || 'Mentee',
          originalMentorData?.name || 'Your Mentor',
          newMentorName,
          {
            sessionId: booking.id,
            sessionTitle: booking.title,
            scheduledAt: booking.scheduledAt,
            duration: booking.duration,
            meetingType: booking.meetingType as 'video' | 'audio' | 'chat',
          }
        );
      }

      if (originalMentorData?.email) {
        await sendMentorCancellationConfirmationEmail(
          originalMentorData.email,
          originalMentorData.name || 'Mentor',
          menteeData?.name || 'The Mentee',
          {
            sessionId: booking.id,
            sessionTitle: booking.title,
            scheduledAt: booking.scheduledAt,
            duration: booking.duration,
            meetingType: booking.meetingType as 'video' | 'audio' | 'chat',
          },
          true,
          newMentorName
        );
      }

      const [newMentorEmailData] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, newMentorId))
        .limit(1);

      if (newMentorEmailData?.email) {
        await sendNewMentorAssignedEmail(
          newMentorEmailData.email,
          newMentorName,
          menteeData?.name || 'A Mentee',
          {
            sessionId: booking.id,
            sessionTitle: booking.title,
            scheduledAt: booking.scheduledAt,
            duration: booking.duration,
            meetingType: booking.meetingType as 'video' | 'audio' | 'chat',
          },
          true
        );
      }

      await db.insert(sessionAuditLog).values({
        sessionId: booking.id,
        userId: context.userId,
        action: 'reassignment',
        reasonCategory: parsed.reasonCategory,
        reasonDetails: parsed.reasonDetails,
        policySnapshot: {
          originalMentor: booking.mentorId,
          newMentor: newMentorId,
          reason: 'Auto-reassignment after mentor cancellation',
        },
        ipAddress: getRequestIp(context),
        userAgent: getRequestUserAgent(context),
      });

      return {
        reassigned: true,
        newMentorName,
        booking: updatedBooking,
        message: `Session reassigned to ${newMentorName}.`,
      };
    }

    const existingCancelledMentors = (booking.cancelledMentorIds as string[]) || [];
    const updatedCancelledMentors = [...existingCancelledMentors, booking.mentorId];
    const [updatedBooking] = await db
      .update(sessions)
      .set({
        mentorId: booking.mentorId,
        mentorNotes: `Original mentor (${context.session.user.name || 'Unknown'}) cancelled: ${parsed.reasonCategory}. Awaiting mentee to select new mentor.`,
        wasReassigned: false,
        reassignedFromMentorId: booking.mentorId,
        reassignmentStatus: 'awaiting_mentee_choice',
        cancelledMentorIds: updatedCancelledMentors,
        cancelledBy: 'mentor',
        cancellationReason: parsed.reasonDetails || parsed.reasonCategory,
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, parsed.bookingId))
      .returning();

    await createNotificationRecord({
      userId: booking.menteeId,
      type: 'BOOKING_CANCELLED',
      title: 'Your Mentor Cancelled - Action Required',
      message: `Your mentor for "${booking.title}" has cancelled. No immediate replacement was found. Please browse other mentors or cancel for a full refund.`,
      relatedId: booking.id,
      relatedType: 'session',
      actionUrl: `/sessions/${booking.id}/select-mentor`,
      actionText: 'Browse Mentors',
    });
    await createNotificationRecord({
      userId: booking.mentorId,
      type: 'BOOKING_CANCELLED',
      title: 'Session Cancellation Confirmed',
      message: `You cancelled "${booking.title}". The mentee has been notified to find a new mentor.`,
      relatedId: booking.id,
      relatedType: 'session',
      actionUrl: '/dashboard?section=schedule',
      actionText: 'View Schedule',
    });

    const [menteeDataNoMentor] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, booking.menteeId))
      .limit(1);
    const [originalMentorDataNoMentor] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, booking.mentorId))
      .limit(1);

    if (menteeDataNoMentor?.email) {
      await sendMentorCancelledNoMentorEmail(
        menteeDataNoMentor.email,
        menteeDataNoMentor.name || 'Mentee',
        originalMentorDataNoMentor?.name || 'Your Mentor',
        {
          sessionId: booking.id,
          sessionTitle: booking.title,
          scheduledAt: booking.scheduledAt,
          duration: booking.duration,
          meetingType: booking.meetingType as 'video' | 'audio' | 'chat',
        }
      );

      if (originalMentorDataNoMentor?.email) {
        await sendMentorCancellationConfirmationEmail(
          originalMentorDataNoMentor.email,
          originalMentorDataNoMentor.name || 'Mentor',
          menteeDataNoMentor.name || 'The Mentee',
          {
            sessionId: booking.id,
            sessionTitle: booking.title,
            scheduledAt: booking.scheduledAt,
            duration: booking.duration,
            meetingType: booking.meetingType as 'video' | 'audio' | 'chat',
          },
          false
        );
      }
    }

    await db.insert(sessionAuditLog).values({
      sessionId: booking.id,
      userId: context.userId,
      action: 'mentor_cancelled_no_replacement',
      reasonCategory: parsed.reasonCategory,
      reasonDetails: parsed.reasonDetails,
      policySnapshot: {
        originalMentor: booking.mentorId,
        newStatus: 'awaiting_mentee_choice',
        reason: 'Mentor cancelled, no auto-replacement available',
      },
      ipAddress: getRequestIp(context),
      userAgent: getRequestUserAgent(context),
    });

    return {
      reassigned: false,
      awaitingMenteeChoice: true,
      booking: updatedBooking,
      message:
        'No replacement mentor available. The mentee has been notified to select a new mentor.',
    };
  }

  const refundPercentage = calculateRefundPercentage(isMentor, hoursUntilSession, {
    freeCancellationHours: parseInt(freeCancellationHours, 10),
    cancellationCutoffHours,
    partialRefundPercentage: parseInt(partialRefundPercentage, 10),
    lateCancellationRefundPercentage: parseInt(
      lateCancellationRefundPercentage,
      10
    ),
  });
  const sessionRate = booking.rate ? parseFloat(booking.rate) : 0;
  const refundAmount = (sessionRate * refundPercentage) / 100;
  const cancelledBy = isMentor ? 'mentor' : 'mentee';

  const [cancelledBooking] = await db
    .update(sessions)
    .set({
      status: 'cancelled',
      cancelledBy,
      cancellationReason: parsed.reasonDetails
        ? `${parsed.reasonCategory}: ${parsed.reasonDetails}`
        : parsed.reasonCategory,
      refundPercentage,
      refundAmount: refundAmount.toFixed(2),
      refundStatus: refundAmount > 0 ? 'pending' : 'none',
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, parsed.bookingId))
    .returning();

  await db.insert(sessionAuditLog).values({
    sessionId: booking.id,
    userId: context.userId,
    action: 'cancel',
    reasonCategory: parsed.reasonCategory,
    reasonDetails: parsed.reasonDetails,
    policySnapshot: {
      cancellationCutoffHours,
      freeCancellationHours: parseInt(freeCancellationHours, 10),
      partialRefundPercentage: parseInt(partialRefundPercentage, 10),
      lateCancellationRefundPercentage: parseInt(
        lateCancellationRefundPercentage,
        10
      ),
      hoursUntilSession: Math.round(hoursUntilSession * 100) / 100,
      cancelledBy,
      refundPercentage,
      refundAmount,
    },
    ipAddress: getRequestIp(context),
    userAgent: getRequestUserAgent(context),
  });

  if (!isMentor && booking.bookingSource !== 'explore') {
    try {
      const sessionType =
        booking.sessionType === 'FREE' || booking.sessionType === 'COUNSELING'
          ? booking.sessionType
          : 'PAID';
      const menteeSessionAction = resolveMenteeBookingAction(sessionType);

      await consumeFeature({
        action: menteeSessionAction,
        userId: booking.menteeId,
        delta: { count: -1, minutes: -(booking.duration || 0) },
        resourceType: 'session',
        resourceId: booking.id,
      });

      await consumeFeature({
        action: 'booking.mentor.session',
        userId: booking.mentorId,
        delta: { count: -1, minutes: -(booking.duration || 0) },
        resourceType: 'session',
        resourceId: booking.id,
      });
    } catch (error) {
      console.error('Usage rollback failed:', error);
    }
  }

  if (isMentor) {
    await createNotificationRecord({
      userId: booking.menteeId,
      type: 'BOOKING_CANCELLED',
      title: 'Session Cancelled by Mentor',
      message: `Your session "${booking.title}" has been cancelled by the mentor. Reason: ${parsed.reasonCategory}${refundAmount > 0 ? ` A refund of ${refundPercentage}% ($${refundAmount.toFixed(2)}) will be processed.` : ''}`,
      relatedId: booking.id,
      relatedType: 'session',
      actionUrl: '/dashboard?section=sessions',
      actionText: 'View Sessions',
    });
    await createNotificationRecord({
      userId: booking.mentorId,
      type: 'BOOKING_CANCELLED',
      title: 'Session Cancellation Confirmed',
      message: `You have cancelled the session "${booking.title}". The mentee will receive a full refund.`,
      relatedId: booking.id,
      relatedType: 'session',
      actionUrl: '/dashboard?section=schedule',
      actionText: 'View Schedule',
    });
  } else {
    await createNotificationRecord({
      userId: booking.mentorId,
      type: 'BOOKING_CANCELLED',
      title: 'Session Cancelled by Mentee',
      message: `Your session "${booking.title}" has been cancelled. Reason: ${parsed.reasonCategory}`,
      relatedId: booking.id,
      relatedType: 'session',
      actionUrl: '/dashboard?section=schedule',
      actionText: 'View Schedule',
    });
    await createNotificationRecord({
      userId: booking.menteeId,
      type: 'BOOKING_CANCELLED',
      title: 'Session Cancellation Confirmed',
      message: `Your session "${booking.title}" has been cancelled.${refundAmount > 0 ? ` A refund of ${refundPercentage}% ($${refundAmount.toFixed(2)}) will be processed.` : ''}`,
      relatedId: booking.id,
      relatedType: 'session',
      actionUrl: '/dashboard?section=sessions',
      actionText: 'View Sessions',
    });

    const [mentorDataForEmail] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, booking.mentorId))
      .limit(1);
    const [menteeDataForEmail] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, booking.menteeId))
      .limit(1);

    if (mentorDataForEmail?.email) {
      await sendMenteeCancelledEmail(
        mentorDataForEmail.email,
        mentorDataForEmail.name || 'Mentor',
        menteeDataForEmail?.name || 'The Mentee',
        {
          sessionId: booking.id,
          sessionTitle: booking.title,
          scheduledAt: booking.scheduledAt,
          duration: booking.duration,
          meetingType: booking.meetingType as 'video' | 'audio' | 'chat',
        },
        parsed.reasonDetails
          ? `${parsed.reasonCategory}: ${parsed.reasonDetails}`
          : parsed.reasonCategory
      );
    }

    if (menteeDataForEmail?.email) {
      await sendMenteeCancellationConfirmationEmail(
        menteeDataForEmail.email,
        menteeDataForEmail.name || 'Mentee',
        mentorDataForEmail?.name || 'Your Mentor',
        {
          sessionId: booking.id,
          sessionTitle: booking.title,
          scheduledAt: booking.scheduledAt,
          duration: booking.duration,
          meetingType: booking.meetingType as 'video' | 'audio' | 'chat',
        },
        refundPercentage,
        refundAmount
      );
    }
  }

  return {
    booking: cancelledBooking,
    cancelledBy,
    refundPercentage,
    refundAmount,
    message: 'Session cancelled successfully',
  };
}
