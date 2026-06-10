import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';

import {
  AccessPolicyError,
  assertMenteeFeatureAccess as assertSharedMenteeFeatureAccess,
} from '@/lib/access-policy/server';
import { db } from '@/lib/db';
import {
  findBookingAttributionForSession,
  recordRecommendationEvent,
} from '@/lib/infinity-ai/repository';
import {
  contentItemReviews,
  courseCertificates,
  courseEnrollments,
  courseReviewHelpfulVotes,
  courseReviews,
  courseAnalytics,
  courseModules,
  courseProgress,
  courseSections,
  courses,
  mentees,
  mentorContent,
  mentors,
  paymentTransactions,
  reviewQuestions,
  reviewRatings,
  reviews,
  roles,
  sectionContentItems,
  sessions,
  userRoles,
  users,
} from '@/lib/db/schema';
import { getUserWithRoles } from '@/lib/db/user-helpers';
import { canEnrollInCourse } from '@/lib/courses/status';
import {
  calculateCourseOverallProgress,
  calculateCoursePriceSummary,
  canReviewCourseEnrollment,
} from '@/lib/learning/course-runtime';
import { calculateWeightedReviewScore, canRequestReviewQuestions, resolveReviewContext } from '@/lib/learning/reviews';
import { MENTEE_FEATURE_KEYS, type MenteeFeatureKey } from '@/lib/mentee/access-policy';
import { FEATURE_KEYS } from '@/lib/subscriptions/feature-keys';
import { getPlanFeatures } from '@/lib/subscriptions/enforcement';
import {
  consumeFeature,
  enforceFeature,
  isSubscriptionPolicyError,
} from '@/lib/subscriptions/policy-runtime';
import { resolveStorageUrl } from '@/lib/storage';
import { safeJsonParse } from '@/lib/utils/safe-json';
import { isRazorpayEnabled } from '@/lib/payments/config';
import {
  courseEnrollmentStatusInputSchema,
  courseProgressInputSchema,
  enrollCourseInputSchema,
  listEnrolledCoursesInputSchema,
  listReviewQuestionsInputSchema,
  removeSavedItemInputSchema,
  submitContentItemReviewInputSchema,
  submitCourseReviewInputSchema,
  submitSessionReviewInputSchema,
  toggleCourseReviewHelpfulInputSchema,
  updateCourseProgressInputSchema,
  type CourseEnrollmentStatusInput,
  type CourseProgressInput,
  type EnrollCourseInput,
  type ListEnrolledCoursesInput,
  type ListReviewQuestionsInput,
  type RemoveSavedItemInput,
  type SubmitContentItemReviewInput,
  type SubmitCourseReviewInput,
  type SubmitSessionReviewInput,
  type ToggleCourseReviewHelpfulInput,
  type UpdateCourseProgressInput,
} from './schemas';

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getUserWithRoles>>>;

const DEFAULT_STATISTICS = {
  totalCourses: 0,
  activeCourses: 0,
  completedCourses: 0,
  totalTimeSpent: 0,
  averageProgress: 0,
  totalCertificates: 0,
};

export class LearningServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly data?: unknown
  ) {
    super(message);
    this.name = 'LearningServiceError';
  }
}

function assertLearning(
  condition: unknown,
  status: number,
  message: string,
  data?: unknown
): asserts condition {
  if (!condition) {
    throw new LearningServiceError(status, message, data);
  }
}

function toLearningSubscriptionError(error: unknown): never {
  if (isSubscriptionPolicyError(error)) {
    const message =
      typeof error.payload?.error === 'string'
        ? error.payload.error
        : 'Subscription policy prevented this action';

    throw new LearningServiceError(error.status, message, error.payload);
  }

  throw error;
}

async function getLearningUser(
  userId: string,
  currentUser?: CurrentUser
): Promise<CurrentUser> {
  const resolvedUser = currentUser ?? (await getUserWithRoles(userId));
  assertLearning(resolvedUser, 401, 'Authentication required');
  return resolvedUser;
}

async function assertMenteeFeatureAccess(
  userId: string,
  feature: MenteeFeatureKey,
  currentUser?: CurrentUser
) {
  try {
    const result = await assertSharedMenteeFeatureAccess({
      userId,
      feature,
      currentUser,
      source: `learning.${feature}`,
    });

    return result.currentUser;
  } catch (error) {
    if (error instanceof AccessPolicyError) {
      throw new LearningServiceError(error.status, error.message, error.data);
    }

    throw error;
  }
}

async function assertLearningWorkspaceAccess(
  userId: string,
  currentUser?: CurrentUser
) {
  return assertMenteeFeatureAccess(
    userId,
    MENTEE_FEATURE_KEYS.learningWorkspace,
    currentUser
  );
}

async function getOrCreateMenteeId(
  userId: string,
  currentUser?: CurrentUser
): Promise<{ currentUser: CurrentUser; menteeId: string }> {
  const resolvedUser = await assertLearningWorkspaceAccess(userId, currentUser);

  const existingMentee = await db
    .select({ id: mentees.id })
    .from(mentees)
    .where(eq(mentees.userId, userId))
    .limit(1);

  if (existingMentee[0]?.id) {
    return {
      currentUser: resolvedUser,
      menteeId: existingMentee[0].id,
    };
  }

  const [createdMentee] = await db
    .insert(mentees)
    .values({
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: mentees.id });

  return {
    currentUser: resolvedUser,
    menteeId: createdMentee.id,
  };
}

async function assignMenteeRoleIfAvailable(userId: string) {
  const [menteeRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.name, 'mentee'))
    .limit(1);

  if (!menteeRole) {
    return;
  }

  await db
    .insert(userRoles)
    .values({
      userId,
      roleId: menteeRole.id,
      assignedBy: userId,
    })
    .onConflictDoNothing();
}

async function getExistingMenteeId(userId: string) {
  const [existingMentee] = await db
    .select({ id: mentees.id })
    .from(mentees)
    .where(eq(mentees.userId, userId))
    .limit(1);

  return existingMentee?.id ?? null;
}

