import { describe, expect, it } from 'vitest';

import {
  isAdminMentorCreateFormDirty,
  isAdminUserCreateFormDirty,
} from '@/lib/admin/user-form-state';

const EMPTY_FORM = {
  fullName: '',
  email: '',
  initialPassword: '',
  phoneCountryCode: '',
  phone: '',
  countryId: '101',
  stateId: '',
  cityId: '',
  title: '',
  company: '',
  industry: '',
  otherIndustry: '',
  experience: '',
  expertise: '',
  about: '',
  linkedinUrl: '',
  availability: '',
  profilePicture: null,
  resume: null,
};

describe('isAdminMentorCreateFormDirty', () => {
  it('treats the auto-selected default country as pristine', () => {
    expect(isAdminMentorCreateFormDirty(EMPTY_FORM, '101')).toBe(false);
  });

  it('detects typed values as dirty', () => {
    expect(
      isAdminMentorCreateFormDirty(
        {
          ...EMPTY_FORM,
          fullName: 'Ada Lovelace',
        },
        '101'
      )
    ).toBe(true);
  });

  it('detects uploaded files as dirty', () => {
    expect(
      isAdminMentorCreateFormDirty(
        {
          ...EMPTY_FORM,
          profilePicture: {} as File,
        },
        '101'
      )
    ).toBe(true);
  });
});

const EMPTY_ADMIN_FORM = {
  fullName: '',
  email: '',
  initialPassword: '',
  adminLevel: 'normal' as const,
};

describe('isAdminUserCreateFormDirty', () => {
  it('treats the default normal-admin form as pristine', () => {
    expect(isAdminUserCreateFormDirty(EMPTY_ADMIN_FORM)).toBe(false);
  });

  it('detects typed account details as dirty', () => {
    expect(
      isAdminUserCreateFormDirty({
        ...EMPTY_ADMIN_FORM,
        email: 'admin@example.com',
      })
    ).toBe(true);
  });

  it('detects admin-level changes as dirty', () => {
    expect(
      isAdminUserCreateFormDirty({
        ...EMPTY_ADMIN_FORM,
        adminLevel: 'super',
      })
    ).toBe(true);
  });
});
