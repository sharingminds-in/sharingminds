import { and, desc, eq } from 'drizzle-orm';

import type { TRPCContext } from '@/lib/trpc/context';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  contactSubmissions,
  mentors,
  mentorsProfileAudit,
  mentees,
  roles,
  sessionPolicies,
  userRoles,
  users,
  type NotificationType,
} from '@/lib/db/schema';
import { getUserWithRoles } from '@/lib/db/user-helpers';
import {
  deleteStorageValues,
  resolveStorageUrl,
  uploadProfilePicture,
  uploadResume,
} from '@/lib/storage';
import {
  sendMentorApplicationApprovedEmail,
  sendMentorApplicationRejectedEmail,
  sendMentorApplicationReverificationRequestEmail,
} from '@/lib/email';
import { createNotificationRecord } from '@/lib/notifications/server/service';
import { logAdminAction } from '@/lib/db/audit';
import {
  ADMIN_SESSION_ACTIONS,
  logAdminSessionAction,
} from '@/lib/db/admin-session-audit';
import {
  buildAdminCreatedMentorProfileValues,
  splitAdminCreatedMentorName,
  splitAdminCreatedUserName,
} from '@/lib/admin/user-provisioning';
import {
  buildMentorAdminUpdatePlan,
  generateAdminMentorCouponCode,
} from '@/lib/admin/mentor-actions';
import { buildAdminOverview } from '@/lib/admin/overview';
import {
  buildAdminPoliciesWithDefaults,
  getAdminPolicyDefinitions,
  getValidAdminPolicyKeys,
  groupAdminPolicies,
} from '@/lib/admin/policies';
import {
  adminCreateMentorUserInputSchema,
  adminCreateAdminUserInputSchema,
  adminGetMentorAuditInputSchema,
  adminPromoteAdminUserInputSchema,
  adminSendMentorCouponInputSchema,
  adminUpdateEnquiryInputSchema,
  adminUpdateMentorInputSchema,
  adminUpdatePoliciesInputSchema,
  type AdminCreateMentorUserInput,
  type AdminCreateAdminUserInput,
  type AdminPromoteAdminUserInput,
  type AdminSendMentorCouponInput,
  type AdminUpdateEnquiryInput,
  type AdminUpdateMentorInput,
  type AdminUpdatePoliciesInput,
} from './schemas';
import { AdminServiceError, assertAdminService } from './errors';

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getUserWithRoles>>>;

type AdminServiceContext = Pick<TRPCContext, 'db' | 'req'> & {
  userId: string;
  currentUser?: CurrentUser;
};

const mentorSelectFields = {
  id: mentors.id,
  userId: mentors.userId,
  name: mentors.fullName,
  email: mentors.email,
  image: users.image,
  title: mentors.title,
  company: mentors.company,
  industry: mentors.industry,
  headline: mentors.headline,
  about: mentors.about,
  experienceYears: mentors.experience,
  expertise: mentors.expertise,
  hourlyRate: mentors.hourlyRate,
  currency: mentors.currency,
  verificationStatus: mentors.verificationStatus,
  verificationNotes: mentors.verificationNotes,
  isAvailable: mentors.isAvailable,
  resumeUrl: mentors.resumeUrl,
  linkedinUrl: mentors.linkedinUrl,
  websiteUrl: mentors.websiteUrl,
  profileImageUrl: mentors.profileImageUrl,
  phone: mentors.phone,
  githubUrl: mentors.githubUrl,
  fullName: mentors.fullName,
  country: mentors.country,
  state: mentors.state,
  city: mentors.city,
  createdAt: mentors.createdAt,
  updatedAt: mentors.updatedAt,
  couponCode: mentors.couponCode,
  isCouponCodeEnabled: mentors.isCouponCodeEnabled,
  paymentStatus: mentors.paymentStatus,
  isExpert: mentors.isExpert,
};

