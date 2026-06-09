import { pgTable, text, timestamp, boolean, integer, decimal, pgEnum, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

// Define verification status enum
export const verificationStatusEnum = pgEnum('verification_status', [
  'YET_TO_APPLY',
  'IN_PROGRESS',
  'VERIFIED',
  'REJECTED',
  'REVERIFICATION',
  'RESUBMITTED',
  'UPDATED_PROFILE'
]);

export const mentorSearchModeEnum = pgEnum('mentor_search_mode', [
  'AI_SEARCH',
  'EXCLUSIVE_SEARCH',
]);

export const mentorCreationSourceEnum = pgEnum('mentor_creation_source', [
  'SELF_REGISTERED',
  'ADMIN_CREATED',
]);

export const mentors = pgTable('mentors', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),

  // Professional information
  title: text('title'), // e.g., "Senior Software Engineer"
  company: text('company'),
  industry: text('industry'),
  expertise: text('expertise'), // JSON array of expertise areas
  experience: integer('experience_years'), // Years of experience

  // Mentoring details
  hourlyRate: decimal('hourly_rate', { precision: 10, scale: 2 }),
  adminHourlyRateOverride: decimal('admin_hourly_rate_override', {
    precision: 10,
    scale: 2,
  }),
  rateOverrideReason: text('rate_override_reason'),
  rateOverriddenAt: timestamp('rate_overridden_at'),
  rateOverriddenBy: text('rate_overridden_by').references(() => users.id, {
    onDelete: 'set null',
  }),
  currency: text('currency').default('USD'),
  availability: text('availability'), // JSON for availability schedule
  maxMentees: integer('max_mentees').default(10),

  // Profile details
  headline: text('headline'), // Short professional headline
  about: text('about'), // Detailed about section
  linkedinUrl: text('linkedin_url'),
  githubUrl: text('github_url'),
  websiteUrl: text('website_url'),

  // New registration fields
  fullName: text('full_name'),
  email: text('email'),
  phone: text('phone'),
  city: text('city'),
  state: text('state'),
  country: text('country'),
  profileImageUrl: text('profile_image_url'), // URL to uploaded profile picture
  bannerImageUrl: text('banner_image_url'), // URL to uploaded banner/cover photo (4:1 ratio recommended)
  resumeUrl: text('resume_url'), // URL to uploaded resume

  // Verification and status
  isVerified: boolean('is_verified').default(false),
  verificationStatus: verificationStatusEnum('verification_status').default('YET_TO_APPLY').notNull(),
  verificationNotes: text('verification_notes'), // Admin notes for rejected/reverification requests
  isAvailable: boolean('is_available').default(true),
  paymentStatus: text('payment_status').default('PENDING').notNull(),
  couponCode: text('coupon_code'),
  isCouponCodeEnabled: boolean('is_coupon_code_enabled').default(false).notNull(),
  isExpert: boolean('is_expert').default(false).notNull(),
  searchMode: mentorSearchModeEnum('search_mode').default('AI_SEARCH').notNull(),
  creationSource: mentorCreationSourceEnum('creation_source')
    .default('SELF_REGISTERED')
    .notNull(),
  createdByAdminId: text('created_by_admin_id').references(() => users.id, {
    onDelete: 'set null',
  }),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const mentorsRelations = relations(mentors, ({ one }) => ({
  user: one(users, {
    fields: [mentors.userId],
    references: [users.id],
  }),
}));

export type Mentor = typeof mentors.$inferSelect;
export type NewMentor = typeof mentors.$inferInsert;
export type VerificationStatus = typeof verificationStatusEnum.enumValues[number];
export type MentorSearchMode = typeof mentorSearchModeEnum.enumValues[number];
export type MentorCreationSource =
  typeof mentorCreationSourceEnum.enumValues[number];