async function getRequiredMenteeId(
  userId: string,
  currentUser?: CurrentUser
): Promise<{ currentUser: CurrentUser; menteeId: string }> {
  const resolvedUser = await assertLearningWorkspaceAccess(userId, currentUser);

  const menteeId = await getExistingMenteeId(userId);
  assertLearning(menteeId, 403, 'Mentee profile not found');

  return {
    currentUser: resolvedUser,
    menteeId,
  };
}

async function getOrCreateCourseAccessMenteeId(
  userId: string,
  currentUser?: CurrentUser
): Promise<{ currentUser: CurrentUser; menteeId: string }> {
  const resolvedUser = await getLearningUser(userId, currentUser);
  const existingMenteeId = await getExistingMenteeId(userId);

  if (existingMenteeId) {
    return {
      currentUser: resolvedUser,
      menteeId: existingMenteeId,
    };
  }

  const [createdMentee] = await db
    .insert(mentees)
    .values({
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: mentees.id });

  await assignMenteeRoleIfAvailable(userId);

  return {
    currentUser: resolvedUser,
    menteeId: createdMentee.id,
  };
}

async function ensureContentItemInCourse(courseId: string, itemId: string) {
  const existing = await db
    .select({ id: sectionContentItems.id })
    .from(sectionContentItems)
    .innerJoin(courseSections, eq(sectionContentItems.sectionId, courseSections.id))
    .innerJoin(courseModules, eq(courseSections.moduleId, courseModules.id))
    .innerJoin(courses, eq(courseModules.courseId, courses.id))
    .where(and(eq(sectionContentItems.id, itemId), eq(courses.id, courseId)))
    .limit(1);

  return existing.length > 0;
}

function normalizeStatistics(
  statistics:
    | {
        totalCourses: number;
        activeCourses: number;
        completedCourses: number;
        totalTimeSpent: number | string | null;
        averageProgress: number | string | null;
        totalCertificates: number;
      }
    | undefined
) {
  if (!statistics) {
    return DEFAULT_STATISTICS;
  }

  return {
    totalCourses: statistics.totalCourses ?? 0,
    activeCourses: statistics.activeCourses ?? 0,
    completedCourses: statistics.completedCourses ?? 0,
    totalTimeSpent: Number(statistics.totalTimeSpent) || 0,
    averageProgress: Number(statistics.averageProgress) || 0,
    totalCertificates: statistics.totalCertificates ?? 0,
  };
}

export async function getCourseEnrollmentStatus(
  userId: string,
  input: CourseEnrollmentStatusInput,
  currentUser?: CurrentUser
) {
  const parsed = courseEnrollmentStatusInputSchema.parse(input);
  await getLearningUser(userId, currentUser);

  const menteeId = await getExistingMenteeId(userId);

  if (!menteeId) {
    return {
      isEnrolled: false,
      enrollment: null,
    };
  }

  const [enrollment] = await db
    .select({
      id: courseEnrollments.id,
      status: courseEnrollments.status,
      paymentStatus: courseEnrollments.paymentStatus,
      enrolledAt: courseEnrollments.enrolledAt,
      overallProgress: courseEnrollments.overallProgress,
      timeSpentMinutes: courseEnrollments.timeSpentMinutes,
      lastAccessedAt: courseEnrollments.lastAccessedAt,
    })
    .from(courseEnrollments)
    .where(
      and(
        eq(courseEnrollments.courseId, parsed.courseId),
        eq(courseEnrollments.menteeId, menteeId)
      )
    )
    .limit(1);

  if (!enrollment) {
    return {
      isEnrolled: false,
      enrollment: null,
    };
  }

  return {
    isEnrolled: true,
    enrollment: {
      ...enrollment,
      overallProgress: Number(enrollment.overallProgress) || 0,
      timeSpentMinutes: enrollment.timeSpentMinutes || 0,
    },
  };
}