const menteeSelectFields = {
  id: mentees.id,
  userId: mentees.userId,
  name: users.name,
  email: users.email,
  image: users.image,
  currentRole: mentees.currentRole,
  currentCompany: mentees.currentCompany,
  education: mentees.education,
  careerGoals: mentees.careerGoals,
  interests: mentees.interests,
  skillsToLearn: mentees.skillsToLearn,
  currentSkills: mentees.currentSkills,
  learningStyle: mentees.learningStyle,
  preferredMeetingFrequency: mentees.preferredMeetingFrequency,
  createdAt: mentees.createdAt,
  updatedAt: mentees.updatedAt,
};

const adminUserSelectFields = {
  id: users.id,
  email: users.email,
  emailVerified: users.emailVerified,
  name: users.name,
  firstName: users.firstName,
  lastName: users.lastName,
  phone: users.phone,
  isActive: users.isActive,
  isBlocked: users.isBlocked,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
  roleName: roles.name,
  roleDisplayName: roles.displayName,
  adminLevel: userRoles.adminLevel,
  mentorId: mentors.id,
  mentorVerificationStatus: mentors.verificationStatus,
  mentorCreationSource: mentors.creationSource,
  mentorCreatedByAdminId: mentors.createdByAdminId,
};

function getAdminDb(context?: Pick<TRPCContext, 'db'>) {
  return context?.db ?? db;
}

async function getAdminActor(context: AdminServiceContext): Promise<CurrentUser> {
  const resolvedUser =
    context.currentUser ?? (await getUserWithRoles(context.userId));

  const isAdmin = resolvedUser?.roles.some((role) => role.name === 'admin');

  assertAdminService(resolvedUser, 401, 'Authentication required');
  assertAdminService(isAdmin, 403, 'Admin access required');

  return resolvedUser;
}

function getAdminActorLevel(actor: CurrentUser) {
  return actor.roles.find((role) => role.name === 'admin')?.adminLevel ?? null;
}

function assertSuperAdminActor(actor: CurrentUser) {
  assertAdminService(
    getAdminActorLevel(actor) === 'super',
    403,
    'Super admin access required'
  );
}

function parseJsonList(value: string | null | undefined): string[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object') {
            if ('label' in item && typeof item.label === 'string') {
              return item.label;
            }
            if ('name' in item && typeof item.name === 'string') {
              return item.name;
            }
            return Object.values(item)
              .filter((entry) => typeof entry === 'string')
              .join(' ');
          }
          return String(item ?? '').trim();
        })
        .filter(Boolean);
    }
  } catch (_error) {
    // Fall through to delimited parsing.
  }

  if (value.includes(',')) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [value];
}

async function fetchMentorRows(context: AdminServiceContext, mentorId?: string) {
  const database = getAdminDb(context);
  const query = database
    .select(mentorSelectFields)
    .from(mentors)
    .innerJoin(users, eq(mentors.userId, users.id));

  return mentorId
    ? query.where(eq(mentors.id, mentorId))
    : query;
}

type MentorRow = Awaited<ReturnType<typeof fetchMentorRows>>[number];

async function formatMentorRecord(raw: MentorRow) {
  const signedProfileImageUrl = await resolveStorageUrl(raw.profileImageUrl);
  const signedResumeUrl = await resolveStorageUrl(raw.resumeUrl);

  return {
    id: raw.id,
    userId: raw.userId,
    name: raw.name,
    email: raw.email,
    image: raw.image,
    title: raw.title,
    company: raw.company,
    industry: raw.industry,
    headline: raw.headline,
    about: raw.about,
    experienceYears: raw.experienceYears,
    expertise: parseJsonList(raw.expertise),
    hourlyRate: raw.hourlyRate,
    currency: raw.currency,
    verificationStatus: raw.verificationStatus,
    verificationNotes: raw.verificationNotes,
    isAvailable: raw.isAvailable,
    resumeUrl: signedResumeUrl,
    linkedinUrl: raw.linkedinUrl,
    websiteUrl: raw.websiteUrl,
    profileImageUrl: signedProfileImageUrl,
    phone: raw.phone,
    githubUrl: raw.githubUrl,
    fullName: raw.fullName,
    location: [raw.city, raw.state, raw.country].filter(Boolean).join(', '),
    city: raw.city,
    state: raw.state,
    country: raw.country,
    createdAt: raw.createdAt ? raw.createdAt.toISOString() : null,
    updatedAt: raw.updatedAt ? raw.updatedAt.toISOString() : null,
    couponCode: raw.couponCode,
    isCouponCodeEnabled: raw.isCouponCodeEnabled,
    paymentStatus: raw.paymentStatus,
    isExpert: raw.isExpert,
  };
}

