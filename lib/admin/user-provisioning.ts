import type { AdminCreateMentorUserInput } from './server/schemas';

interface BuildAdminCreatedMentorProfileValuesInput {
  userId: string;
  adminId: string;
  input: Omit<AdminCreateMentorUserInput, 'initialPassword'>;
  now?: Date;
}

export function splitAdminCreatedMentorName(fullName: string) {
  return splitAdminCreatedUserName(fullName);
}

export function splitAdminCreatedUserName(fullName: string) {
  const [firstName, ...remainingNameParts] = fullName.trim().split(/\s+/);

  return {
    firstName,
    lastName: remainingNameParts.length
      ? remainingNameParts.join(' ')
      : null,
  };
}

export function buildAdminCreatedMentorProfileValues({
  userId,
  adminId,
  input,
  now = new Date(),
}: BuildAdminCreatedMentorProfileValuesInput) {
  return {
    userId,
    title: input.title,
    company: input.company,
    industry: input.industry,
    expertise: JSON.stringify(input.expertise),
    experience: input.experience,
    about: input.about ?? null,
    linkedinUrl: input.linkedinUrl,
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    country: input.country,
    state: input.state,
    city: input.city,
    availability: input.availability,
    profileImageUrl: input.profileImageUrl ?? null,
    resumeUrl: input.resumeUrl ?? null,
    verificationStatus: 'VERIFIED' as const,
    isVerified: true,
    creationSource: 'ADMIN_CREATED' as const,
    createdByAdminId: adminId,
    updatedAt: now,
  };
}
