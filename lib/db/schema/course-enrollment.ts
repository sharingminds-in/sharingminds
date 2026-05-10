import { pgTable, text, timestamp, boolean, integer, decimal, pgEnum, uuid, primaryKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { mentees } from './mentees';
import { courses, sectionContentItems } from './mentor-content';
import { users } from './users';

// Enrollment status enum
export const enrollmentStatusEnum = pgEnum('enrollment_status', [
  'ACTIVE',
  'COMPLETED',
  'DROPPED',
  'PAUSED',
  'EXPIRED'
]);

// Payment status enum
export const paymentStatusEnum = pgEnum('payment_status', [
  'PENDING',
  'COMPLETED',
  'FAILED',
  'REFUNDED',
  'CANCELLED'
]);

// Certificate status enum
export const certificateStatusEnum = pgEnum('certificate_status', [
  'NOT_EARNED',
  'EARNED',
  'ISSUED',
  'REVOKED'
]);

// Progress status enum
export const progressStatusEnum = pgEnum('progress_status', [
  'NOT_STARTED',
  'IN_PROGRESS', 
  'COMPLETED',
  'SKIPPED'
]);

// Course enrollments
export const courseEnrollments = pgTable('course_enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  menteeId: uuid('mentee_id').references(() => mentees.id, { onDelete: 'cascade' }).notNull(),
  
  // Enrollment details
  status: enrollmentStatusEnum('status').default('ACTIVE').notNull(),
  enrolledAt: timestamp('enrolled_at').defaultNow().notNull(),
  lastAccessedAt: timestamp('last_accessed_at'),
  completedAt: timestamp('completed_at'),
  expiresAt: timestamp('expires_at'),
  
  // Progress tracking
  overallProgress: decimal('overall_progress', { precision: 5, scale: 2 }).default('0.00').notNull(), // 0-100%
  timeSpentMinutes: integer('time_spent_minutes').default(0).notNull(),
  currentModuleId: uuid('current_module_id'), // Last accessed module
  currentSectionId: uuid('current_section_id'), // Last accessed section
  
  // Payment information
  paymentStatus: paymentStatusEnum('payment_status').default('PENDING').notNull(),
  paidAmount: decimal('paid_amount', { precision: 10, scale: 2 }),
  currency: text('currency').default('USD'),
  paymentIntentId: text('payment_intent_id'), // Payment provider intent ID
  
  // Metadata
  enrollmentNotes: text('enrollment_notes'), // Admin notes
  isGift: boolean('is_gift').default(false),
  giftFromUserId: text('gift_from_user_id').references(() => users.id),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Course progress tracking (detailed module/section level)
export const courseProgress = pgTable('course_progress', {
  id: uuid('id').primaryKey().defaultRandom(),
  enrollmentId: uuid('enrollment_id').references(() => courseEnrollments.id, { onDelete: 'cascade' }).notNull(),
  contentItemId: uuid('content_item_id').references(() => sectionContentItems.id, { onDelete: 'cascade' }).notNull(),
  
  // Progress details
  status: progressStatusEnum('status').default('NOT_STARTED').notNull(),
  progressPercentage: decimal('progress_percentage', { precision: 5, scale: 2 }).default('0.00').notNull(),
  timeSpentSeconds: integer('time_spent_seconds').default(0).notNull(),
  
  // For video content
  lastWatchedPosition: integer('last_watched_position_seconds').default(0), // Video position in seconds
  watchCount: integer('watch_count').default(0).notNull(),
  
  // Completion tracking
  firstStartedAt: timestamp('first_started_at'),
  lastAccessedAt: timestamp('last_accessed_at'),
  completedAt: timestamp('completed_at'),
  
  // Notes and bookmarks
  studentNotes: text('student_notes'),
  bookmarkedAt: timestamp('bookmarked_at'),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Course categories
export const courseCategories = pgTable('course_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  iconUrl: text('icon_url'),
  color: text('color'), // Hex color for category theming
  parentCategoryId: uuid('parent_category_id').references(() => courseCategories.id), // For subcategories
  orderIndex: integer('order_index').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Course category relationships (many-to-many)
export const courseCategoryRelations = pgTable('course_category_relations', {
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  categoryId: uuid('category_id').references(() => courseCategories.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.courseId, table.categoryId] })
}));

// Course reviews and ratings
export const courseReviews = pgTable('course_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  menteeId: uuid('mentee_id').references(() => mentees.id, { onDelete: 'cascade' }).notNull(),
  enrollmentId: uuid('enrollment_id').references(() => courseEnrollments.id, { onDelete: 'cascade' }).notNull(),
  
  // Review content
  rating: integer('rating').notNull(), // 1-5 stars
  title: text('title'),
  review: text('review'),
  
  // Review metadata
  isVerifiedPurchase: boolean('is_verified_purchase').default(true).notNull(),
  isPublished: boolean('is_published').default(true).notNull(),
  helpfulVotes: integer('helpful_votes').default(0).notNull(),
  reportCount: integer('report_count').default(0).notNull(),
  
  // Instructor response
  instructorResponse: text('instructor_response'),
  instructorRespondedAt: timestamp('instructor_responded_at'),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Content item reviews (per lesson/item)
export const contentItemReviews = pgTable('content_item_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  contentItemId: uuid('content_item_id').references(() => sectionContentItems.id, { onDelete: 'cascade' }).notNull(),
  menteeId: uuid('mentee_id').references(() => mentees.id, { onDelete: 'cascade' }).notNull(),
  enrollmentId: uuid('enrollment_id').references(() => courseEnrollments.id, { onDelete: 'cascade' }).notNull(),

  rating: integer('rating').notNull(), // 1-5 stars
  title: text('title'),
  review: text('review'),

  isVerifiedPurchase: boolean('is_verified_purchase').default(true).notNull(),
  isPublished: boolean('is_published').default(true).notNull(),
  helpfulVotes: integer('helpful_votes').default(0).notNull(),
  reportCount: integer('report_count').default(0).notNull(),

  instructorResponse: text('instructor_response'),
  instructorRespondedAt: timestamp('instructor_responded_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const courseReviewHelpfulVotes = pgTable('course_review_helpful_votes', {
  reviewId: uuid('review_id').references(() => courseReviews.id, { onDelete: 'cascade' }).notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.reviewId, table.userId] }),
}));