async function getFormattedMentorById(
  context: AdminServiceContext,
  mentorId: string
) {
  const rows = await fetchMentorRows(context, mentorId);
  const mentor = rows[0];

  assertAdminService(mentor, 404, 'Mentor not found');

  return formatMentorRecord(mentor);
}

async function sendAdminNotification(
  input: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    actionUrl?: string;
  },
  context?: Pick<TRPCContext, 'db'>
) {
  await createNotificationRecord(input, context);
}

export async function getAdminOverview(context: AdminServiceContext) {
  await getAdminActor(context);

  const database = getAdminDb(context);
  const [mentorRows, menteeRows, enquiryRows] = await Promise.all([
    database
      .select({
        verificationStatus: mentors.verificationStatus,
        isAvailable: mentors.isAvailable,
        createdAt: mentors.createdAt,
      })
      .from(mentors),
    database
      .select({
        createdAt: mentees.createdAt,
      })
      .from(mentees),
    database
      .select({
        isResolved: contactSubmissions.isResolved,
      })
      .from(contactSubmissions),
  ]);

  return buildAdminOverview(
    {
      mentors: mentorRows.map((mentor) => ({
        verificationStatus: mentor.verificationStatus,
        isAvailable: mentor.isAvailable,
        createdAt: mentor.createdAt ? mentor.createdAt.toISOString() : null,
      })),
      mentees: menteeRows.map((mentee) => ({
        createdAt: mentee.createdAt ? mentee.createdAt.toISOString() : null,
      })),
      enquiries: enquiryRows,
    },
    { now: new Date() }
  );
}

export async function listAdminMentors(context: AdminServiceContext) {
  await getAdminActor(context);
  const rows = await fetchMentorRows(context);
  return Promise.all(rows.map((row) => formatMentorRecord(row)));
}

export async function listAdminUsers(context: AdminServiceContext) {
  await getAdminActor(context);
  const database = getAdminDb(context);
  const rows = await database
    .select(adminUserSelectFields)
    .from(users)
    .leftJoin(userRoles, eq(users.id, userRoles.userId))
    .leftJoin(roles, eq(userRoles.roleId, roles.id))
    .leftJoin(mentors, eq(users.id, mentors.userId))
    .orderBy(desc(users.createdAt));

  const usersById = new Map<
    string,
    {
      id: string;
      email: string;
      emailVerified: boolean | null;
      name: string | null;
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
      isActive: boolean | null;
      isBlocked: boolean | null;
      createdAt: string | null;
      updatedAt: string | null;
      roles: Array<{
        name: string;
        displayName: string | null;
        adminLevel: 'normal' | 'super' | null;
      }>;
      mentor: {
        id: string;
        verificationStatus: typeof mentors.verificationStatus.enumValues[number];
        creationSource: typeof mentors.creationSource.enumValues[number];
        createdByAdminId: string | null;
      } | null;
    }
  >();

  for (const row of rows) {
    const existing = usersById.get(row.id);
    const role =
      row.roleName && row.roleDisplayName
        ? {
            name: row.roleName,
            displayName: row.roleDisplayName,
            adminLevel:
              row.roleName === 'admin' ? row.adminLevel ?? 'normal' : null,
          }
        : null;
    const mentor =
      row.mentorId &&
      row.mentorVerificationStatus &&
      row.mentorCreationSource
        ? {
            id: row.mentorId,
            verificationStatus: row.mentorVerificationStatus,
            creationSource: row.mentorCreationSource,
            createdByAdminId: row.mentorCreatedByAdminId,
          }
        : null;

    if (existing) {
      if (
        role &&
        !existing.roles.some((existingRole) => existingRole.name === role.name)
      ) {
        existing.roles.push(role);
      }
      continue;
    }

    usersById.set(row.id, {
      id: row.id,
      email: row.email,
      emailVerified: row.emailVerified,
      name: row.name,
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone,
      isActive: row.isActive,
      isBlocked: row.isBlocked,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
      roles: role ? [role] : [],
      mentor,
    });
  }

  return Array.from(usersById.values());
}