export async function enrollInCourse(
  userId: string,
  input: EnrollCourseInput,
  currentUser?: CurrentUser,
  paymentOptions: {
    paymentConfirmed?: boolean;
    paymentIntentId?: string;
    providerPaymentId?: string;
  } = {}
) {
  const parsed = enrollCourseInputSchema.parse(input);
  const { menteeId } = await getOrCreateCourseAccessMenteeId(userId, currentUser);
  await assertMenteeFeatureAccess(userId, MENTEE_FEATURE_KEYS.learningWorkspace);

  const [course] = await db
    .select({
      id: courses.id,
      title: mentorContent.title,
      price: courses.price,
      currency: courses.currency,
      status: mentorContent.status,
    })
    .from(courses)
    .innerJoin(mentorContent, eq(courses.contentId, mentorContent.id))
    .where(eq(courses.id, parsed.courseId))
    .limit(1);

  assertLearning(course, 404, 'Course not found');
  assertLearning(
    canEnrollInCourse(course.status),
    400,
    'Course is not available for enrollment'
  );

  const [existingEnrollment] = await db
    .select({ id: courseEnrollments.id })
    .from(courseEnrollments)
    .where(
      and(
        eq(courseEnrollments.courseId, parsed.courseId),
        eq(courseEnrollments.menteeId, menteeId)
      )
    )
    .limit(1);

  assertLearning(!existingEnrollment, 400, 'Already enrolled in this course');

  try {
    await enforceFeature({
      action: 'courses.access',
      userId,
    });
  } catch (error) {
    toLearningSubscriptionError(error);
  }

  let shouldEnforceCourseLimit = false;
  try {
    const planFeatures = await getPlanFeatures(userId, {
      audience: 'mentee',
      actorRole: 'mentee',
    });
    shouldEnforceCourseLimit = planFeatures.some(
      (feature) => feature.feature_key === FEATURE_KEYS.FREE_COURSES_LIMIT
    );
  } catch (error) {
    console.error('Course limit feature lookup failed:', error);
  }

  if (shouldEnforceCourseLimit) {
    try {
      await enforceFeature({
        action: 'courses.free_limit',
        userId,
      });
    } catch (error) {
      toLearningSubscriptionError(error);
    }
  }

  const coursePrice = parseFloat(course.price || '0');
  let discountPercent: number | null = null;

  try {
    const planFeatures = await getPlanFeatures(userId, {
      audience: 'mentee',
      actorRole: 'mentee',
    });
    const discountFeature = planFeatures.find(
      (feature) => feature.feature_key === FEATURE_KEYS.COURSE_DISCOUNT_PERCENT
    );
    discountPercent = discountFeature?.limit_percent ?? null;
  } catch (error) {
    console.error('Course discount lookup failed:', error);
  }

  const { finalPrice, discountAmount } = calculateCoursePriceSummary(
    coursePrice,
    discountPercent
  );

  const [enrollment] = await db
    .insert(courseEnrollments)
    .values({
      courseId: parsed.courseId,
      menteeId,
      status: 'ACTIVE',
      enrolledAt: new Date(),
      paymentStatus: finalPrice > 0 ? 'PENDING' : 'COMPLETED',
      paidAmount: finalPrice.toString(),
      currency: course.currency,
      enrollmentNotes: parsed.notes,
      isGift: parsed.isGift ?? false,
      giftFromUserId: parsed.giftFromUserId || null,
    })
    .returning({
      id: courseEnrollments.id,
      status: courseEnrollments.status,
      paymentStatus: courseEnrollments.paymentStatus,
    });

  const enrollmentId = enrollment.id;

  if (finalPrice > 0) {
    if (isRazorpayEnabled() && !paymentOptions.paymentConfirmed) {
      throw new LearningServiceError(
        402,
        'Paid courses must be enrolled through payment checkout.'
      );
    }

    assertLearning(
      paymentOptions.paymentConfirmed || parsed.paymentMethodId || parsed.isGift,
      400,
      'Payment method required for paid courses'
    );

    const transactionId =
      paymentOptions.providerPaymentId ||
      `txn_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    try {
      await db.insert(paymentTransactions).values({
        enrollmentId,
        transactionId,
        paymentProvider: paymentOptions.paymentConfirmed
          ? paymentOptions.providerPaymentId === 'dummy'
            ? 'dummy'
            : 'razorpay'
          : 'stripe',
        paymentMethod: paymentOptions.paymentConfirmed ? 'checkout' : 'card',
        amount: finalPrice.toString(),
        currency: course.currency,
        originalAmount: coursePrice.toString(),
        discountAmount: discountAmount.toString(),
        status: 'COMPLETED',
        paymentIntentId: paymentOptions.paymentIntentId,
        processedAt: new Date(),
      });

      await db
        .update(courseEnrollments)
        .set({
          paymentStatus: 'COMPLETED',
          paymentIntentId: paymentOptions.paymentIntentId || transactionId,
        })
        .where(eq(courseEnrollments.id, enrollmentId));
    } catch (paymentError) {
      console.error('Payment processing error:', paymentError);

      await db
        .update(courseEnrollments)
        .set({ paymentStatus: 'FAILED' })
        .where(eq(courseEnrollments.id, enrollmentId));

      throw new LearningServiceError(400, 'Payment processing failed');
    }
  }

  await db
    .update(courses)
    .set({
      enrollmentCount: sql<number>`${courses.enrollmentCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(courses.id, parsed.courseId));

  if (shouldEnforceCourseLimit) {
    try {
      await consumeFeature({
        action: 'courses.free_limit',
        userId,
        resourceType: 'course_enrollment',
        resourceId: enrollmentId,
      });
    } catch (error) {
      toLearningSubscriptionError(error);
    }
  }

  return {
    enrollmentId,
    courseId: parsed.courseId,
    courseTitle: course.title,
    status: enrollment.status,
    paymentStatus:
      finalPrice > 0 ? ('COMPLETED' as const) : enrollment.paymentStatus,
    paidAmount: finalPrice,
    currency: course.currency,
    enrolledAt: new Date().toISOString(),
  };
}

export async function getCourseProgress(
  userId: string,
  input: CourseProgressInput,
  currentUser?: CurrentUser
) {
  const parsed = courseProgressInputSchema.parse(input);
  const resolvedUser = await assertMenteeFeatureAccess(
    userId,
    MENTEE_FEATURE_KEYS.learningWorkspace,
    currentUser
  );

  const enrollmentData = await db
    .select({
      enrollmentId: courseEnrollments.id,
      menteeId: mentees.id,
      overallProgress: courseEnrollments.overallProgress,
      timeSpentMinutes: courseEnrollments.timeSpentMinutes,
      currentModuleId: courseEnrollments.currentModuleId,
      currentSectionId: courseEnrollments.currentSectionId,
      lastAccessedAt: courseEnrollments.lastAccessedAt,
    })
    .from(users)
    .innerJoin(mentees, eq(mentees.userId, users.id))
    .innerJoin(
      courseEnrollments,
      and(
        eq(courseEnrollments.menteeId, mentees.id),
        eq(courseEnrollments.courseId, parsed.courseId)
      )
    )
    .where(eq(users.id, resolvedUser.id))
    .limit(1);

  assertLearning(enrollmentData.length > 0, 404, 'Not enrolled in this course');

  const enrollment = enrollmentData[0];

  const progressData = await db
    .select({
      contentItemId: sectionContentItems.id,
      contentItemTitle: sectionContentItems.title,
      contentItemType: sectionContentItems.type,
      contentItemDuration: sectionContentItems.duration,
      contentItemOrderIndex: sectionContentItems.orderIndex,
      contentItemFileUrl: sectionContentItems.fileUrl,
      contentItemContent: sectionContentItems.content,
      contentItemFileName: sectionContentItems.fileName,
      contentItemMimeType: sectionContentItems.mimeType,
      sectionId: courseSections.id,
      sectionTitle: courseSections.title,
      sectionOrderIndex: courseSections.orderIndex,
      moduleId: courseModules.id,
      moduleTitle: courseModules.title,
      moduleOrderIndex: courseModules.orderIndex,
      progressId: courseProgress.id,
      status: courseProgress.status,
      progressPercentage: courseProgress.progressPercentage,
      timeSpentSeconds: courseProgress.timeSpentSeconds,
      lastWatchedPosition: courseProgress.lastWatchedPosition,
      watchCount: courseProgress.watchCount,
      firstStartedAt: courseProgress.firstStartedAt,
      lastAccessedAt: courseProgress.lastAccessedAt,
      completedAt: courseProgress.completedAt,
      studentNotes: courseProgress.studentNotes,
      bookmarkedAt: courseProgress.bookmarkedAt,
    })
    .from(courseModules)
    .innerJoin(courseSections, eq(courseSections.moduleId, courseModules.id))
    .innerJoin(
      sectionContentItems,
      eq(sectionContentItems.sectionId, courseSections.id)
    )
    .leftJoin(
      courseProgress,
      and(
        eq(courseProgress.contentItemId, sectionContentItems.id),
        eq(courseProgress.enrollmentId, enrollment.enrollmentId)
      )
    )
    .where(eq(courseModules.courseId, parsed.courseId))
    .orderBy(
      courseModules.orderIndex,
      courseSections.orderIndex,
      sectionContentItems.orderIndex
    );

  const modulesMap = new Map<
    string,
    {
      id: string;
      title: string;
      orderIndex: number;
      sections: Map<
        string,
        {
          id: string;
          title: string;
          orderIndex: number;
          contentItems: Array<Record<string, unknown>>;
          progress: {
            totalItems: number;
            completedItems: number;
            overallProgress: number;
          };
        }
      >;
      progress: {
        totalItems: number;
        completedItems: number;
        overallProgress: number;
      };
    }
  >();
  let totalContentItems = 0;
  let completedItems = 0;
  let totalDuration = 0;
  let completedDuration = 0;

  progressData.forEach((item) => {
    totalContentItems++;
    totalDuration += item.contentItemDuration || 0;

    if (item.status === 'COMPLETED') {
      completedItems++;
      completedDuration += item.contentItemDuration || 0;
    }

    if (!modulesMap.has(item.moduleId)) {
      modulesMap.set(item.moduleId, {
        id: item.moduleId,
        title: item.moduleTitle,
        orderIndex: item.moduleOrderIndex,
        sections: new Map(),
        progress: {
          totalItems: 0,
          completedItems: 0,
          overallProgress: 0,
        },
      });
    }

    const moduleData = modulesMap.get(item.moduleId)!;
    moduleData.progress.totalItems++;

    if (!moduleData.sections.has(item.sectionId)) {
      moduleData.sections.set(item.sectionId, {
        id: item.sectionId,
        title: item.sectionTitle,
        orderIndex: item.sectionOrderIndex,
        contentItems: [],
        progress: {
          totalItems: 0,
          completedItems: 0,
          overallProgress: 0,
        },
      });
    }

    const section = moduleData.sections.get(item.sectionId)!;
    section.progress.totalItems++;

    section.contentItems.push({
      id: item.contentItemId,
      title: item.contentItemTitle,
      type: item.contentItemType,
      duration: item.contentItemDuration,
      orderIndex: item.contentItemOrderIndex,
      fileUrl: item.contentItemFileUrl,
      content: item.contentItemContent,
      fileName: item.contentItemFileName,
      mimeType: item.contentItemMimeType,
      progress: item.progressId
        ? {
            id: item.progressId,
            status: item.status,
            progressPercentage: Number(item.progressPercentage) || 0,
            timeSpentSeconds: item.timeSpentSeconds || 0,
            lastWatchedPosition: item.lastWatchedPosition || 0,
            watchCount: item.watchCount || 0,
            firstStartedAt: item.firstStartedAt,
            lastAccessedAt: item.lastAccessedAt,
            completedAt: item.completedAt,
            studentNotes: item.studentNotes,
            isBookmarked: !!item.bookmarkedAt,
          }
        : {
            status: 'NOT_STARTED',
            progressPercentage: 0,
            timeSpentSeconds: 0,
            lastWatchedPosition: 0,
            watchCount: 0,
            isBookmarked: false,
          },
    });

    if (item.status === 'COMPLETED') {
      section.progress.completedItems++;
      moduleData.progress.completedItems++;
    }
  });

  const processedModules = Array.from(modulesMap.values())
    .map((module) => {
      const sections = Array.from(module.sections.values())
        .map((section) => {
          section.progress.overallProgress = calculateCourseOverallProgress(
            section.progress.totalItems,
            section.progress.completedItems
          );

          return {
            ...section,
            contentItems: section.contentItems.sort(
              (a, b) => Number(a.orderIndex) - Number(b.orderIndex)
            ),
          };
        })
        .sort((a, b) => a.orderIndex - b.orderIndex);

      module.progress.overallProgress = calculateCourseOverallProgress(
        module.progress.totalItems,
        module.progress.completedItems
      );

      return {
        ...module,
        sections,
      };
    })
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const hydratedModules = await Promise.all(
    processedModules.map(async (module) => ({
      ...module,
      sections: await Promise.all(
        module.sections.map(async (section) => ({
          ...section,
          contentItems: await Promise.all(
            section.contentItems.map(async (item) => ({
              ...item,
              fileUrl: await resolveStorageUrl(
                typeof item.fileUrl === 'string' ? item.fileUrl : null
              ),
            }))
          ),
        }))
      ),
    }))
  );

  const overallProgress = calculateCourseOverallProgress(
    totalContentItems,
    completedItems
  );

  const recentActivity = await db
    .select({
      contentItemTitle: sectionContentItems.title,
      sectionTitle: courseSections.title,
      moduleTitle: courseModules.title,
      activityType: courseProgress.status,
      timestamp: courseProgress.lastAccessedAt,
    })
    .from(courseProgress)
    .innerJoin(
      sectionContentItems,
      eq(courseProgress.contentItemId, sectionContentItems.id)
    )
    .innerJoin(courseSections, eq(sectionContentItems.sectionId, courseSections.id))
    .innerJoin(courseModules, eq(courseSections.moduleId, courseModules.id))
    .where(eq(courseProgress.enrollmentId, enrollment.enrollmentId))
    .orderBy(sql`${courseProgress.lastAccessedAt} DESC NULLS LAST`)
    .limit(10);

  const bookmarks = await db
    .select({
      contentItemId: sectionContentItems.id,
      contentItemTitle: sectionContentItems.title,
      sectionTitle: courseSections.title,
      moduleTitle: courseModules.title,
      bookmarkedAt: courseProgress.bookmarkedAt,
      studentNotes: courseProgress.studentNotes,
    })
    .from(courseProgress)
    .innerJoin(
      sectionContentItems,
      eq(courseProgress.contentItemId, sectionContentItems.id)
    )
    .innerJoin(courseSections, eq(sectionContentItems.sectionId, courseSections.id))
    .innerJoin(courseModules, eq(courseSections.moduleId, courseModules.id))
    .where(
      and(
        eq(courseProgress.enrollmentId, enrollment.enrollmentId),
        sql`${courseProgress.bookmarkedAt} IS NOT NULL`
      )
    )
    .orderBy(sql`${courseProgress.bookmarkedAt} DESC`);

  return {
    enrollment: {
      id: enrollment.enrollmentId,
      overallProgress: Number(enrollment.overallProgress) || overallProgress,
      timeSpentMinutes: enrollment.timeSpentMinutes || 0,
      currentModuleId: enrollment.currentModuleId,
      currentSectionId: enrollment.currentSectionId,
      lastAccessedAt: enrollment.lastAccessedAt,
    },
    progress: {
      overallProgress,
      totalContentItems,
      completedItems,
      totalDurationSeconds: totalDuration,
      completedDurationSeconds: completedDuration,
      modules: hydratedModules,
    },
    recentActivity,
    bookmarks,
  };
}

export async function updateCourseProgress(
  userId: string,
  input: UpdateCourseProgressInput,
  currentUser?: CurrentUser
) {
  const parsed = updateCourseProgressInputSchema.parse(input);
  const resolvedUser = await assertMenteeFeatureAccess(
    userId,
    MENTEE_FEATURE_KEYS.learningWorkspace,
    currentUser
  );

  const enrollmentData = await db
    .select({
      enrollmentId: courseEnrollments.id,
      menteeId: mentees.id,
    })
    .from(users)
    .innerJoin(mentees, eq(mentees.userId, users.id))
    .innerJoin(
      courseEnrollments,
      and(
        eq(courseEnrollments.menteeId, mentees.id),
        eq(courseEnrollments.courseId, parsed.courseId)
      )
    )
    .where(eq(users.id, resolvedUser.id))
    .limit(1);

  assertLearning(enrollmentData.length > 0, 404, 'Not enrolled in this course');

  const { enrollmentId } = enrollmentData[0];
  const now = new Date();

  const progressData = {
    enrollmentId,
    contentItemId: parsed.contentItemId,
    status: parsed.status || 'IN_PROGRESS',
    progressPercentage: (parsed.progressPercentage ?? 0).toString(),
    timeSpentSeconds: parsed.timeSpentSeconds ?? 0,
    lastWatchedPosition: parsed.lastWatchedPosition ?? 0,
    lastAccessedAt: now,
    studentNotes: parsed.studentNotes,
    completedAt: parsed.status === 'COMPLETED' ? now : null,
    bookmarkedAt: parsed.isBookmarked ? now : null,
  };

  const [existingProgress] = await db
    .select({
      id: courseProgress.id,
      firstStartedAt: courseProgress.firstStartedAt,
    })
    .from(courseProgress)
    .where(
      and(
        eq(courseProgress.enrollmentId, enrollmentId),
        eq(courseProgress.contentItemId, parsed.contentItemId)
      )
    )
    .limit(1);

  let progressId: string;

  if (existingProgress) {
    await db
      .update(courseProgress)
      .set({
        ...progressData,
        watchCount: sql`${courseProgress.watchCount} + 1`,
        updatedAt: now,
      })
      .where(eq(courseProgress.id, existingProgress.id));

    progressId = existingProgress.id;
  } else {
    const [newProgress] = await db
      .insert(courseProgress)
      .values({
        ...progressData,
        firstStartedAt: now,
        watchCount: 1,
      })
      .returning({ id: courseProgress.id });

    progressId = newProgress.id;
  }

  const [stats] = await db
    .select({
      totalItems: count(),
      completedItems: sql<number>`COUNT(CASE WHEN ${courseProgress.status} = 'COMPLETED' THEN 1 END)`,
      totalTimeSpent: sql<number>`SUM(${courseProgress.timeSpentSeconds})`,
    })
    .from(courseProgress)
    .where(eq(courseProgress.enrollmentId, enrollmentId));

  const overallProgress = calculateCourseOverallProgress(
    Number(stats.totalItems) || 0,
    Number(stats.completedItems) || 0
  );

  await db
    .update(courseEnrollments)
    .set({
      overallProgress: overallProgress.toString(),
      timeSpentMinutes: Math.round((Number(stats.totalTimeSpent) || 0) / 60),
      lastAccessedAt: now,
      status: overallProgress === 100 ? 'COMPLETED' : undefined,
      completedAt: overallProgress === 100 ? now : undefined,
    })
    .where(eq(courseEnrollments.id, enrollmentId));

  await db.insert(courseAnalytics).values({
    enrollmentId,
    contentItemId: parsed.contentItemId,
    eventType: parsed.eventType || 'progress_update',
    eventData: JSON.stringify({
      progressPercentage: parsed.progressPercentage ?? 0,
      timeSpentSeconds: parsed.timeSpentSeconds ?? 0,
      lastWatchedPosition: parsed.lastWatchedPosition ?? 0,
      status: parsed.status,
    }),
    sessionId: `session_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 11)}`,
    duration: parsed.timeSpentSeconds ?? 0,
  });

  return {
    progressId,
    overallProgress,
    contentItemProgress: parsed.progressPercentage ?? 0,
    status: parsed.status || 'IN_PROGRESS',
  };
}

export async function submitCourseReview(
  userId: string,
  input: SubmitCourseReviewInput,
  currentUser?: CurrentUser
) {
  const parsed = submitCourseReviewInputSchema.parse(input);
  const { menteeId } = await getRequiredMenteeId(userId, currentUser);

  const [enrollment] = await db
    .select({
      id: courseEnrollments.id,
      status: courseEnrollments.status,
    })
    .from(courseEnrollments)
    .where(
      and(
        eq(courseEnrollments.courseId, parsed.courseId),
        eq(courseEnrollments.menteeId, menteeId)
      )
    )
    .limit(1);

  assertLearning(enrollment, 403, 'Enrollment required to review this course');
  assertLearning(
    canReviewCourseEnrollment(enrollment.status),
    403,
    'Enrollment is not active'
  );

  const [existing] = await db
    .select({ id: courseReviews.id })
    .from(courseReviews)
    .where(
      and(
        eq(courseReviews.courseId, parsed.courseId),
        eq(courseReviews.enrollmentId, enrollment.id),
        eq(courseReviews.menteeId, menteeId)
      )
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(courseReviews)
      .set({
        rating: parsed.rating,
        title: parsed.title || null,
        review: parsed.review || null,
        updatedAt: new Date(),
      })
      .where(eq(courseReviews.id, existing.id))
      .returning();

    return updated;
  }

  const [created] = await db
    .insert(courseReviews)
    .values({
      courseId: parsed.courseId,
      menteeId,
      enrollmentId: enrollment.id,
      rating: parsed.rating,
      title: parsed.title || null,
      review: parsed.review || null,
      isVerifiedPurchase: true,
      isPublished: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

export async function toggleCourseReviewHelpfulVote(
  userId: string,
  input: ToggleCourseReviewHelpfulInput,
  currentUser?: CurrentUser
) {
  const parsed = toggleCourseReviewHelpfulInputSchema.parse(input);
  await getLearningUser(userId, currentUser);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ reviewId: courseReviewHelpfulVotes.reviewId })
      .from(courseReviewHelpfulVotes)
      .where(
        and(
          eq(courseReviewHelpfulVotes.reviewId, parsed.reviewId),
          eq(courseReviewHelpfulVotes.userId, userId)
        )
      )
      .limit(1);

    if (existing) {
      await tx
        .delete(courseReviewHelpfulVotes)
        .where(
          and(
            eq(courseReviewHelpfulVotes.reviewId, parsed.reviewId),
            eq(courseReviewHelpfulVotes.userId, userId)
          )
        );

      const [updated] = await tx
        .update(courseReviews)
        .set({
          helpfulVotes: sql<number>`${courseReviews.helpfulVotes} - 1`,
        })
        .where(eq(courseReviews.id, parsed.reviewId))
        .returning({ helpfulVotes: courseReviews.helpfulVotes });

      return {
        helpfulVotes: updated?.helpfulVotes ?? 0,
        viewerHasHelpful: false,
      };
    }

    await tx.insert(courseReviewHelpfulVotes).values({
      reviewId: parsed.reviewId,
      userId,
    });

    const [updated] = await tx
      .update(courseReviews)
      .set({
        helpfulVotes: sql<number>`${courseReviews.helpfulVotes} + 1`,
      })
      .where(eq(courseReviews.id, parsed.reviewId))
      .returning({ helpfulVotes: courseReviews.helpfulVotes });

    return {
      helpfulVotes: updated?.helpfulVotes ?? 1,
      viewerHasHelpful: true,
    };
  });
}