// Course certificates
export const courseCertificates = pgTable('course_certificates', {
  id: uuid('id').primaryKey().defaultRandom(),
  enrollmentId: uuid('enrollment_id').references(() => courseEnrollments.id, { onDelete: 'cascade' }).notNull().unique(),
  certificateNumber: text('certificate_number').notNull().unique(), // Auto-generated unique number
  
  // Certificate details
  status: certificateStatusEnum('status').default('NOT_EARNED').notNull(),
  earnedAt: timestamp('earned_at'),
  issuedAt: timestamp('issued_at'),
  expiresAt: timestamp('expires_at'), // For certificates with expiration
  
  // Certificate metadata
  finalScore: decimal('final_score', { precision: 5, scale: 2 }), // Final grade/score
  certificateUrl: text('certificate_url'), // PDF certificate URL
  verificationCode: text('verification_code'), // For certificate verification
  
  // Template and styling
  templateId: text('template_id'), // Certificate template to use
  customData: text('custom_data'), // JSON for template customization
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Course wishlist
export const courseWishlist = pgTable('course_wishlist', {
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  menteeId: uuid('mentee_id').references(() => mentees.id, { onDelete: 'cascade' }).notNull(),
  
  // Wishlist metadata
  addedAt: timestamp('added_at').defaultNow().notNull(),
  priority: integer('priority').default(1).notNull(), // 1-5 priority level
  notes: text('notes'), // Personal notes about why they want this course
  
  // Notification preferences
  notifyOnDiscount: boolean('notify_on_discount').default(true).notNull(),
  notifyOnUpdate: boolean('notify_on_update').default(false).notNull(),
}, (table) => ({
  // Composite primary key to prevent duplicate wishlist entries
  pk: primaryKey({ columns: [table.courseId, table.menteeId] })
}));

// Payment transactions
export const paymentTransactions = pgTable('payment_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  enrollmentId: uuid('enrollment_id').references(() => courseEnrollments.id, { onDelete: 'cascade' }).notNull(),
  
  // Transaction details
  transactionId: text('transaction_id').notNull().unique(), // External payment provider ID
  paymentProvider: text('payment_provider').default('stripe').notNull(), // 'stripe', 'paypal', etc.
  paymentMethod: text('payment_method'), // 'card', 'bank_transfer', etc.
  
  // Amount details
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').default('USD').notNull(),
  originalAmount: decimal('original_amount', { precision: 10, scale: 2 }), // Before discounts
  discountAmount: decimal('discount_amount', { precision: 10, scale: 2 }).default('0.00'),
  taxAmount: decimal('tax_amount', { precision: 10, scale: 2 }).default('0.00'),
  
  // Transaction status
  status: paymentStatusEnum('status').notNull(),
  failureReason: text('failure_reason'),
  
  // Metadata
  paymentIntentId: text('payment_intent_id'), // Payment provider intent ID
  receiptUrl: text('receipt_url'),
  invoiceId: text('invoice_id'),
  
  // Timestamps
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Course analytics and engagement tracking
export const courseAnalytics = pgTable('course_analytics', {
  id: uuid('id').primaryKey().defaultRandom(),
  enrollmentId: uuid('enrollment_id').references(() => courseEnrollments.id, { onDelete: 'cascade' }).notNull(),
  contentItemId: uuid('content_item_id').references(() => sectionContentItems.id, { onDelete: 'cascade' }),
  
  // Event tracking
  eventType: text('event_type').notNull(), // 'view', 'play', 'pause', 'complete', 'download', etc.
  eventData: text('event_data'), // JSON data for the event
  
  // Session tracking
  sessionId: text('session_id').notNull(),
  deviceType: text('device_type'), // 'desktop', 'mobile', 'tablet'
  browserInfo: text('browser_info'),
  ipAddress: text('ip_address'),
  
  // Timing
  duration: integer('duration_seconds'), // How long the event lasted
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const courseEnrollmentsRelations = relations(courseEnrollments, ({ one, many }) => ({
  course: one(courses, {
    fields: [courseEnrollments.courseId],
    references: [courses.id],
  }),
  mentee: one(mentees, {
    fields: [courseEnrollments.menteeId],
    references: [mentees.id],
  }),
  giftFromUser: one(users, {
    fields: [courseEnrollments.giftFromUserId],
    references: [users.id],
  }),
  progress: many(courseProgress),
  certificate: one(courseCertificates),
  reviews: many(courseReviews),
  transactions: many(paymentTransactions),
  analytics: many(courseAnalytics),
}));

export const courseProgressRelations = relations(courseProgress, ({ one }) => ({
  enrollment: one(courseEnrollments, {
    fields: [courseProgress.enrollmentId],
    references: [courseEnrollments.id],
  }),
  contentItem: one(sectionContentItems, {
    fields: [courseProgress.contentItemId],
    references: [sectionContentItems.id],
  }),
}));

export const courseCategoriesRelations = relations(courseCategories, ({ one, many }) => ({
  parentCategory: one(courseCategories, {
    fields: [courseCategories.parentCategoryId],
    references: [courseCategories.id],
  }),
  subcategories: many(courseCategories),
  courseRelations: many(courseCategoryRelations),
}));

export const courseCategoryRelationsRelations = relations(courseCategoryRelations, ({ one }) => ({
  course: one(courses, {
    fields: [courseCategoryRelations.courseId],
    references: [courses.id],
  }),
  category: one(courseCategories, {
    fields: [courseCategoryRelations.categoryId],
    references: [courseCategories.id],
  }),
}));

export const courseReviewsRelations = relations(courseReviews, ({ one }) => ({
  course: one(courses, {
    fields: [courseReviews.courseId],
    references: [courses.id],
  }),
  mentee: one(mentees, {
    fields: [courseReviews.menteeId],
    references: [mentees.id],
  }),
  enrollment: one(courseEnrollments, {
    fields: [courseReviews.enrollmentId],
    references: [courseEnrollments.id],
  }),
}));

export const courseCertificatesRelations = relations(courseCertificates, ({ one }) => ({
  enrollment: one(courseEnrollments, {
    fields: [courseCertificates.enrollmentId],
    references: [courseEnrollments.id],
  }),
}));

export const courseWishlistRelations = relations(courseWishlist, ({ one }) => ({
  course: one(courses, {
    fields: [courseWishlist.courseId],
    references: [courses.id],
  }),
  mentee: one(mentees, {
    fields: [courseWishlist.menteeId],
    references: [mentees.id],
  }),
}));

export const paymentTransactionsRelations = relations(paymentTransactions, ({ one }) => ({
  enrollment: one(courseEnrollments, {
    fields: [paymentTransactions.enrollmentId],
    references: [courseEnrollments.id],
  }),
}));

export const courseAnalyticsRelations = relations(courseAnalytics, ({ one }) => ({
  enrollment: one(courseEnrollments, {
    fields: [courseAnalytics.enrollmentId],
    references: [courseEnrollments.id],
  }),
  contentItem: one(sectionContentItems, {
    fields: [courseAnalytics.contentItemId],
    references: [sectionContentItems.id],
  }),
}));

// Type exports
export type CourseEnrollment = typeof courseEnrollments.$inferSelect;
export type NewCourseEnrollment = typeof courseEnrollments.$inferInsert;
export type CourseProgress = typeof courseProgress.$inferSelect;
export type NewCourseProgress = typeof courseProgress.$inferInsert;
export type CourseCategory = typeof courseCategories.$inferSelect;
export type NewCourseCategory = typeof courseCategories.$inferInsert;
export type CourseReview = typeof courseReviews.$inferSelect;
export type NewCourseReview = typeof courseReviews.$inferInsert;
export type CourseCertificate = typeof courseCertificates.$inferSelect;
export type NewCourseCertificate = typeof courseCertificates.$inferInsert;
export type CourseWishlist = typeof courseWishlist.$inferSelect;
export type NewCourseWishlist = typeof courseWishlist.$inferInsert;
export type PaymentTransaction = typeof paymentTransactions.$inferSelect;
export type NewPaymentTransaction = typeof paymentTransactions.$inferInsert;
export type CourseAnalytics = typeof courseAnalytics.$inferSelect;
export type NewCourseAnalytics = typeof courseAnalytics.$inferInsert;

// Enum type exports
export type EnrollmentStatus = typeof enrollmentStatusEnum.enumValues[number];
export type PaymentStatus = typeof paymentStatusEnum.enumValues[number];
export type CertificateStatus = typeof certificateStatusEnum.enumValues[number];
export type ProgressStatus = typeof progressStatusEnum.enumValues[number];