export async function createAdminUser(
  context: AdminServiceContext,
  input: AdminCreateAdminUserInput
) {
  const actor = await getAdminActor(context);
  const parsed = adminCreateAdminUserInputSchema.parse(input);
  const database = getAdminDb(context);

  const [existingUser] = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, parsed.email))
    .limit(1);

  assertAdminService(!existingUser, 409, 'A user with this email already exists');

  let createdUserId: string | null = null;

  try {
    const signUpResult = await auth.api.signUpEmail({
      body: {
        name: parsed.fullName,
        email: parsed.email,
        password: parsed.initialPassword,
      },
    });
    createdUserId = signUpResult.user.id;

    const { firstName, lastName } = splitAdminCreatedUserName(parsed.fullName);

    await database.transaction(async (transaction) => {
      const [adminRole] = await transaction
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.name, 'admin'))
        .limit(1);

      assertAdminService(adminRole, 500, 'Admin role is not configured');

      await transaction
        .update(users)
        .set({
          emailVerified: true,
          firstName,
          lastName,
          updatedAt: new Date(),
        })
        .where(eq(users.id, createdUserId!));

      await transaction
        .insert(userRoles)
        .values({
          userId: createdUserId!,
          roleId: adminRole.id,
          assignedBy: actor.id,
          adminLevel: parsed.adminLevel,
        })
        .onConflictDoNothing();
    });

    await logAdminAction({
      adminId: actor.id,
      action: 'ADMIN_USER_CREATED',
      targetId: createdUserId,
      targetType: 'admin',
      details: {
        email: parsed.email,
        adminLevel: parsed.adminLevel,
      },
    });

    return {
      userId: createdUserId,
      users: await listAdminUsers(context),
    };
  } catch (error) {
    if (createdUserId) {
      await database.delete(users).where(eq(users.id, createdUserId));
    }

    if (error instanceof AdminServiceError) {
      throw error;
    }

    throw new AdminServiceError(
      500,
      error instanceof Error ? error.message : 'Failed to create admin user'
    );
  }
}

