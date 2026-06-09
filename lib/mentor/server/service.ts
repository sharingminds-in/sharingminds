import { randomUUID } from 'crypto';

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  mentors,
  mentorsFormAuditTrail,
  mentorPricingAudit,
  mentorsProfileAudit,
  roles,
  userRoles,
  users,
  type Mentor,
  type NotificationType,
} from '@/lib/db/schema';
import { getUserWithRoles } from '@/lib/db/user-helpers';
import { buildDashboardSectionUrl } from '@/lib/dashboard/sections';
import { sendApplicationReceivedEmail } from '@/lib/email';
import { createNotificationRecord } from '@/lib/notifications/server/service';
import { validateMentorCouponRedemption } from '@/lib/mentor/coupon-rules';
import { buildMentorProfileUpdate } from '@/lib/mentor/profile-patch';
import {
  buildPricingAuditSnapshot,
  hasMentorPricingChanged,
  normalizePricingAuditAmount,
} from '@/lib/mentor/pricing-audit';
import { resolveMentorVerificationTransition } from '@/lib/mentor/verification-state-machine';
import { normalizeStorageValue, resolveStorageUrl } from '@/lib/storage';

import { assertMentorLifecycle, MentorLifecycleServiceError } from './errors';
import {
  mentorApplicationUpsertInputSchema,
  mentorCouponInputSchema,
  mentorProfileUpdateInputSchema,
  type MentorApplicationUpsertInput,
  type MentorCouponInput,
  type MentorProfileUpdateInput,
} from './schemas';

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getUserWithRoles>>>;

async function getMentorLifecycleUser(
  userId: string,
  currentUser?: CurrentUser
): Promise<CurrentUser> {
  const resolvedUser = currentUser ?? (await getUserWithRoles(userId));
  assertMentorLifecycle(resolvedUser, 401, 'Authentication required');
  return resolvedUser;
}

function isAdmin(user: CurrentUser) {
  return user.roles.some(
    (role: { name: string }) => role.name === 'admin'
  );
}

function assertSameUserOrAdmin(user: CurrentUser, targetUserId: string) {
  if (user.id !== targetUserId && !isAdmin(user)) {
    throw new MentorLifecycleServiceError(403, 'Access denied');
  }
}

async function getMentorByUserId(userId: string) {
  const [mentor] = await db
    .select()
    .from(mentors)
    .where(eq(mentors.userId, userId))
    .limit(1);

  return mentor ?? null;
}

function serializeMentorRecord(record: Mentor) {
  return {
    ...record,
    createdAt:
      record.createdAt instanceof Date
        ? record.createdAt.toISOString()
        : record.createdAt,
    updatedAt:
      record.updatedAt instanceof Date
        ? record.updatedAt.toISOString()
        : record.updatedAt,
  };
}

async function resolveMentorAssets<T extends { profileImageUrl?: string | null; bannerImageUrl?: string | null; resumeUrl?: string | null }>(
  mentor: T
) {
  return {
    ...mentor,
    profileImageUrl: await resolveStorageUrl(mentor.profileImageUrl),
    bannerImageUrl: await resolveStorageUrl(mentor.bannerImageUrl),
    resumeUrl: await resolveStorageUrl(mentor.resumeUrl),
  };
}

async function getAdminUserId() {
  const [adminUser] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(users.id, userRoles.userId))
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(roles.name, 'admin'))
    .limit(1);

  return adminUser?.id ?? null;
}

async function assignMentorRole(userId: string) {
  const [mentorRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, 'mentor'))
    .limit(1);

  if (!mentorRole) {
    return;
  }

  await db
    .insert(userRoles)
    .values({
      userId,
      roleId: mentorRole.id,
      assignedBy: userId,
    })
    .onConflictDoNothing();
}

async function sendNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  actionUrl?: string
) {
  await createNotificationRecord({
    userId,
    type,
    title,
    message,
    actionUrl,
  });
}

