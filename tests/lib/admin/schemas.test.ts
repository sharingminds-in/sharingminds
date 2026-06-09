import { describe, expect, it } from 'vitest';

import {
  adminCreateAdminUserInputSchema,
  adminCreateMentorUserInputSchema,
  adminPromoteAdminUserInputSchema,
  adminUpdateMentorPricingInputSchema,
} from '@/lib/admin/server/schemas';

const VALID_INPUT = {
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  initialPassword: 'mentor123',
  phone: '+91-9999999999',
  title: 'Chief Scientist',
  company: 'Analytical Engines',
  industry: 'ITSoftware',
  experience: 12,
  expertise: [
    'Mathematics',
    'Programming',
    'Algorithms',
    'Leadership',
    'Research',
  ],
  about: 'Builds analytical engines.',
  linkedinUrl: 'https://www.linkedin.com/in/ada-lovelace',
  country: 'India',
  state: 'Karnataka',
  city: 'Bengaluru',
  availability: 'Weekly',
  profileImageUrl: 'profiles/ada.png',
};

describe('adminCreateMentorUserInputSchema', () => {
  it('accepts the full mentor application profile while keeping resume optional', () => {
    expect(adminCreateMentorUserInputSchema.parse(VALID_INPUT)).toMatchObject(
      VALID_INPUT
    );
  });

  it('requires the same core mentor profile fields as the public application form', () => {
    const result = adminCreateMentorUserInputSchema.safeParse({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      initialPassword: 'mentor123',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors).toMatchObject({
        phone: expect.any(Array),
        title: expect.any(Array),
        company: expect.any(Array),
        industry: expect.any(Array),
        experience: expect.any(Array),
        expertise: expect.any(Array),
        linkedinUrl: expect.any(Array),
        country: expect.any(Array),
        state: expect.any(Array),
        city: expect.any(Array),
        availability: expect.any(Array),
      });
    }
  });

  it('requires at least five expertise areas', () => {
    const result = adminCreateMentorUserInputSchema.safeParse({
      ...VALID_INPUT,
      expertise: ['Mathematics', 'Programming'],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.expertise).toContain(
        'Please list at least 5 areas of expertise'
      );
    }
  });
});

describe('adminCreateAdminUserInputSchema', () => {
  it('accepts a normal admin account payload and normalizes email', () => {
    expect(
      adminCreateAdminUserInputSchema.parse({
        fullName: 'Grace Hopper',
        email: 'Grace@Example.COM',
        initialPassword: 'admin123',
        adminLevel: 'normal',
      })
    ).toEqual({
      fullName: 'Grace Hopper',
      email: 'grace@example.com',
      initialPassword: 'admin123',
      adminLevel: 'normal',
    });
  });

  it('accepts super admin as an explicit admin level', () => {
    expect(
      adminCreateAdminUserInputSchema.parse({
        fullName: 'Katherine Johnson',
        email: 'katherine@example.com',
        initialPassword: 'admin123',
        adminLevel: 'super',
      }).adminLevel
    ).toBe('super');
  });

  it('rejects unknown admin levels', () => {
    const result = adminCreateAdminUserInputSchema.safeParse({
      fullName: 'Grace Hopper',
      email: 'grace@example.com',
      initialPassword: 'admin123',
      adminLevel: 'owner',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.adminLevel).toBeDefined();
    }
  });
});

describe('adminUpdateMentorPricingInputSchema', () => {
  it('accepts an override or a null value to clear it', () => {
    expect(
      adminUpdateMentorPricingInputSchema.parse({
        mentorId: '7b481b55-4f25-40e1-9d95-73f44bb6fda4',
        adminHourlyRateOverride: 1500,
        reason: 'Platform pricing agreement',
      })
    ).toMatchObject({
      adminHourlyRateOverride: 1500,
      reason: 'Platform pricing agreement',
    });

    expect(
      adminUpdateMentorPricingInputSchema.parse({
        mentorId: '7b481b55-4f25-40e1-9d95-73f44bb6fda4',
        adminHourlyRateOverride: null,
      }).adminHourlyRateOverride
    ).toBeNull();
  });

  it('rejects negative override rates', () => {
    expect(
      adminUpdateMentorPricingInputSchema.safeParse({
        mentorId: '7b481b55-4f25-40e1-9d95-73f44bb6fda4',
        adminHourlyRateOverride: -1,
      }).success
    ).toBe(false);
  });
});

describe('adminPromoteAdminUserInputSchema', () => {
  it('accepts a target user identifier', () => {
    expect(
      adminPromoteAdminUserInputSchema.parse({
        userId: 'admin-user-123',
      })
    ).toEqual({
      userId: 'admin-user-123',
    });
  });

  it('rejects an empty target user identifier', () => {
    const result = adminPromoteAdminUserInputSchema.safeParse({
      userId: '',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.userId).toBeDefined();
    }
  });
});