export async function promoteAdminUserToSuper(
  context: AdminServiceContext,
  input: AdminPromoteAdminUserInput
) {
  const actor = await getAdminActor(context);
  assertSuperAdminActor(actor);

  const parsed = adminPromoteAdminUserInputSchema.parse(input);
  const database = getAdminDb(context);

  const [targetAdminRole] = await database
    .select({
      userId: userRoles.userId,
      roleId: userRoles.roleId,
      adminLevel: userRoles.adminLevel,
      email: users.email,
      name: users.name,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .innerJoin(users, eq(userRoles.userId, users.id))
    .where(and(eq(userRoles.userId, parsed.userId), eq(roles.name, 'admin')))
    .limit(1);

  assertAdminService(targetAdminRole, 404, 'Admin user not found');
  assertAdminService(
    targetAdminRole.adminLevel !== 'super',
    400,
    'Admin user is already a super admin'
  );

  await database
    .update(userRoles)
    .set({
      adminLevel: 'super',
    })
    .where(
      and(
        eq(userRoles.userId, targetAdminRole.userId),
        eq(userRoles.roleId, targetAdminRole.roleId)
      )
    );

  await logAdminAction({
    adminId: actor.id,
    action: 'ADMIN_USER_PROMOTED_TO_SUPER',
    targetId: targetAdminRole.userId,
    targetType: 'admin',
    details: {
      email: targetAdminRole.email,
      previousAdminLevel: targetAdminRole.adminLevel ?? 'normal',
      adminLevel: 'super',
    },
  });

  return {
    userId: targetAdminRole.userId,
    previousAdminLevel: targetAdminRole.adminLevel ?? 'normal',
    adminLevel: 'super' as const,
    users: await listAdminUsers(context),
  };
}

export async function createAdminMentorUser(
  context: AdminServiceContext,
  input: AdminCreateMentorUserInput,
  files?: {
    profilePicture?: File | null;
    resume?: File | null;
  }
) {
  const actor = await getAdminActor(context);
  const parsed = adminCreateMentorUserInputSchema.parse(input);
  const database = getAdminDb(context);

  const [existingUser] = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, parsed.email))
    .limit(1);

  assertAdminService(!existingUser, 409, 'A user with this email already exists');

  let createdUserId: string | null = null;
  const uploadedStorageValues: string[] = [];

  try {
    const signUpResult = await auth.api.signUpEmail({
      body: {
        name: parsed.fullName,
        email: parsed.email,
        password: parsed.initialPassword,
      },
    });
    createdUserId = signUpResult.user.id;

    let profileImageUrl = parsed.profileImageUrl ?? null;
    let resumeUrl = parsed.resumeUrl ?? null;

    if (files?.profilePicture instanceof File && files.profilePicture.size > 0) {
      const uploadResult = await uploadProfilePicture(
        files.profilePicture,
        createdUserId
      );
      profileImageUrl = uploadResult.path;
      uploadedStorageValues.push(uploadResult.path);
    }

    assertAdminService(
      profileImageUrl,
      400,
      'Profile picture is required'
    );

    if (files?.resume instanceof File && files.resume.size > 0) {
      const uploadResult = await uploadResume(files.resume, createdUserId);
      resumeUrl = uploadResult.path;
      uploadedStorageValues.push(uploadResult.path);
    }

    const { firstName, lastName } = splitAdminCreatedMentorName(
      parsed.fullName
    );

    await database.transaction(async (transaction) => {
      const [mentorRole] = await transaction
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.name, 'mentor'))
        .limit(1);

      assertAdminService(mentorRole, 500, 'Mentor role is not configured');

      await transaction
        .update(users)
        .set({
          emailVerified: true,
          firstName,
          lastName,
          phone: parsed.phone,
          updatedAt: new Date(),
        })
        .where(eq(users.id, createdUserId!));

      await transaction
        .insert(userRoles)
        .values({
          userId: createdUserId!,
          roleId: mentorRole.id,
          assignedBy: actor.id,
        })
        .onConflictDoNothing();

      await transaction.insert(mentors).values(
        buildAdminCreatedMentorProfileValues({
          userId: createdUserId!,
          adminId: actor.id,
          input: {
            fullName: parsed.fullName,
            email: parsed.email,
            phone: parsed.phone,
            title: parsed.title,
            company: parsed.company,
            industry: parsed.industry,
            expertise: parsed.expertise,
            experience: parsed.experience,
            about: parsed.about,
            linkedinUrl: parsed.linkedinUrl,
            country: parsed.country,
            state: parsed.state,
            city: parsed.city,
            availability: parsed.availability,
            profileImageUrl,
            resumeUrl: resumeUrl ?? undefined,
          },
        })
      );
    });

    await logAdminAction({
      adminId: actor.id,
      action: 'MENTOR_USER_CREATED',
      targetId: createdUserId,
      targetType: 'mentor',
      details: {
        email: parsed.email,
        creationSource: 'ADMIN_CREATED',
      },
    });

    return {
      userId: createdUserId,
      users: await listAdminUsers(context),
    };
  } catch (error) {
    await deleteStorageValues(uploadedStorageValues);

    if (createdUserId) {
      await database.delete(users).where(eq(users.id, createdUserId));
    }

    if (error instanceof AdminServiceError) {
      throw error;
    }

    throw new AdminServiceError(
      500,
      error instanceof Error ? error.message : 'Failed to create mentor user'
    );
  }
}