export async function submitContentItemReview(
  userId: string,
  input: SubmitContentItemReviewInput,
  currentUser?: CurrentUser
) {
  const parsed = submitContentItemReviewInputSchema.parse(input);
  const { menteeId } = await getRequiredMenteeId(userId, currentUser);

  const inCourse = await ensureContentItemInCourse(parsed.courseId, parsed.itemId);
  assertLearning(inCourse, 404, 'Content item not found for this course');

  const [enrollment] = await db
    .select({
      id: courseEnrollments.id,
      status: courseEnrollments.status,
    })
    .from(courseEnrollments)
    .where(
      and(
        eq(courseEnrollments.courseId, parsed.courseId),
        eq(courseEnrollments.menteeId, menteeId)
      )
    )
    .limit(1);

  assertLearning(enrollment, 403, 'Enrollment required to review content');
  assertLearning(
    canReviewCourseEnrollment(enrollment.status),
    403,
    'Enrollment is not active'
  );

  const [progress] = await db
    .select({ status: courseProgress.status })
    .from(courseProgress)
    .where(
      and(
        eq(courseProgress.enrollmentId, enrollment.id),
        eq(courseProgress.contentItemId, parsed.itemId)
      )
    )
    .limit(1);

  assertLearning(
    progress && progress.status !== 'NOT_STARTED',
    403,
    'You must start this item before reviewing it'
  );

  const [created] = await db
    .insert(contentItemReviews)
    .values({
      courseId: parsed.courseId,
      contentItemId: parsed.itemId,
      menteeId,
      enrollmentId: enrollment.id,
      rating: parsed.rating,
      title: parsed.title || null,
      review: parsed.review || null,
      isVerifiedPurchase: true,
      isPublished: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

export async function listEnrolledCourses(
  userId: string,
  input?: ListEnrolledCoursesInput,
  currentUser?: CurrentUser
) {
  const parsed = listEnrolledCoursesInputSchema.parse(input ?? {});
  const { currentUser: resolvedUser, menteeId } = await getOrCreateMenteeId(userId, currentUser);
  await assertMenteeFeatureAccess(
    userId,
    MENTEE_FEATURE_KEYS.learningWorkspace,
    resolvedUser
  );

  const page = parsed.page ?? 1;
  const limit = parsed.limit ?? 12;
  const offset = (page - 1) * limit;
  const sortBy = parsed.sortBy ?? 'enrolled_at';
  const sortOrder = parsed.sortOrder ?? 'desc';

  const conditions = [eq(courseEnrollments.menteeId, menteeId)];

  if (parsed.status) {
    conditions.push(eq(courseEnrollments.status, parsed.status));
  }

  const orderColumn =
    sortBy === 'progress'
      ? courseEnrollments.overallProgress
      : sortBy === 'last_accessed'
        ? courseEnrollments.lastAccessedAt
        : sortBy === 'completed_at'
          ? courseEnrollments.completedAt
          : courseEnrollments.enrolledAt;

  const enrolledCourses = await db
    .select({
      enrollmentId: courseEnrollments.id,
      enrollmentStatus: courseEnrollments.status,
      paymentStatus: courseEnrollments.paymentStatus,
      enrolledAt: courseEnrollments.enrolledAt,
      lastAccessedAt: courseEnrollments.lastAccessedAt,
      completedAt: courseEnrollments.completedAt,
      overallProgress: courseEnrollments.overallProgress,
      timeSpentMinutes: courseEnrollments.timeSpentMinutes,
      currentModuleId: courseEnrollments.currentModuleId,
      currentSectionId: courseEnrollments.currentSectionId,
      courseId: courses.id,
      courseTitle: mentorContent.title,
      courseDescription: mentorContent.description,
      difficulty: courses.difficulty,
      duration: courses.duration,
      price: courses.price,
      currency: courses.currency,
      thumbnailUrl: courses.thumbnailUrl,
      category: courses.category,
      tags: courses.tags,
      mentorName: users.name,
      mentorImage: users.image,
      mentorTitle: mentors.title,
      mentorCompany: mentors.company,
      certificateStatus: courseCertificates.status,
      certificateEarnedAt: courseCertificates.earnedAt,
      certificateUrl: courseCertificates.certificateUrl,
    })
    .from(courseEnrollments)
    .innerJoin(courses, eq(courseEnrollments.courseId, courses.id))
    .innerJoin(mentorContent, eq(courses.contentId, mentorContent.id))
    .innerJoin(mentors, eq(mentorContent.mentorId, mentors.id))
    .innerJoin(users, eq(mentors.userId, users.id))
    .leftJoin(
      courseCertificates,
      eq(courseCertificates.enrollmentId, courseEnrollments.id)
    )
    .where(and(...conditions))
    .orderBy(sortOrder === 'asc' ? orderColumn : desc(orderColumn))
    .limit(limit)
    .offset(offset);

  const [totalCountResult] = await db
    .select({ count: count() })
    .from(courseEnrollments)
    .where(and(...conditions));

  const totalCount = totalCountResult?.count || 0;
  const totalPages = Math.ceil(totalCount / limit);

  const [statistics] = await db
    .select({
      totalCourses: count(),
      activeCourses: sql<number>`COUNT(CASE WHEN ${courseEnrollments.status} = 'ACTIVE' THEN 1 END)`,
      completedCourses: sql<number>`COUNT(CASE WHEN ${courseEnrollments.status} = 'COMPLETED' THEN 1 END)`,
      totalTimeSpent: sql<number>`SUM(${courseEnrollments.timeSpentMinutes})`,
      averageProgress: sql<number>`AVG(CAST(${courseEnrollments.overallProgress} AS DECIMAL))`,
      totalCertificates: sql<number>`COUNT(CASE WHEN ${courseCertificates.status} = 'ISSUED' THEN 1 END)`,
    })
    .from(courseEnrollments)
    .leftJoin(
      courseCertificates,
      eq(courseCertificates.enrollmentId, courseEnrollments.id)
    )
    .where(eq(courseEnrollments.menteeId, menteeId));

  return {
    courses: enrolledCourses.map((course) => ({
      enrollment: {
        id: course.enrollmentId,
        status: course.enrollmentStatus,
        paymentStatus: course.paymentStatus,
        enrolledAt: course.enrolledAt,
        lastAccessedAt: course.lastAccessedAt,
        completedAt: course.completedAt,
        overallProgress: Number(course.overallProgress) || 0,
        timeSpentMinutes: course.timeSpentMinutes || 0,
        currentModuleId: course.currentModuleId,
        currentSectionId: course.currentSectionId,
      },
      course: {
        id: course.courseId,
        title: course.courseTitle,
        description: course.courseDescription,
        difficulty: course.difficulty,
        duration: course.duration,
        price: course.price,
        currency: course.currency,
        thumbnailUrl: course.thumbnailUrl,
        category: course.category,
        tags: safeJsonParse(course.tags),
      },
      mentor: {
        name: course.mentorName,
        image: course.mentorImage,
        title: course.mentorTitle,
        company: course.mentorCompany,
      },
      certificate: course.certificateStatus
        ? {
            status: course.certificateStatus,
            earnedAt: course.certificateEarnedAt,
            certificateUrl: course.certificateUrl,
          }
        : null,
    })),
    statistics: normalizeStatistics(statistics),
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

export async function listSavedItems(
  userId: string,
  currentUser?: CurrentUser
) {
  const { currentUser: resolvedUser, menteeId } = await getOrCreateMenteeId(userId, currentUser);
  await assertMenteeFeatureAccess(
    userId,
    MENTEE_FEATURE_KEYS.learningWorkspace,
    resolvedUser
  );

  return db
    .select({
      contentItemId: sectionContentItems.id,
      contentItemTitle: sectionContentItems.title,
      contentItemType: sectionContentItems.type,
      courseId: courses.id,
      courseTitle: mentorContent.title,
      moduleTitle: courseModules.title,
      sectionTitle: courseSections.title,
      bookmarkedAt: courseProgress.bookmarkedAt,
      mentorName: users.name,
    })
    .from(courseEnrollments)
    .innerJoin(courseProgress, eq(courseProgress.enrollmentId, courseEnrollments.id))
    .innerJoin(
      sectionContentItems,
      eq(courseProgress.contentItemId, sectionContentItems.id)
    )
    .innerJoin(courseSections, eq(sectionContentItems.sectionId, courseSections.id))
    .innerJoin(courseModules, eq(courseSections.moduleId, courseModules.id))
    .innerJoin(courses, eq(courseModules.courseId, courses.id))
    .innerJoin(mentorContent, eq(courses.contentId, mentorContent.id))
    .innerJoin(mentors, eq(mentorContent.mentorId, mentors.id))
    .innerJoin(users, eq(mentors.userId, users.id))
    .where(
      and(
        eq(courseEnrollments.menteeId, menteeId),
        sql`${courseProgress.bookmarkedAt} IS NOT NULL`
      )
    )
    .orderBy(desc(courseProgress.bookmarkedAt));
}

export async function removeSavedItem(
  userId: string,
  input: RemoveSavedItemInput,
  currentUser?: CurrentUser
) {
  const parsed = removeSavedItemInputSchema.parse(input);
  const { currentUser: resolvedUser, menteeId } = await getOrCreateMenteeId(userId, currentUser);
  await assertMenteeFeatureAccess(
    userId,
    MENTEE_FEATURE_KEYS.learningWorkspace,
    resolvedUser
  );

  const [enrollment] = await db
    .select({
      enrollmentId: courseEnrollments.id,
    })
    .from(courseEnrollments)
    .where(
      and(
        eq(courseEnrollments.menteeId, menteeId),
        eq(courseEnrollments.courseId, parsed.courseId)
      )
    )
    .limit(1);

  assertLearning(enrollment, 404, 'Not enrolled in this course');

  const [existing] = await db
    .select({ id: courseProgress.id })
    .from(courseProgress)
    .where(
      and(
        eq(courseProgress.enrollmentId, enrollment.enrollmentId),
        eq(courseProgress.contentItemId, parsed.itemId),
        sql`${courseProgress.bookmarkedAt} IS NOT NULL`
      )
    )
    .limit(1);

  assertLearning(existing, 404, 'Saved item not found');

  await db
    .update(courseProgress)
    .set({ bookmarkedAt: null, updatedAt: new Date() })
    .where(eq(courseProgress.id, existing.id));

  return { success: true };
}

export async function getReviewQuestions(
  userId: string,
  input: ListReviewQuestionsInput
) {
  const parsed = listReviewQuestionsInputSchema.parse(input);
  await getLearningUser(userId);

  const [session] = await db
    .select({
      mentorId: sessions.mentorId,
      menteeId: sessions.menteeId,
    })
    .from(sessions)
    .where(eq(sessions.id, parsed.sessionId))
    .limit(1);

  assertLearning(session, 404, 'Session not found.');
  assertLearning(
    canRequestReviewQuestions(session, userId, parsed.role),
    403,
    'You are not authorized to get review questions for this session.'
  );

  return db
    .select({
      id: reviewQuestions.id,
      questionText: reviewQuestions.questionText,
      displayOrder: reviewQuestions.displayOrder,
    })
    .from(reviewQuestions)
    .where(
      and(
        eq(reviewQuestions.role, parsed.role),
        eq(reviewQuestions.isActive, true)
      )
    )
    .orderBy(asc(reviewQuestions.displayOrder));
}

export async function submitSessionReview(
  userId: string,
  input: SubmitSessionReviewInput
) {
  const parsed = submitSessionReviewInputSchema.parse(input);
  await getLearningUser(userId);

  const [session] = await db
    .select({
      id: sessions.id,
      mentorId: sessions.mentorId,
      menteeId: sessions.menteeId,
      bookingSource: sessions.bookingSource,
    })
    .from(sessions)
    .where(eq(sessions.id, parsed.sessionId))
    .limit(1);

  assertLearning(session, 404, 'Session not found.');

  const reviewContext = resolveReviewContext(session, userId);
  assertLearning(
    reviewContext,
    403,
    'You were not a participant in this session.'
  );

  const [existingReview] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(
      and(
        eq(reviews.sessionId, parsed.sessionId),
        eq(reviews.reviewerId, userId)
      )
    )
    .limit(1);

  assertLearning(
    !existingReview,
    409,
    'You have already submitted a review for this session.'
  );

  const questionIds = parsed.ratings.map((rating) => rating.questionId);
  const questionsForRole = await db
    .select({
      id: reviewQuestions.id,
      weight: reviewQuestions.weight,
    })
    .from(reviewQuestions)
    .where(
      and(
        eq(reviewQuestions.role, reviewContext.revieweeRole),
        inArray(reviewQuestions.id, questionIds)
      )
    );

  const normalizedRatings = parsed.ratings.map((rating) => ({
    questionId: rating.questionId,
    rating: rating.rating,
  }));

  const finalScore = calculateWeightedReviewScore(
    questionsForRole,
    normalizedRatings
  );

  const insertedReview = await db.transaction(
    async (tx) => {
      const [newReview] = await tx
        .insert(reviews)
        .values({
          sessionId: parsed.sessionId,
          reviewerId: userId,
          revieweeId: reviewContext.revieweeId,
          reviewerRole: reviewContext.reviewerRole,
          finalScore: finalScore.toFixed(2),
          feedback: parsed.feedback,
        })
        .returning({ id: reviews.id });

      await tx.insert(reviewRatings).values(
        normalizedRatings.map((rating) => ({
          reviewId: newReview.id,
          questionId: rating.questionId,
          rating: rating.rating,
        }))
      );

      await tx
        .update(sessions)
        .set({
          [reviewContext.reviewFlag]: true,
        })
        .where(eq(sessions.id, parsed.sessionId));

      return newReview;
    }
  );

  if (session.bookingSource === 'ai') {
    const attribution = await findBookingAttributionForSession(session.id);
    if (attribution) {
      await recordRecommendationEvent({
        conversationId: attribution.conversationId,
        runId: attribution.runId,
        userId,
        mentorProfileId: attribution.mentorProfileId,
        eventType: 'review_attributed',
        idempotencyKey: `review:${insertedReview.id}`,
        metadata: {
          sessionId: session.id,
          reviewId: insertedReview.id,
          reviewerRole: reviewContext.reviewerRole,
          finalScore,
        },
      });
    }
  }

  return {
    success: true,
    reviewId: insertedReview.id,
    finalScore,
  };
}
