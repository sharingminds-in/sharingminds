import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  or,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import {
  AccessPolicyError,
  assertMenteeFeatureAccess as assertSharedMenteeFeatureAccess,
  assertMentorFeatureAccess as assertSharedMentorFeatureAccess,
} from '@/lib/access-policy/server';
import { db } from '@/lib/db';
import {
  contentItemReviews,
  courseReviews,
  courses,
  mentees,
  mentorContent,
  mentors,
  reviewQuestions,
  reviewRatings,
  reviews,
  sectionContentItems,
  sessions,
  users,
} from '@/lib/db/schema';
import { getMentorDashboardStats, getMentorRecentMessages, getMentorRecentSessions } from '@/lib/db/queries/mentor-dashboard-stats';
import {
  getMentorMentees,
  getMentorStats,
} from '@/lib/db/queries/mentoring-relationships';
import {
  getMentorMenteesFromSessions,
  getMentorSessionStats,
} from '@/lib/db/queries/mentor-sessions';
import { getUserWithRoles } from '@/lib/db/user-helpers';
import { getMentorForContent } from '@/lib/api/mentor-content';
import { resolveStorageUrl } from '@/lib/storage';
import { FEATURE_KEYS } from '@/lib/subscriptions/feature-keys';
import { getPlanFeatures } from '@/lib/subscriptions/enforcement';
import { safeJsonParse } from '@/lib/utils/safe-json';
import {
  sanitizeMentorDetailForViewer,
} from '@/lib/mentor/access';
import { MENTEE_FEATURE_KEYS } from '@/lib/mentee/access-policy';
import { MENTOR_FEATURE_KEYS, type MentorFeatureKey } from '@/lib/mentor/access-policy';
import { assertMentorLifecycle } from './errors';
import {
  mentorCourseCommentReplyInputSchema,
  mentorDetailInputSchema,
  mentorListInputSchema,
  mentorMenteesInputSchema,
  mentorRecentListInputSchema,
  savedMentorInputSchema,
  type MentorCourseCommentReplyInput,
  type MentorDetailInput,
  type MentorListInput,
  type MentorMenteesInput,
  type MentorRecentListInput,
  type SavedMentorInput,
} from './schemas';

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getUserWithRoles>>>;

type MentorListRow = {
  id: string;
  userId: string;
  title: string | null;
  company: string | null;
  industry: string | null;
  expertise: string | null;
  experience: number | null;
  hourlyRate: string | null;
  currency: string | null;
  headline: string | null;
  about: string | null;
  linkedinUrl: string | null;
  verificationStatus: string;
  isAvailable: boolean | null;
  profileImageUrl: string | null;
  bannerImageUrl: string | null;
  fullName: string | null;
  userName: string | null;
  email: string | null;
  userImage: string | null;
};

type MentorCourseCommentRow = {
  id: string;
  feedbackType: 'course' | 'content-item';
  courseId: string;
  courseTitle: string | null;
  contentItemId: string;
  contentItemTitle: string | null;
  rating: number;
  title: string | null;
  review: string | null;
  helpfulVotes: number;
  createdAt: Date;
  instructorResponse: string | null;
  instructorRespondedAt: Date | null;
  reviewerName: string | null;
  reviewerImage: string | null;
};

async function getMentorRuntimeUser(
  userId: string,
  currentUser?: CurrentUser
): Promise<CurrentUser> {
  const resolvedUser = currentUser ?? (await getUserWithRoles(userId));
  assertMentorLifecycle(resolvedUser, 401, 'Authentication required');
  return resolvedUser;
}

function isAdmin(user: CurrentUser) {
  return user.roles.some(
    (role: { name: string }) => role.name === 'admin'
  );
}

async function assertMentorDirectoryFeatureAccess(
  userId: string,
  currentUser?: CurrentUser
) {
  try {
    await assertSharedMenteeFeatureAccess({
      userId,
      feature: MENTEE_FEATURE_KEYS.mentorDirectoryView,
      currentUser,
      source: `mentor.runtime.${MENTEE_FEATURE_KEYS.mentorDirectoryView}`,
    });
  } catch (error) {
    if (error instanceof AccessPolicyError) {
      assertMentorLifecycle(false, error.status, error.message, error.data);
    }

    throw error;
  }
}