export async function updateAdminMentor(
  context: AdminServiceContext,
  input: AdminUpdateMentorInput
) {
  const actor = await getAdminActor(context);
  const parsed = adminUpdateMentorInputSchema.parse(input);
  const database = getAdminDb(context);

  const existingRows = await fetchMentorRows(context, parsed.mentorId);
  const existingMentor = existingRows[0];

  assertAdminService(existingMentor, 404, 'Mentor not found');

  const plan = buildMentorAdminUpdatePlan({
    existingStatus: existingMentor.verificationStatus,
    existingVerificationNotes: existingMentor.verificationNotes,
    existingCouponCode: existingMentor.couponCode,
    existingCouponEnabled: Boolean(existingMentor.isCouponCodeEnabled),
    existingIsExpert: Boolean(existingMentor.isExpert),
    nextStatus: parsed.status,
    notes: parsed.notes,
    enableCoupon: parsed.enableCoupon,
    isExpert: parsed.isExpert,
  });

  const [updatedMentor] = await database
    .update(mentors)
    .set(plan.updateData)
    .where(eq(mentors.id, parsed.mentorId))
    .returning({
      id: mentors.id,
      userId: mentors.userId,
      fullName: mentors.fullName,
      email: mentors.email,
    });

  assertAdminService(updatedMentor, 404, 'Mentor not found');

  if (
    plan.isStatusChanged ||
    parsed.notes !== undefined ||
    parsed.enableCoupon !== undefined
  ) {
    await logAdminAction({
      adminId: actor.id,
      action: 'MENTOR_VERIFICATION_STATUS_CHANGED',
      targetId: updatedMentor.userId,
      targetType: 'mentor',
      details: {
        previousStatus: existingMentor.verificationStatus,
        newStatus: parsed.status,
        notes: plan.noteToStore,
        couponIssued: plan.couponCode ?? undefined,
      },
    });
  }

  if (plan.expertChanged) {
    await logAdminAction({
      adminId: actor.id,
      action: 'MENTOR_EXPERT_FLAG_CHANGED',
      targetId: updatedMentor.userId,
      targetType: 'mentor',
      details: {
        previousIsExpert: plan.previousIsExpert,
        newIsExpert: parsed.isExpert,
      },
    });
  }

  if (plan.isStatusChanged && updatedMentor.email) {
    if (parsed.status === 'VERIFIED') {
      await sendMentorApplicationApprovedEmail(
        updatedMentor.email,
        updatedMentor.fullName ?? 'Mentor',
        plan.couponCode ?? undefined
      );
      await sendAdminNotification(
        {
          userId: updatedMentor.userId,
          type: 'MENTOR_APPLICATION_APPROVED',
          title: 'Application Approved!',
          message:
            'Congratulations! Your mentor application has been approved.',
          actionUrl: '/dashboard',
        },
        context
      );
    } else if (parsed.status === 'REJECTED') {
      await sendMentorApplicationRejectedEmail(
        updatedMentor.email,
        updatedMentor.fullName ?? 'Mentor',
        plan.noteToStore || 'No reason provided.'
      );
      await sendAdminNotification(
        {
          userId: updatedMentor.userId,
          type: 'MENTOR_APPLICATION_REJECTED',
          title: 'Application Rejected',
          message: `Your mentor application has been rejected. Reason: ${
            plan.noteToStore || 'No reason provided.'
          }`,
          actionUrl: '/become-expert',
        },
        context
      );
    } else if (parsed.status === 'REVERIFICATION') {
      await sendMentorApplicationReverificationRequestEmail(
        updatedMentor.email,
        updatedMentor.fullName ?? 'Mentor',
        plan.noteToStore || 'No reason provided.'
      );
      await sendAdminNotification(
        {
          userId: updatedMentor.userId,
          type: 'MENTOR_APPLICATION_UPDATE_REQUESTED',
          title: 'Update Requested',
          message: `An update has been requested for your mentor application. Note: ${
            plan.noteToStore || 'No reason provided.'
          }`,
          actionUrl: '/become-expert',
        },
        context
      );
    }
  }

  return {
    mentor: await getFormattedMentorById(context, parsed.mentorId),
  };
}