export async function getMentorApplication(
  userId: string,
  currentUser?: CurrentUser
) {
  const resolvedUser = await getMentorLifecycleUser(userId, currentUser);
  assertSameUserOrAdmin(resolvedUser, userId);

  const mentor = await getMentorByUserId(userId);

  if (!mentor) {
    return null;
  }

  return resolveMentorAssets(mentor);
}

export async function updateMentorProfile(
  userId: string,
  input: MentorProfileUpdateInput,
  currentUser?: CurrentUser
) {
  const resolvedUser = await getMentorLifecycleUser(userId, currentUser);
  assertSameUserOrAdmin(resolvedUser, userId);

  const parsed = mentorProfileUpdateInputSchema.parse(input);
  const { previousMentor, updatedMentor } = await db.transaction(async (tx) => {
    const [mentor] = await tx
      .select()
      .from(mentors)
      .where(eq(mentors.userId, userId))
      .limit(1);

    assertMentorLifecycle(mentor, 404, 'Mentor profile not found');

    const mentorUpdateData = buildMentorProfileUpdate(mentor, parsed);
    const [updated] = await tx
      .update(mentors)
      .set(mentorUpdateData)
      .where(eq(mentors.userId, userId))
      .returning();

    if (hasMentorPricingChanged(mentor, updated)) {
      await tx.insert(mentorPricingAudit).values({
        mentorId: updated.id,
        actorUserId: resolvedUser.id,
        actorRole: resolvedUser.id === userId ? 'mentor' : 'admin',
        action:
          normalizePricingAuditAmount(mentor.hourlyRate) === null
            ? 'MENTOR_RATE_SET'
            : 'MENTOR_RATE_UPDATED',
        ...buildPricingAuditSnapshot(mentor, updated),
      });
    }

    return {
      previousMentor: mentor,
      updatedMentor: updated,
    };
  });

  const previousProfileSnapshot = serializeMentorRecord(previousMentor);

  try {
    await db.insert(mentorsProfileAudit).values({
      mentorId: updatedMentor.id,
      userId,
      previousData: previousProfileSnapshot,
      updatedData: serializeMentorRecord(updatedMentor),
      changedAt: new Date(),
    });
  } catch (error) {
    console.error('Failed to record mentor profile audit:', error);
  }

  return resolveMentorAssets(updatedMentor);
}

export async function validateMentorCoupon(
  userId: string,
  input: MentorCouponInput,
  currentUser?: CurrentUser
) {
  const resolvedUser = await getMentorLifecycleUser(userId, currentUser);
  assertSameUserOrAdmin(resolvedUser, userId);

  const mentor = await getMentorByUserId(userId);
  assertMentorLifecycle(mentor, 404, 'Mentor profile not found');

  const parsed = mentorCouponInputSchema.parse(input);
  const normalizedCode = parsed.couponCode.trim().toUpperCase();
  const validation = validateMentorCouponRedemption(mentor, normalizedCode);

  if (!validation.ok) {
    throw new MentorLifecycleServiceError(400, validation.message);
  }

  await db
    .update(mentors)
    .set({
      paymentStatus: 'COMPLETED',
      updatedAt: new Date(),
    })
    .where(eq(mentors.id, mentor.id));

  return {
    success: true,
    message: validation.message,
  };
}