async function assertMentorFeatureAccess(
  userId: string,
  feature: MentorFeatureKey,
  currentUser?: CurrentUser
) {
  try {
    await assertSharedMentorFeatureAccess({
      userId,
      feature,
      currentUser,
      source: `mentor.runtime.${feature}`,
    });
  } catch (error) {
    if (error instanceof AccessPolicyError) {
      assertMentorLifecycle(false, error.status, error.message, error.data);
    }

    throw error;
  }
}

async function resolveMentorListRow(row: MentorListRow) {
  const signedProfileImageUrl = await resolveStorageUrl(row.profileImageUrl);
  const signedBannerImageUrl = await resolveStorageUrl(row.bannerImageUrl);

  return {
    ...row,
    profileImageUrl: signedProfileImageUrl,
    bannerImageUrl: signedBannerImageUrl,
    name: row.fullName || row.userName,
    image: signedProfileImageUrl || row.userImage,
  };
}

function normalizeMentorAvailabilityValue(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = safeJsonParse(value);
  return parsed ?? value;
}

export async function listMentors(
  userId: string,
  input?: MentorListInput,
  currentUser?: CurrentUser
) {
  const resolvedUser = await getMentorRuntimeUser(userId, currentUser);
  await assertMentorDirectoryFeatureAccess(userId, resolvedUser);

  const parsed = mentorListInputSchema.parse(input ?? {});
  const filters = [eq(mentors.verificationStatus, 'VERIFIED')];

  if (parsed.expertOnly) {
    filters.push(eq(mentors.isExpert, true));
  }

  if (parsed.industry) {
    filters.push(ilike(mentors.industry, `%${parsed.industry}%`));
  }

  if (parsed.expertise) {
    filters.push(ilike(mentors.expertise, `%${parsed.expertise}%`));
  }

  if (parsed.availability) {
    filters.push(ilike(mentors.availability, `%${parsed.availability}%`));
  }

  if (parsed.experience !== undefined) {
    filters.push(eq(mentors.experience, parsed.experience));
  }

  if (parsed.search) {
    filters.push(
      or(
        ilike(mentors.fullName, `%${parsed.search}%`),
        ilike(users.name, `%${parsed.search}%`),
        ilike(mentors.title, `%${parsed.search}%`),
        ilike(mentors.company, `%${parsed.search}%`),
        ilike(mentors.headline, `%${parsed.search}%`)
      )!
    );
  }

  const offset = (parsed.page - 1) * parsed.limit;

  const [rows, totalCountResult] = await Promise.all([
    db
      .select({
        id: mentors.id,
        userId: mentors.userId,
        title: mentors.title,
        company: mentors.company,
        industry: mentors.industry,
        expertise: mentors.expertise,
        experience: mentors.experience,
        hourlyRate: sql<string | null>`COALESCE(
          ${mentors.adminHourlyRateOverride},
          ${mentors.hourlyRate}
        )`,
        currency: mentors.currency,
        headline: mentors.headline,
        about: mentors.about,
        linkedinUrl: mentors.linkedinUrl,
        verificationStatus: mentors.verificationStatus,
        isAvailable: mentors.isAvailable,
        profileImageUrl: mentors.profileImageUrl,
        bannerImageUrl: mentors.bannerImageUrl,
        fullName: mentors.fullName,
        userName: users.name,
        email: users.email,
        userImage: users.image,
      })
      .from(mentors)
      .innerJoin(users, eq(mentors.userId, users.id))
      .where(and(...filters))
      .orderBy(mentors.createdAt)
      .limit(parsed.limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(mentors)
      .innerJoin(users, eq(mentors.userId, users.id))
      .where(and(...filters))
      .then((results) => results[0]),
  ]);

  const data = await Promise.all(rows.map(resolveMentorListRow));
  const totalCount = totalCountResult?.count ?? 0;
  const totalPages = Math.ceil(totalCount / parsed.limit);

  return {
    data,
    pagination: {
      page: parsed.page,
      limit: parsed.limit,
      totalCount,
      totalPages,
      hasMore: parsed.page < totalPages,
    },
    hasMore: parsed.page < totalPages,
  };
}

export async function getMentorDetail(
  userId: string,
  input: MentorDetailInput,
  currentUser?: CurrentUser
) {
  const resolvedUser = await getMentorRuntimeUser(userId, currentUser);
  await assertMentorDirectoryFeatureAccess(userId, resolvedUser);

  const { mentorId } = mentorDetailInputSchema.parse(input);

  const [mentor] = await db
    .select({
      id: mentors.id,
      userId: mentors.userId,
      title: mentors.title,
      company: mentors.company,
      industry: mentors.industry,
      expertise: mentors.expertise,
      experience: mentors.experience,
      hourlyRate: sql<string | null>`COALESCE(
        ${mentors.adminHourlyRateOverride},
        ${mentors.hourlyRate}
      )`,
      currency: mentors.currency,
      availability: mentors.availability,
      maxMentees: mentors.maxMentees,
      headline: mentors.headline,
      about: mentors.about,
      linkedinUrl: mentors.linkedinUrl,
      githubUrl: mentors.githubUrl,
      websiteUrl: mentors.websiteUrl,
      fullName: mentors.fullName,
      email: mentors.email,
      phone: mentors.phone,
      city: mentors.city,
      country: mentors.country,
      profileImageUrl: mentors.profileImageUrl,
      bannerImageUrl: mentors.bannerImageUrl,
      resumeUrl: mentors.resumeUrl,
      verificationStatus: mentors.verificationStatus,
      isAvailable: mentors.isAvailable,
      createdAt: mentors.createdAt,
      updatedAt: mentors.updatedAt,
      userName: users.name,
      userEmail: users.email,
      userImage: users.image,
    })
    .from(mentors)
    .innerJoin(users, eq(mentors.userId, users.id))
    .where(
      and(
        eq(mentors.id, mentorId),
        eq(mentors.verificationStatus, 'VERIFIED'),
        eq(mentors.isAvailable, true)
      )
    )
    .limit(1);

  assertMentorLifecycle(mentor, 404, 'Mentor not found or not available');

  const [signedProfileImageUrl, signedBannerImageUrl, signedResumeUrl] =
    await Promise.all([
      resolveStorageUrl(mentor.profileImageUrl),
      resolveStorageUrl(mentor.bannerImageUrl),
      resolveStorageUrl(mentor.resumeUrl),
    ]);

  const formattedMentor = {
    ...mentor,
    profileImageUrl: signedProfileImageUrl,
    bannerImageUrl: signedBannerImageUrl,
    resumeUrl: signedResumeUrl,
    name: mentor.fullName || mentor.userName,
    email: mentor.email || mentor.userEmail,
    image: signedProfileImageUrl || mentor.userImage,
    expertiseArray: mentor.expertise
      ? mentor.expertise.split(',').map((item) => item.trim())
      : [],
    availabilityParsed: normalizeMentorAvailabilityValue(mentor.availability),
  };

  return {
    data: sanitizeMentorDetailForViewer(formattedMentor, isAdmin(resolvedUser)),
  };
}

export async function listSavedMentors(
  userId: string,
  currentUser?: CurrentUser
) {
  const resolvedUser = await getMentorRuntimeUser(userId, currentUser);
  await assertMentorDirectoryFeatureAccess(userId, resolvedUser);

  return {
    data: [],
  };
}

export async function saveMentor(
  userId: string,
  input: SavedMentorInput,
  currentUser?: CurrentUser
) {
  const resolvedUser = await getMentorRuntimeUser(userId, currentUser);
  await assertMentorDirectoryFeatureAccess(userId, resolvedUser);

  const parsed = savedMentorInputSchema.parse(input);

  return {
    data: {
      id: `${userId}:${parsed.mentorId}`,
      userId,
      mentorId: parsed.mentorId,
      savedAt: new Date().toISOString(),
    },
    message: 'Mentor saved successfully',
  };
}

export async function unsaveMentor(
  userId: string,
  input: SavedMentorInput,
  currentUser?: CurrentUser
) {
  const resolvedUser = await getMentorRuntimeUser(userId, currentUser);
  await assertMentorDirectoryFeatureAccess(userId, resolvedUser);

  savedMentorInputSchema.parse(input);

  return {
    success: true,
    message: 'Mentor removed from saved list',
  };
}

export async function getMentorDashboardRuntimeStats(
  userId: string,
  currentUser?: CurrentUser
) {
  const resolvedUser = await getMentorRuntimeUser(userId, currentUser);
  await assertMentorFeatureAccess(
    userId,
    MENTOR_FEATURE_KEYS.dashboardStats,
    resolvedUser
  );
  return getMentorDashboardStats(userId);
}

export async function listMentorRecentSessionsRuntime(
  userId: string,
  input?: MentorRecentListInput,
  currentUser?: CurrentUser
) {
  const resolvedUser = await getMentorRuntimeUser(userId, currentUser);
  await assertMentorFeatureAccess(
    userId,
    MENTOR_FEATURE_KEYS.dashboardSessions,
    resolvedUser
  );

  const parsed = mentorRecentListInputSchema.parse(input ?? {});
  const sessionsList = await getMentorRecentSessions(userId, parsed.limit);

  return {
    sessions: sessionsList,
    count: sessionsList.length,
  };
}

export async function listMentorRecentMessagesRuntime(
  userId: string,
  input?: MentorRecentListInput,
  currentUser?: CurrentUser
) {
  const resolvedUser = await getMentorRuntimeUser(userId, currentUser);
  await assertMentorFeatureAccess(
    userId,
    MENTOR_FEATURE_KEYS.dashboardMessages,
    resolvedUser
  );

  const parsed = mentorRecentListInputSchema.parse(input ?? {});
  const messagesList = await getMentorRecentMessages(userId, parsed.limit);

  return {
    messages: messagesList,
    count: messagesList.length,
  };
}

export async function listMentorPendingReviewsRuntime(
  userId: string,
  currentUser?: CurrentUser
) {
  const resolvedUser = await getMentorRuntimeUser(userId, currentUser);
  await assertMentorFeatureAccess(
    userId,
    MENTOR_FEATURE_KEYS.dashboardReviews,
    resolvedUser
  );

  const rows = await db
    .select({
      sessionId: sessions.id,
      sessionTitle: sessions.title,
      sessionEndedAt: sessions.endedAt,
      mentee: {
        id: users.id,
        name: users.name,
        avatar: users.image,
      },
    })
    .from(sessions)
    .leftJoin(users, eq(sessions.menteeId, users.id))
    .where(
      and(
        eq(sessions.mentorId, userId),
        eq(sessions.status, 'completed'),
        eq(sessions.isReviewedByMentor, false)
      )
    )
    .orderBy(desc(sessions.endedAt));

  return {
    data: rows,
  };
}

export async function listMentorMenteesRuntime(
  userId: string,
  input?: MentorMenteesInput,
  currentUser?: CurrentUser
) {
  const resolvedUser = await getMentorRuntimeUser(userId, currentUser);
  await assertMentorFeatureAccess(
    userId,
    MENTOR_FEATURE_KEYS.menteesView,
    resolvedUser
  );

  const parsed = mentorMenteesInputSchema.parse(input ?? {});
  const statusFilter = parsed.status
    ? Array.isArray(parsed.status)
      ? parsed.status
      : parsed.status.split(',')
    : undefined;

  const [menteesList, stats] = await Promise.all([
    getMentorMentees(userId, statusFilter),
    parsed.includeStats ? getMentorStats(userId) : Promise.resolve(undefined),
  ]);

  return {
    mentees: menteesList,
    count: menteesList.length,
    ...(stats ? { stats } : {}),
  };
}

export async function listMentorMenteeSessionsRuntime(
  userId: string,
  currentUser?: CurrentUser
) {
  const resolvedUser = await getMentorRuntimeUser(userId, currentUser);
  await assertMentorFeatureAccess(
    userId,
    MENTOR_FEATURE_KEYS.menteesView,
    resolvedUser
  );

  const [menteesList, stats] = await Promise.all([
    getMentorMenteesFromSessions(userId),
    getMentorSessionStats(userId),
  ]);

  return {
    mentees: menteesList,
    stats,
    count: menteesList.length,
  };
}

export async function listMentorReviewsRuntime(
  userId: string,
  currentUser?: CurrentUser
) {
  const resolvedUser = await getMentorRuntimeUser(userId, currentUser);
  await assertMentorFeatureAccess(
    userId,
    MENTOR_FEATURE_KEYS.reviewsManage,
    resolvedUser
  );

  const menteeUser = alias(users, 'mentee_user');

  const mentorReviews = await db
    .select({
      id: reviews.id,
      sessionId: reviews.sessionId,
      feedback: reviews.feedback,
      finalScore: reviews.finalScore,
      createdAt: reviews.createdAt,
      sessionTitle: sessions.title,
      sessionEndedAt: sessions.endedAt,
      mentee: {
        id: menteeUser.id,
        name: menteeUser.name,
        image: menteeUser.image,
      },
    })
    .from(reviews)
    .innerJoin(sessions, eq(reviews.sessionId, sessions.id))
    .leftJoin(menteeUser, eq(reviews.revieweeId, menteeUser.id))
    .where(and(eq(reviews.reviewerId, userId), eq(reviews.reviewerRole, 'mentor')))
    .orderBy(desc(reviews.createdAt));

  const reviewIds = mentorReviews.map((review) => review.id);

  const ratings =
    reviewIds.length === 0
      ? []
      : await db
          .select({
            reviewId: reviewRatings.reviewId,
            rating: reviewRatings.rating,
            questionText: reviewQuestions.questionText,
          })
          .from(reviewRatings)
          .innerJoin(reviewQuestions, eq(reviewRatings.questionId, reviewQuestions.id))
          .innerJoin(reviews, eq(reviewRatings.reviewId, reviews.id))
          .where(
            and(eq(reviews.reviewerId, userId), eq(reviews.reviewerRole, 'mentor'))
          )
          .orderBy(asc(reviewQuestions.displayOrder));

  const ratingsByReviewId = new Map<
    string,
    Array<{ questionText: string; rating: number }>
  >();

  for (const rating of ratings) {
    const existing = ratingsByReviewId.get(rating.reviewId) ?? [];
    existing.push({
      questionText: rating.questionText,
      rating: rating.rating,
    });
    ratingsByReviewId.set(rating.reviewId, existing);
  }

  return {
    reviews: mentorReviews.map((review) => ({
      ...review,
      ratings: ratingsByReviewId.get(review.id) ?? [],
    })),
  };
}

export async function listMentorCourseCommentsRuntime(
  userId: string,
  currentUser?: CurrentUser
) {
  const resolvedUser = await getMentorRuntimeUser(userId, currentUser);
  await assertMentorFeatureAccess(
    userId,
    MENTOR_FEATURE_KEYS.contentManage,
    resolvedUser
  );

  const mentor = await getMentorForContent(userId);
  assertMentorLifecycle(mentor, 404, 'Mentor not found');

  const mentorPlanFeatures = await getPlanFeatures(userId, {
    audience: 'mentor',
    actorRole: 'mentor',
  }).catch(() => []);

  const hasCourseAccess = mentorPlanFeatures.some(
    (feature) =>
      feature.feature_key === FEATURE_KEYS.COURSES_ACCESS && feature.is_included
  );

  if (!hasCourseAccess) {
    return { hasAccess: false, comments: [] as MentorCourseCommentRow[] };
  }

  const courseCommentRows = await db
    .select({
      id: courseReviews.id,
      courseId: courseReviews.courseId,
      courseTitle: mentorContent.title,
      contentItemId: courseReviews.courseId,
      contentItemTitle: mentorContent.title,
      rating: courseReviews.rating,
      title: courseReviews.title,
      review: courseReviews.review,
      helpfulVotes: courseReviews.helpfulVotes,
      createdAt: courseReviews.createdAt,
      instructorResponse: courseReviews.instructorResponse,
      instructorRespondedAt: courseReviews.instructorRespondedAt,
      reviewerName: users.name,
      reviewerImage: users.image,
    })
    .from(courseReviews)
    .innerJoin(courses, eq(courseReviews.courseId, courses.id))
    .innerJoin(mentorContent, eq(courses.contentId, mentorContent.id))
    .innerJoin(mentees, eq(courseReviews.menteeId, mentees.id))
    .innerJoin(users, eq(mentees.userId, users.id))
    .where(and(eq(mentorContent.mentorId, mentor.id), eq(courseReviews.isPublished, true)))
    .orderBy(desc(courseReviews.createdAt));

  const lessonCommentRows = await db
    .select({
      id: contentItemReviews.id,
      courseId: contentItemReviews.courseId,
      courseTitle: mentorContent.title,
      contentItemId: contentItemReviews.contentItemId,
      contentItemTitle: sectionContentItems.title,
      rating: contentItemReviews.rating,
      title: contentItemReviews.title,
      review: contentItemReviews.review,
      helpfulVotes: contentItemReviews.helpfulVotes,
      createdAt: contentItemReviews.createdAt,
      instructorResponse: contentItemReviews.instructorResponse,
      instructorRespondedAt: contentItemReviews.instructorRespondedAt,
      reviewerName: users.name,
      reviewerImage: users.image,
    })
    .from(contentItemReviews)
    .innerJoin(courses, eq(contentItemReviews.courseId, courses.id))
    .innerJoin(mentorContent, eq(courses.contentId, mentorContent.id))
    .innerJoin(
      sectionContentItems,
      eq(contentItemReviews.contentItemId, sectionContentItems.id)
    )
    .innerJoin(mentees, eq(contentItemReviews.menteeId, mentees.id))
    .innerJoin(users, eq(mentees.userId, users.id))
    .where(
      and(
        eq(mentorContent.mentorId, mentor.id),
        eq(contentItemReviews.isPublished, true)
      )
    )
    .orderBy(desc(contentItemReviews.createdAt));

  const courseComments: MentorCourseCommentRow[] = courseCommentRows.map((row) => ({
    ...row,
    feedbackType: 'course',
  }));

  const lessonComments: MentorCourseCommentRow[] = lessonCommentRows.map((row) => ({
    ...row,
    feedbackType: 'content-item',
  }));

  const comments = [...courseComments, ...lessonComments].sort(
    (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)
  );

  return {
    hasAccess: true,
    hasComments: comments.length > 0,
    comments,
  };
}

export async function replyToMentorCourseComment(
  userId: string,
  input: MentorCourseCommentReplyInput,
  currentUser?: CurrentUser
) {
  const resolvedUser = await getMentorRuntimeUser(userId, currentUser);
  await assertMentorFeatureAccess(
    userId,
    MENTOR_FEATURE_KEYS.contentManage,
    resolvedUser
  );

  const mentor = await getMentorForContent(userId);
  assertMentorLifecycle(mentor, 404, 'Mentor not found');

  const parsed = mentorCourseCommentReplyInputSchema.parse(input);

  if (parsed.feedbackType === 'course') {
    const [ownedComment] = await db
      .select({ id: courseReviews.id })
      .from(courseReviews)
      .innerJoin(courses, eq(courseReviews.courseId, courses.id))
      .innerJoin(mentorContent, eq(courses.contentId, mentorContent.id))
      .where(
        and(eq(courseReviews.id, parsed.commentId), eq(mentorContent.mentorId, mentor.id))
      )
      .limit(1);

    assertMentorLifecycle(ownedComment, 404, 'Comment not found');

    const [updated] = await db
      .update(courseReviews)
      .set({
        instructorResponse: parsed.response,
        instructorRespondedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(courseReviews.id, parsed.commentId))
      .returning();

    return { comment: updated };
  }

  const [ownedComment] = await db
    .select({ id: contentItemReviews.id })
    .from(contentItemReviews)
    .innerJoin(courses, eq(contentItemReviews.courseId, courses.id))
    .innerJoin(mentorContent, eq(courses.contentId, mentorContent.id))
    .where(
      and(
        eq(contentItemReviews.id, parsed.commentId),
        eq(mentorContent.mentorId, mentor.id)
      )
    )
    .limit(1);

  assertMentorLifecycle(ownedComment, 404, 'Comment not found');

  const [updated] = await db
    .update(contentItemReviews)
    .set({
      instructorResponse: parsed.response,
      instructorRespondedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(contentItemReviews.id, parsed.commentId))
    .returning();

  return { comment: updated };
}