export async function sendAdminMentorCoupon(
  context: AdminServiceContext,
  input: AdminSendMentorCouponInput
) {
  const actor = await getAdminActor(context);
  const parsed = adminSendMentorCouponInputSchema.parse(input);
  const database = getAdminDb(context);

  const [mentor] = await database
    .select({
      id: mentors.id,
      userId: mentors.userId,
      fullName: mentors.fullName,
      email: mentors.email,
      verificationStatus: mentors.verificationStatus,
      paymentStatus: mentors.paymentStatus,
      couponCode: mentors.couponCode,
      isCouponCodeEnabled: mentors.isCouponCodeEnabled,
    })
    .from(mentors)
    .where(eq(mentors.id, parsed.mentorId))
    .limit(1);

  assertAdminService(mentor, 404, 'Mentor not found');
  assertAdminService(
    mentor.verificationStatus === 'VERIFIED',
    400,
    'Coupon codes can only be sent to verified mentors'
  );
  assertAdminService(
    !mentor.paymentStatus || mentor.paymentStatus === 'PENDING',
    400,
    'Coupon codes are only available for mentors with pending payments'
  );
  assertAdminService(mentor.email, 422, 'Mentor email is missing');

  const wasCouponEnabled = Boolean(
    mentor.isCouponCodeEnabled && mentor.couponCode
  );
  const couponCode = generateAdminMentorCouponCode();

  await database
    .update(mentors)
    .set({
      couponCode,
      isCouponCodeEnabled: true,
      updatedAt: new Date(),
    })
    .where(eq(mentors.id, parsed.mentorId));

  await sendMentorApplicationApprovedEmail(
    mentor.email,
    mentor.fullName ?? 'Mentor',
    couponCode,
    {
      auditAction: wasCouponEnabled
        ? 'email.mentor.approved.resend.couponcode'
        : 'email.mentor.approved.send.couponcode',
    }
  );

  await logAdminAction({
    adminId: actor.id,
    action: 'MENTOR_COUPON_SENT',
    targetId: mentor.userId,
    targetType: 'mentor',
    details: { couponIssued: couponCode },
  });

  return {
    couponCode,
    mentor: await getFormattedMentorById(context, parsed.mentorId),
  };
}

export async function getAdminMentorAudit(
  context: AdminServiceContext,
  input: { mentorId: string }
) {
  await getAdminActor(context);
  const parsed = adminGetMentorAuditInputSchema.parse(input);
  const database = getAdminDb(context);

  const [latestAudit] = await database
    .select()
    .from(mentorsProfileAudit)
    .where(eq(mentorsProfileAudit.mentorId, parsed.mentorId))
    .orderBy(desc(mentorsProfileAudit.changedAt))
    .limit(1);

  assertAdminService(
    latestAudit,
    404,
    'No audit history found for this mentor'
  );

  return latestAudit;
}

export async function listAdminMentees(context: AdminServiceContext) {
  await getAdminActor(context);
  const database = getAdminDb(context);
  const rows = await database
    .select(menteeSelectFields)
    .from(mentees)
    .innerJoin(users, eq(mentees.userId, users.id));

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    name: row.name,
    email: row.email,
    image: row.image,
    currentRole: row.currentRole,
    currentCompany: row.currentCompany,
    careerGoals: row.careerGoals,
    interests: parseJsonList(row.interests),
    skillsToLearn: parseJsonList(row.skillsToLearn),
    currentSkills: parseJsonList(row.currentSkills),
    education: parseJsonList(row.education),
    learningStyle: row.learningStyle,
    preferredMeetingFrequency: row.preferredMeetingFrequency,
    createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  }));
}

export async function listAdminEnquiries(context: AdminServiceContext) {
  await getAdminActor(context);
  const database = getAdminDb(context);
  const rows = await database
    .select()
    .from(contactSubmissions)
    .orderBy(desc(contactSubmissions.createdAt));

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt ? row.createdAt.toISOString() : null,
  }));
}

export async function updateAdminEnquiry(
  context: AdminServiceContext,
  input: AdminUpdateEnquiryInput
) {
  await getAdminActor(context);
  const parsed = adminUpdateEnquiryInputSchema.parse(input);
  const database = getAdminDb(context);

  const [updatedEnquiry] = await database
    .update(contactSubmissions)
    .set({
      isResolved: parsed.isResolved,
    })
    .where(eq(contactSubmissions.id, parsed.enquiryId))
    .returning();

  assertAdminService(updatedEnquiry, 404, 'Enquiry not found');

  return {
    enquiry: {
      ...updatedEnquiry,
      createdAt: updatedEnquiry.createdAt
        ? updatedEnquiry.createdAt.toISOString()
        : null,
    },
  };
}

