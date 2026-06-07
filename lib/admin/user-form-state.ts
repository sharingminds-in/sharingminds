export interface AdminMentorCreateFormState {
  fullName: string;
  email: string;
  initialPassword: string;
  phoneCountryCode: string;
  phone: string;
  countryId: string;
  stateId: string;
  cityId: string;
  title: string;
  company: string;
  industry: string;
  otherIndustry: string;
  experience: string;
  expertise: string;
  about: string;
  linkedinUrl: string;
  availability: string;
  profilePicture: File | null;
  resume: File | null;
}

export interface AdminUserCreateFormState {
  fullName: string;
  email: string;
  initialPassword: string;
  adminLevel: 'normal' | 'super';
}

export function isAdminMentorCreateFormDirty(
  form: AdminMentorCreateFormState,
  defaultCountryId: string
) {
  return (
    form.fullName !== '' ||
    form.email !== '' ||
    form.initialPassword !== '' ||
    form.phoneCountryCode !== '' ||
    form.phone !== '' ||
    form.countryId !== defaultCountryId ||
    form.stateId !== '' ||
    form.cityId !== '' ||
    form.title !== '' ||
    form.company !== '' ||
    form.industry !== '' ||
    form.otherIndustry !== '' ||
    form.experience !== '' ||
    form.expertise !== '' ||
    form.about !== '' ||
    form.linkedinUrl !== '' ||
    form.availability !== '' ||
    form.profilePicture !== null ||
    form.resume !== null
  );
}

export function isAdminUserCreateFormDirty(form: AdminUserCreateFormState) {
  return (
    form.fullName !== '' ||
    form.email !== '' ||
    form.initialPassword !== '' ||
    form.adminLevel !== 'normal'
  );
}