export async function submitMentorApplication(
  input: MentorApplicationUpsertInput
) {
  const parsed = mentorApplicationUpsertInputSchema.parse(input);
  assertMentorLifecycle(
    parsed.actorUserId === parsed.userId,
    403,
    'You can only submit your own application'
  );

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, parsed.userId))
    .limit(1);

  assertMentorLifecycle(user, 404, 'User not found');

  const existingMentor = await getMentorByUserId(parsed.userId);
  const mentorProfileData = {
    userId: parsed.userId,
    title: parsed.title || null,
    company: parsed.company || null,
    industry: parsed.industry || null,
    expertise: parsed.expertise || null,
    experience: parsed.experience ?? null,
    hourlyRate: parsed.hourlyRate || '50.00',
    currency: parsed.currency || 'USD',
    headline: parsed.headline || null,
    about: parsed.about || null,
    linkedinUrl: parsed.linkedinUrl || null,
    githubUrl: parsed.githubUrl || null,
    websiteUrl: parsed.websiteUrl || null,
    verificationStatus: resolveMentorVerificationTransition(
      existingMentor?.verificationStatus,
      existingMentor ? 'application_resubmitted' : 'application_submitted'
    ),
    isAvailable: parsed.isAvailable !== false,
    fullName: parsed.fullName || null,
    email: parsed.email || null,
    phone: parsed.phone || null,
    city: parsed.city || null,
    country: parsed.country || null,
    state: parsed.state || null,
    availability: parsed.availability || null,
    profileImageUrl:
      normalizeStorageValue(parsed.profileImageUrl) ??
      existingMentor?.profileImageUrl ??
      null,
    resumeUrl:
      normalizeStorageValue(parsed.resumeUrl) ?? existingMentor?.resumeUrl ?? null,
    updatedAt: new Date(),
  };

  const sanitizedAuditProfile = {
    ...mentorProfileData,
    updatedAt: mentorProfileData.updatedAt.toISOString(),
  };

  const recordAuditEntry = async (
    mentorId: string,
    submissionType: 'CREATE' | 'UPDATE'
  ) => {
    try {
      await db.insert(mentorsFormAuditTrail).values({
        mentorId,
        userId: parsed.userId,
        submissionType,
        verificationStatus: mentorProfileData.verificationStatus,
        formData: {
          sanitized: sanitizedAuditProfile,
          raw: parsed.rawFormSnapshot,
        },
      });
    } catch (error) {
      console.error('Failed to record mentor form audit trail:', error);
    }
  };

  if (existingMentor) {
    const updatedMentor = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(mentors)
        .set(mentorProfileData)
        .where(eq(mentors.id, existingMentor.id))
        .returning();

      if (hasMentorPricingChanged(existingMentor, updated)) {
        await tx.insert(mentorPricingAudit).values({
          mentorId: updated.id,
          actorUserId: parsed.userId,
          actorRole: 'mentor',
          action:
            normalizePricingAuditAmount(existingMentor.hourlyRate) === null
              ? 'MENTOR_RATE_SET'
              : 'MENTOR_RATE_UPDATED',
          ...buildPricingAuditSnapshot(existingMentor, updated),
        });
      }

      return updated;
    });

    await recordAuditEntry(existingMentor.id, 'UPDATE');

    const adminId = await getAdminUserId();
    if (adminId) {
      await sendNotification(
        adminId,
        'MENTOR_APPLICATION_UPDATE_REQUESTED',
        'Mentor Application Updated',
        `${parsed.fullName} has updated their mentor application.`,
        buildDashboardSectionUrl('/dashboard', 'mentors')
      );
    }

    return {
      success: true,
      message: 'Mentor application updated successfully',
      data: {
        id: updatedMentor.id,
        userId: parsed.userId,
        status: mentorProfileData.verificationStatus,
      },
    };
  }

  const mentorId = randomUUID();
  const newMentor = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(mentors)
      .values({
        ...mentorProfileData,
        id: mentorId,
        verificationStatus: 'IN_PROGRESS',
      })
      .returning();

    await tx.insert(mentorPricingAudit).values({
      mentorId: created.id,
      actorUserId: parsed.userId,
      actorRole: 'mentor',
      action: 'MENTOR_RATE_SET',
      ...buildPricingAuditSnapshot(
        {
          mentorHourlyRate: null,
          adminHourlyRateOverride: null,
          currency: created.currency,
        },
        created
      ),
    });

    return created;
  });

  await recordAuditEntry(newMentor.id, 'CREATE');
  await assignMentorRole(parsed.userId);

  if (parsed.email) {
    await sendApplicationReceivedEmail(parsed.email, parsed.fullName || '');
  }

  return {
    success: true,
    message: 'Mentor application submitted successfully',
    data: {
      id: newMentor.id,
      userId: parsed.userId,
      status: 'IN_PROGRESS' as const,
    },
  };
}