export async function getAdminPolicies(context: AdminServiceContext) {
  await getAdminActor(context);
  const database = getAdminDb(context);
  const storedRows = await database.select().from(sessionPolicies);
  const policies = buildAdminPoliciesWithDefaults(storedRows);

  return {
    policies,
    grouped: groupAdminPolicies(policies),
  };
}

export async function updateAdminPolicies(
  context: AdminServiceContext,
  input: AdminUpdatePoliciesInput
) {
  const actor = await getAdminActor(context);
  const parsed = adminUpdatePoliciesInputSchema.parse(input);
  const database = getAdminDb(context);
  const validPolicyKeys = getValidAdminPolicyKeys();
  const invalidKeys = parsed.updates
    .map((update) => update.key)
    .filter((key) => !validPolicyKeys.has(key));

  assertAdminService(
    invalidKeys.length === 0,
    400,
    `Invalid policy keys: ${invalidKeys.join(', ')}`
  );

  const policyDefinitions = new Map(
    getAdminPolicyDefinitions().map((policy) => [policy.key, policy])
  );

  const currentPolicies = await database.select().from(sessionPolicies);
  const currentByKey = new Map(
    currentPolicies.map((policy) => [policy.policyKey, policy])
  );
  const previousValues = Object.fromEntries(
    parsed.updates.map((update) => [
      update.key,
      currentByKey.get(update.key)?.policyValue ??
        policyDefinitions.get(update.key)?.value ??
        '',
    ])
  );

  await database.transaction(async (transaction) => {
    for (const update of parsed.updates) {
      const existing = currentByKey.get(update.key);
      const definition = policyDefinitions.get(update.key);

      if (existing) {
        await transaction
          .update(sessionPolicies)
          .set({
            policyValue: update.value,
            updatedAt: new Date(),
          })
          .where(eq(sessionPolicies.policyKey, update.key));
      } else {
        await transaction.insert(sessionPolicies).values({
          policyKey: update.key,
          policyValue: update.value,
          policyType: definition?.type ?? 'string',
          description: definition?.description ?? null,
        });
      }
    }
  });

  await logAdminSessionAction({
    adminId: actor.id,
    sessionId: null,
    action: ADMIN_SESSION_ACTIONS.POLICY_UPDATED,
    previousStatus: null,
    newStatus: null,
    reason: `Updated ${parsed.updates.length} policy setting(s)`,
    details: {
      updates: parsed.updates.map((update) => ({
        key: update.key,
        previousValue: previousValues[update.key],
        newValue: update.value,
      })),
    },
    request: context.req,
  });

  return {
    message: `Updated ${parsed.updates.length} policy setting(s)`,
    ...(await getAdminPolicies(context)),
  };
}

export async function resetAdminPolicies(context: AdminServiceContext) {
  const actor = await getAdminActor(context);
  const database = getAdminDb(context);

  const previousPolicies = await getAdminPolicies(context);
  const policyDefinitions = getAdminPolicyDefinitions();
  const currentPolicies = await database.select().from(sessionPolicies);
  const currentByKey = new Map(
    currentPolicies.map((policy) => [policy.policyKey, policy])
  );

  await database.transaction(async (transaction) => {
    for (const definition of policyDefinitions) {
      const existing = currentByKey.get(definition.key);

      if (existing) {
        await transaction
          .update(sessionPolicies)
          .set({
            policyValue: definition.value,
            updatedAt: new Date(),
          })
          .where(eq(sessionPolicies.policyKey, definition.key));
      } else {
        await transaction.insert(sessionPolicies).values({
          policyKey: definition.key,
          policyValue: definition.value,
          policyType: definition.type,
          description: definition.description,
        });
      }
    }
  });

  await logAdminSessionAction({
    adminId: actor.id,
    sessionId: null,
    action: ADMIN_SESSION_ACTIONS.POLICY_RESET,
    previousStatus: null,
    newStatus: null,
    reason: 'Reset all policies to default values',
    details: {
      previousPolicies: previousPolicies.policies.map((policy) => ({
        key: policy.key,
        previousValue: policy.value,
        defaultValue: policy.defaultValue,
      })),
    },
    request: context.req,
  });

  return {
    message: 'All policies have been reset to defaults',
    ...(await getAdminPolicies(context)),
  };
}
