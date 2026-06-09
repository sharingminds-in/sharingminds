import { eq } from 'drizzle-orm';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { mentors } from '@/lib/db/schema';
import { getUserWithRoles } from '@/lib/db/user-helpers';
import { buildAccountAccessPolicySnapshot } from '@/lib/access-policy/account';
import { resolveAccessPolicyRuntimeConfig } from '@/lib/access-policy/runtime-config';
import { buildMenteeAccessPolicySnapshot } from '@/lib/mentee/access-policy';
import { buildMentorAccessPolicySnapshot } from '@/lib/mentor/access-policy';
import { resolveStorageUrl } from '@/lib/storage';
import { resolveSubscriptionEntitlements } from '@/lib/subscriptions/entitlements';

function serializeDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

export async function getSessionWithRoles(
  headers: Headers
) {
  const session = await auth.api.getSession({ headers });

  if (!session?.user) {
    return {
      session: null,
      user: null,
      roles: [],
      accountAccess: null,
      mentorProfile: null,
      mentorAccess: null,
      menteeAccess: null,
      policyRuntime: null,
      isAdmin: false,
      isMentor: false,
      isMentee: false,
      isMentorWithIncompleteProfile: false,
    };
  }

  const userWithRoles = await getUserWithRoles(session.user.id);

  if (!userWithRoles) {
    throw new Error('User not found');
  }

  const isMentor = userWithRoles.roles.some((role) => role.name === 'mentor');
  const isAdmin = userWithRoles.roles.some((role) => role.name === 'admin');
  const isMentee = userWithRoles.roles.some((role) => role.name === 'mentee');
  const accountAccess = buildAccountAccessPolicySnapshot({
    isAuthenticated: true,
    isActive: userWithRoles.isActive,
    isBlocked: userWithRoles.isBlocked,
  });
  const runtimeConfig = await resolveAccessPolicyRuntimeConfig();

  let mentorProfile = null;

  if (isMentor) {
    const [mentor] = await db
      .select({
        id: mentors.id,
        verificationStatus: mentors.verificationStatus,
        verificationNotes: mentors.verificationNotes,
        fullName: mentors.fullName,
        email: mentors.email,
        phone: mentors.phone,
        title: mentors.title,
        company: mentors.company,
        city: mentors.city,
        state: mentors.state,
        country: mentors.country,
        industry: mentors.industry,
        expertise: mentors.expertise,
        experience: mentors.experience,
        about: mentors.about,
        linkedinUrl: mentors.linkedinUrl,
        githubUrl: mentors.githubUrl,
        websiteUrl: mentors.websiteUrl,
        hourlyRate: mentors.hourlyRate,
        adminHourlyRateOverride: mentors.adminHourlyRateOverride,
        rateOverrideReason: mentors.rateOverrideReason,
        rateOverriddenAt: mentors.rateOverriddenAt,
        currency: mentors.currency,
        availability: mentors.availability,
        headline: mentors.headline,
        maxMentees: mentors.maxMentees,
        profileImageUrl: mentors.profileImageUrl,
        bannerImageUrl: mentors.bannerImageUrl,
        resumeUrl: mentors.resumeUrl,
        paymentStatus: mentors.paymentStatus,
        couponCode: mentors.couponCode,
        isCouponCodeEnabled: mentors.isCouponCodeEnabled,
        searchMode: mentors.searchMode,
        isAvailable: mentors.isAvailable,
        createdAt: mentors.createdAt,
        updatedAt: mentors.updatedAt,
      })
      .from(mentors)
      .where(eq(mentors.userId, session.user.id))
      .limit(1);

    mentorProfile = mentor
      ? {
          ...mentor,
          profileImageUrl: await resolveStorageUrl(mentor.profileImageUrl),
          bannerImageUrl: await resolveStorageUrl(mentor.bannerImageUrl),
          resumeUrl: await resolveStorageUrl(mentor.resumeUrl),
          rateOverriddenAt: serializeDate(mentor.rateOverriddenAt),
          createdAt: serializeDate(mentor.createdAt),
          updatedAt: serializeDate(mentor.updatedAt),
        }
      : null;
  }

  const [mentorSubscription, menteeSubscription] = await Promise.all([
    isMentor
      ? resolveSubscriptionEntitlements(session.user.id, {
          audience: 'mentor',
          actorRole: 'mentor',
        })
      : Promise.resolve(null),
    isMentee
      ? resolveSubscriptionEntitlements(session.user.id, {
          audience: 'mentee',
          actorRole: 'mentee',
        })
      : Promise.resolve(null),
  ]);

  return {
    session: {
      ...session,
      user: {
        ...session.user,
        ...userWithRoles,
      },
    },
    user: userWithRoles,
    roles: userWithRoles.roles,
    accountAccess,
    mentorProfile,
    mentorAccess: isMentor
      ? buildMentorAccessPolicySnapshot({
          isMentor,
          isAdmin,
          mentorProfile,
          accountAccess,
          subscription: mentorSubscription,
          policyConfig: runtimeConfig.mentor,
        })
      : null,
    menteeAccess: isMentee
      ? buildMenteeAccessPolicySnapshot({
          isMentee,
          isAdmin,
          accountAccess,
          subscription: menteeSubscription,
          policyConfig: runtimeConfig.mentee,
        })
      : null,
    policyRuntime: runtimeConfig.metadata,
    isAdmin,
    isMentor,
    isMentee,
    isMentorWithIncompleteProfile:
      isMentor && mentorProfile?.verificationStatus === 'IN_PROGRESS',
  };
}
