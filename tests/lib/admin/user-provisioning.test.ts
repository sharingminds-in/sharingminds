import { describe, expect, it } from 'vitest';

import {
  buildAdminCreatedMentorProfileValues,
  splitAdminCreatedMentorName,
} from '@/lib/admin/user-provisioning';

describe('splitAdminCreatedMentorName', () => {
  it('splits the first name from the remaining surname segments', () => {
    expect(splitAdminCreatedMentorName('Ada Lovelace Byron')).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace Byron',
    });
  });

  it('returns a null surname when only one name is provided', () => {
    expect(splitAdminCreatedMentorName('Ada')).toEqual({
      firstName: 'Ada',
      lastName: null,
    });
  });
});

describe('buildAdminCreatedMentorProfileValues', () => {
  it('creates a verified admin-created mentor profile payload', () => {
    const now = new Date('2026-05-17T00:00:00.000Z');

    expect(
      buildAdminCreatedMentorProfileValues({
        userId: 'user-123',
        adminId: 'admin-123',
        now,
        input: {
          fullName: 'Ada Lovelace',
          email: 'ada@example.com',
          phone: '+91-9999999999',
          title: 'Chief Scientist',
          company: 'Analytical Engines',
          industry: 'Computing',
          expertise: [
            'Mathematics',
            'Programming',
            'Algorithms',
            'Leadership',
            'Research',
          ],
          experience: 12,
          about: 'Builds analytical engines.',
          linkedinUrl: 'https://www.linkedin.com/in/ada-lovelace',
          country: 'India',
          state: 'Karnataka',
          city: 'Bengaluru',
          availability: 'Weekly',
          profileImageUrl: 'profiles/ada.png',
          resumeUrl: 'mentors/resumes/ada.pdf',
        },
      })
    ).toMatchObject({
      userId: 'user-123',
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+91-9999999999',
      title: 'Chief Scientist',
      company: 'Analytical Engines',
      industry: 'Computing',
      expertise:
        '["Mathematics","Programming","Algorithms","Leadership","Research"]',
      experience: 12,
      about: 'Builds analytical engines.',
      linkedinUrl: 'https://www.linkedin.com/in/ada-lovelace',
      country: 'India',
      state: 'Karnataka',
      city: 'Bengaluru',
      availability: 'Weekly',
      profileImageUrl: 'profiles/ada.png',
      resumeUrl: 'mentors/resumes/ada.pdf',
      verificationStatus: 'VERIFIED',
      isVerified: true,
      creationSource: 'ADMIN_CREATED',
      createdByAdminId: 'admin-123',
      updatedAt: now,
    });
  });
});
