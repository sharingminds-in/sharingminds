import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { menteesProfileAudit } from '@/lib/db/schema/mentee-profile-audit';
import { mentees, mentors, roles, userRoles } from '@/lib/db/schema';
import { getUserWithRoles } from '@/lib/db/user-helpers';
import { resolveStorageUrl } from '@/lib/storage';
import {
  buildMenteeProfilePatch,
  mapMenteeProfileToFormData,
} from '@/lib/profile/mentee-profile';

import {
  upsertMenteeProfileInputSchema,
  type UpsertMenteeProfileInput,
} from './schemas';

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getUserWithRoles>>>;

export class ProfileServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly data?: unknown
  ) {
    super(message);
    this.name = 'ProfileServiceError';
  }
}

function assertProfile(
  condition: unknown,
  status: number,
  message: string,
  data?: unknown
): asserts condition {
  if (!condition) {
    throw new ProfileServiceError(status, message, data);
  }
}

async function getProfileUser(
  userId: string,
  currentUser?: CurrentUser
): Promise<CurrentUser> {
  const resolvedUser = currentUser ?? (await getUserWithRoles(userId));
  assertProfile(resolvedUser, 401, 'Authentication required');
  return resolvedUser;
}

export async function getCurrentUserProfile(
  userId: string,
  currentUser?: CurrentUser
) {
  const resolvedUser = await getProfileUser(userId, currentUser);
  const roleNames = new Set(
    resolvedUser.roles.map((role: { name: string }) => role.name)
  );

  const [menteeProfile, mentorProfileRaw] = await Promise.all([
    roleNames.has('mentee')
      ? db
          .select()
          .from(mentees)
          .where(eq(mentees.userId, userId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    roleNames.has('mentor')
      ? db
          .select({
            id: mentors.id,
            verificationStatus: mentors.verificationStatus,
            fullName: mentors.fullName,
            email: mentors.email,
            phone: mentors.phone,
            title: mentors.title,
            company: mentors.company,
            city: mentors.city,
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
            currency: mentors.currency,
            availability: mentors.availability,
            headline: mentors.headline,
            maxMentees: mentors.maxMentees,
            profileImageUrl: mentors.profileImageUrl,
            resumeUrl: mentors.resumeUrl,
            searchMode: mentors.searchMode,
          })
          .from(mentors)
          .where(eq(mentors.userId, userId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
  ]);

  const mentorProfile = mentorProfileRaw
    ? {
        ...mentorProfileRaw,
        profileImageUrl: await resolveStorageUrl(mentorProfileRaw.profileImageUrl),
        resumeUrl: await resolveStorageUrl(mentorProfileRaw.resumeUrl),
      }
    : null;

  return {
    id: resolvedUser.id,
    email: resolvedUser.email,
    name: resolvedUser.name,
    image: resolvedUser.image,
    isActive: resolvedUser.isActive,
    roles: resolvedUser.roles,
    menteeProfile: menteeProfile
      ? {
          ...menteeProfile,
          formData: mapMenteeProfileToFormData(menteeProfile),
        }
      : null,
    mentorProfile,
  };
}

export async function upsertCurrentMenteeProfile(
  userId: string,
  input: UpsertMenteeProfileInput,
  currentUser?: CurrentUser
) {
  await getProfileUser(userId, currentUser);
  const parsed = upsertMenteeProfileInputSchema.parse(input);
  const profilePatch = buildMenteeProfilePatch(parsed);

  const result = await db.transaction(async (tx) => {
    const [existingMentee] = await tx
      .select()
      .from(mentees)
      .where(eq(mentees.userId, userId))
      .limit(1);

    if (existingMentee) {
      const [updatedMentee] = await tx
        .update(mentees)
        .set(profilePatch)
        .where(eq(mentees.userId, userId))
        .returning();

      await tx.insert(menteesProfileAudit).values({
        menteeId: existingMentee.id,
        userId,
        oldProfileData: existingMentee,
        newProfileData: updatedMentee,
        sourceOfChange: 'mentee-profile-update',
      });

      return updatedMentee;
    }

    const [newMentee] = await tx
      .insert(mentees)
      .values({
        userId,
        ...profilePatch,
      })
      .returning();

    await tx.insert(menteesProfileAudit).values({
      menteeId: newMentee.id,
      userId,
      newProfileData: newMentee,
      sourceOfChange: 'mentee-profile-create',
    });

    const [menteeRole] = await tx
      .select()
      .from(roles)
      .where(eq(roles.name, 'mentee'))
      .limit(1);

    if (menteeRole) {
      await tx
        .insert(userRoles)
        .values({
          userId,
          roleId: menteeRole.id,
          assignedBy: userId,
        })
        .onConflictDoNothing();
    }

    return newMentee;
  });

  return {
    profile: result,
    formData: mapMenteeProfileToFormData(result),
  };
}
