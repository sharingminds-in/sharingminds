import { z } from 'zod';
import { passwordValidation } from '@/lib/validations/auth';

export const adminMentorStatusSchema = z.enum([
  'YET_TO_APPLY',
  'IN_PROGRESS',
  'VERIFIED',
  'REJECTED',
  'REVERIFICATION',
  'RESUBMITTED',
  'UPDATED_PROFILE',
]);

export const adminUpdateMentorInputSchema = z.object({
  mentorId: z.string().uuid('Invalid mentor identifier'),
  status: adminMentorStatusSchema,
  notes: z
    .string()
    .trim()
    .max(1000, 'Notes must be 1000 characters or fewer')
    .optional(),
  enableCoupon: z.boolean().optional(),
  isExpert: z.boolean().optional(),
});

export const adminUpdateMentorPricingInputSchema = z.object({
  mentorId: z.string().uuid('Invalid mentor identifier'),
  adminHourlyRateOverride: z
    .number()
    .finite()
    .min(0, 'Hourly rate cannot be negative')
    .max(10000000, 'Hourly rate is too large')
    .nullable(),
  reason: z
    .string()
    .trim()
    .max(500, 'Override reason must be 500 characters or fewer')
    .nullable()
    .optional(),
});

export const adminSendMentorCouponInputSchema = z.object({
  mentorId: z.string().uuid('Invalid mentor identifier'),
});

export const adminGetMentorAuditInputSchema = z.object({
  mentorId: z.string().uuid('Invalid mentor identifier'),
});

export const adminUpdateEnquiryInputSchema = z.object({
  enquiryId: z.string().uuid('Invalid enquiry identifier'),
  isResolved: z.boolean(),
});

export const adminPolicyUpdateItemSchema = z.object({
  key: z.string().trim().min(1, 'Policy key is required'),
  value: z.string(),
});

export const adminUpdatePoliciesInputSchema = z.object({
  updates: z
    .array(adminPolicyUpdateItemSchema)
    .min(1, 'Updates array is required'),
});

export const adminCreateMentorUserInputSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters')
    .max(160, 'Full name must be 160 characters or fewer'),
  email: z
    .string()
    .trim()
    .email('Invalid email address')
    .transform((value) => value.toLowerCase()),
  initialPassword: passwordValidation,
  phone: z
    .string()
    .trim()
    .regex(
      /^\+\d{1,4}-\d{6,15}$/,
      'Invalid phone number format. Expected +countrycode-number'
    ),
  title: z
    .string()
    .trim()
    .min(1, 'Job title is required')
    .max(160, 'Title must be 160 characters or fewer'),
  company: z
    .string()
    .trim()
    .min(1, 'Company is required')
    .max(160, 'Company must be 160 characters or fewer'),
  industry: z
    .string()
    .trim()
    .min(1, 'Industry is required')
    .max(160, 'Industry must be 160 characters or fewer'),
  experience: z
    .number()
    .int('Experience must be a whole number')
    .min(2, 'Minimum 2 years of experience is required'),
  expertise: z
    .array(
      z
        .string()
        .trim()
        .min(1, 'Expertise items cannot be empty')
        .max(120, 'Expertise items must be 120 characters or fewer')
    )
    .min(5, 'Please list at least 5 areas of expertise')
    .max(20, 'You can add up to 20 expertise items'),
  about: z.string().trim().optional(),
  linkedinUrl: z
    .string()
    .trim()
    .url('Invalid URL')
    .regex(
      /^(https?:\/\/)?(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?$/,
      'Invalid LinkedIn profile URL'
    ),
  country: z.string().trim().min(1, 'Country is required'),
  state: z.string().trim().min(1, 'State is required'),
  city: z.string().trim().min(1, 'City is required'),
  availability: z.enum(['Weekly', 'BiWeekly', 'Monthly', 'AsNeeded']),
  profileImageUrl: z.string().trim().min(1).optional(),
  resumeUrl: z.string().trim().min(1).optional(),
});

export const adminLevelSchema = z.enum(['normal', 'super']);

export const adminCreateAdminUserInputSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters')
    .max(160, 'Full name must be 160 characters or fewer'),
  email: z
    .string()
    .trim()
    .email('Invalid email address')
    .transform((value) => value.toLowerCase()),
  initialPassword: passwordValidation,
  adminLevel: adminLevelSchema.default('normal'),
});

export const adminPromoteAdminUserInputSchema = z.object({
  userId: z.string().trim().min(1, 'User identifier is required'),
});

export type AdminMentorStatus = z.infer<typeof adminMentorStatusSchema>;
export type AdminUpdateMentorInput = z.infer<
  typeof adminUpdateMentorInputSchema
>;
export type AdminUpdateMentorPricingInput = z.infer<
  typeof adminUpdateMentorPricingInputSchema
>;
export type AdminSendMentorCouponInput = z.infer<
  typeof adminSendMentorCouponInputSchema
>;
export type AdminGetMentorAuditInput = z.infer<
  typeof adminGetMentorAuditInputSchema
>;
export type AdminUpdateEnquiryInput = z.infer<
  typeof adminUpdateEnquiryInputSchema
>;
export type AdminUpdatePoliciesInput = z.infer<
  typeof adminUpdatePoliciesInputSchema
>;
export type AdminCreateMentorUserInput = z.infer<
  typeof adminCreateMentorUserInputSchema
>;
export type AdminLevel = z.infer<typeof adminLevelSchema>;
export type AdminCreateAdminUserInput = z.infer<
  typeof adminCreateAdminUserInputSchema
>;
export type AdminPromoteAdminUserInput = z.infer<
  typeof adminPromoteAdminUserInputSchema
>;
