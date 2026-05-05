import { and, asc, avg, count, desc, eq, ilike, or, sql } from 'drizzle-orm';

import { PUBLIC_COURSE_STATUS, canViewCourseDetail } from '@/lib/courses/status';
import { db } from '@/lib/db';
import {
  contentItemReviews,
  courseCategories,
  courseCategoryRelations,
  courseEnrollments,
  courseModules,
  courseReviewHelpfulVotes,
  courseReviews,
  courseSections,
  courses,
  mentees,
  mentorContent,
  mentors,
  sectionContentItems,
  users,
} from '@/lib/db/schema';
import { AppHttpError } from '@/lib/http/app-error';
import { resolveStorageUrl } from '@/lib/storage';
import { safeJsonParse } from '@/lib/utils/safe-json';

export interface ListPublicCoursesInput {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  difficulty?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  featured?: boolean;
  mentorId?: string;
}

function safeJsonValue<T>(jsonString: string | null | undefined, defaultValue: T): T {
  if (!jsonString) return defaultValue;

  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    return defaultValue;
  }
}

export async function listPublicCourses(input: ListPublicCoursesInput) {
  const page = Math.max(1, input.page ?? 1);
  const limit = Math.min(50, Math.max(1, input.limit ?? 12));
  const search = input.search?.trim() ?? '';
  const category = input.category?.trim() ?? '';
  const difficulty = input.difficulty?.trim() ?? '';
  const minPrice = input.minPrice;
  const maxPrice = input.maxPrice;
  const sortBy = input.sortBy ?? 'created_at';
  const sortOrder = input.sortOrder ?? 'desc';
  const mentorId = input.mentorId?.trim() ?? '';
  const offset = (page - 1) * limit;

  let query = db
    .select({
      id: courses.id,
      title: mentorContent.title,
      description: mentorContent.description,
      difficulty: courses.difficulty,
      duration: courses.duration,
      price: courses.price,
      currency: courses.currency,
      thumbnailUrl: courses.thumbnailUrl,
      category: courses.category,
      tags: courses.tags,
      platformTags: courses.platformTags,
      platformName: courses.platformName,
      ownerType: courses.ownerType,
      prerequisites: courses.prerequisites,
      learningOutcomes: courses.learningOutcomes,
      enrollmentCount: courses.enrollmentCount,
      status: mentorContent.status,
      createdAt: courses.createdAt,
      updatedAt: courses.updatedAt,
      mentor: {
        id: mentors.id,
        userId: mentors.userId,
        name: users.name,
        fullName: mentors.fullName,
        image: users.image,
        title: mentors.title,
        company: mentors.company,
      },
      avgRating: sql<number>`COALESCE(AVG(CAST(${courseReviews.rating} AS DECIMAL)), 0)`,
      reviewCount: sql<number>`COUNT(${courseReviews.id})`,
    })
    .from(courses)
    .innerJoin(mentorContent, eq(courses.contentId, mentorContent.id))
    .leftJoin(mentors, eq(mentorContent.mentorId, mentors.id))
    .leftJoin(users, eq(mentors.userId, users.id))
    .leftJoin(
      courseReviews,
      and(eq(courseReviews.courseId, courses.id), eq(courseReviews.isPublished, true))
    )
    .groupBy(courses.id, mentorContent.id, mentors.id, users.id)
    .$dynamic();

  const conditions = [eq(mentorContent.status, PUBLIC_COURSE_STATUS)];

  if (search) {
    // Also search individual tokens so a long query like "interested in data science"
    // still matches a tag stored as ["data science"]
    const searchTokens = search.trim().split(/\s+/).filter((w) => w.length >= 4);
    const extraTagCond =
      searchTokens.length > 1
        ? sql`(${searchTokens
            .flatMap((t) => [
              sql`${courses.tags} ilike ${'%' + t + '%'}`,
              sql`${courses.platformTags} ilike ${'%' + t + '%'}`,
            ])
            .reduce((a, b) => sql`${a} OR ${b}`)})`
        : undefined;

    conditions.push(
      or(
        ilike(mentorContent.title, `%${search}%`),
        ilike(mentorContent.description, `%${search}%`),
        ilike(courses.tags, `%${search}%`),
        ilike(courses.platformTags, `%${search}%`),
        extraTagCond
      )!
    );
  }

  if (category) {
    conditions.push(eq(courses.category, category));
  }

  if (difficulty) {
    conditions.push(eq(courses.difficulty, difficulty as any));
  }

  if (minPrice !== undefined) {
    conditions.push(sql`CAST(${courses.price} AS DECIMAL) >= ${minPrice}`);
  }

  if (maxPrice !== undefined) {
    conditions.push(sql`CAST(${courses.price} AS DECIMAL) <= ${maxPrice}`);
  }

  if (mentorId) {
    conditions.push(
      and(eq(courses.ownerType, 'MENTOR'), eq(mentorContent.mentorId, mentorId))!
    );
  }

  query = query.where(and(...conditions));

  const orderColumn =
    sortBy === 'price'
      ? courses.price
      : sortBy === 'rating'
        ? sql`AVG(CAST(${courseReviews.rating} AS DECIMAL))`
        : sortBy === 'enrollment_count'
          ? courses.enrollmentCount
          : courses.createdAt;

  query = query
    .orderBy(sortOrder === 'asc' ? asc(orderColumn) : desc(orderColumn))
    .limit(limit)
    .offset(offset);

  const rawCoursesData = await query;
  const courseData = rawCoursesData.map((course) => ({
    ...course,
    mentor: {
      ...course.mentor,
      name:
        course.ownerType === 'PLATFORM'
          ? course.platformName || 'Platform'
          : course.mentor.fullName || course.mentor.name,
    },
    tags: safeJsonValue<string[]>(course.tags, []),
    platformTags: safeJsonValue<string[]>(course.platformTags, []),
    prerequisites: safeJsonValue<string[]>(course.prerequisites, []),
    learningOutcomes: safeJsonValue<string[]>(course.learningOutcomes, []),
  }));

  const totalCountResult = await db
    .select({ count: count() })
    .from(courses)
    .innerJoin(mentorContent, eq(courses.contentId, mentorContent.id))
    .where(and(...conditions));

  const totalCount = totalCountResult[0]?.count || 0;
  const totalPages = Math.ceil(totalCount / limit);

  const categories = await db
    .select({
      id: courseCategories.id,
      name: courseCategories.name,
      slug: courseCategories.slug,
      color: courseCategories.color,
      courseCount: count(courseCategoryRelations.courseId),
    })
    .from(courseCategories)
    .leftJoin(
      courseCategoryRelations,
      eq(courseCategories.id, courseCategoryRelations.categoryId)
    )
    .where(eq(courseCategories.isActive, true))
    .groupBy(courseCategories.id)
    .orderBy(asc(courseCategories.orderIndex));

  return {
    courses: courseData,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
    filters: {
      categories,
      difficulties: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'],
    },
  };
}

export async function getPublicCourseDetail(
  courseId: string,
  userId: string | null
) {
  let isEnrolled = false;

  if (userId) {
    const [menteeRecord] = await db
      .select({ menteeId: mentees.id })
      .from(mentees)
      .where(eq(mentees.userId, userId))
      .limit(1);

    if (menteeRecord?.menteeId) {
      const [enrollment] = await db
        .select({ id: courseEnrollments.id })
        .from(courseEnrollments)
        .where(
          and(
            eq(courseEnrollments.courseId, courseId),
            eq(courseEnrollments.menteeId, menteeRecord.menteeId)
          )
        )
        .limit(1);

      isEnrolled = Boolean(enrollment);
    }
  }

  const courseData = await db
    .select({
      id: courses.id,
      contentId: courses.contentId,
      title: mentorContent.title,
      description: mentorContent.description,
      difficulty: courses.difficulty,
      duration: courses.duration,
      price: courses.price,
      currency: courses.currency,
      thumbnailUrl: courses.thumbnailUrl,
      category: courses.category,
      tags: courses.tags,
      platformTags: courses.platformTags,
      platformName: courses.platformName,
      ownerType: courses.ownerType,
      prerequisites: courses.prerequisites,
      learningOutcomes: courses.learningOutcomes,
      enrollmentCount: courses.enrollmentCount,
      status: mentorContent.status,
      createdAt: courses.createdAt,
      updatedAt: courses.updatedAt,
      mentorId: mentors.id,
      mentorUserId: mentors.userId,
      mentorName: users.name,
      mentorFullName: mentors.fullName,
      mentorImage: users.image,
      mentorTitle: mentors.title,
      mentorCompany: mentors.company,
      mentorAbout: mentors.about,
      mentorExpertise: mentors.expertise,
      mentorExperience: mentors.experience,
      mentorLinkedinUrl: mentors.linkedinUrl,
      mentorWebsiteUrl: mentors.websiteUrl,
    })
    .from(courses)
    .innerJoin(mentorContent, eq(courses.contentId, mentorContent.id))
    .leftJoin(mentors, eq(mentorContent.mentorId, mentors.id))
    .leftJoin(users, eq(mentors.userId, users.id))
    .where(eq(courses.id, courseId))
    .limit(1);

  const course = courseData[0];

  if (!course) {
    throw new AppHttpError(404, 'Course not found');
  }

  const canAccessUnapprovedCourse = canViewCourseDetail({
    status: course.status,
    isEnrolled,
    isOwner: Boolean(userId) && course.mentorUserId === userId,
  });

  if (!canAccessUnapprovedCourse) {
    throw new AppHttpError(404, 'Course not found');
  }

  const curriculum = await db
    .select({
      moduleId: courseModules.id,
      moduleTitle: courseModules.title,
      moduleDescription: courseModules.description,
      moduleOrderIndex: courseModules.orderIndex,
      moduleLearningObjectives: courseModules.learningObjectives,
      moduleEstimatedDuration: courseModules.estimatedDurationMinutes,
      sectionId: courseSections.id,
      sectionTitle: courseSections.title,
      sectionDescription: courseSections.description,
      sectionOrderIndex: courseSections.orderIndex,
      contentItemId: sectionContentItems.id,
      contentItemTitle: sectionContentItems.title,
      contentItemDescription: sectionContentItems.description,
      contentItemType: sectionContentItems.type,
      contentItemOrderIndex: sectionContentItems.orderIndex,
      contentItemDuration: sectionContentItems.duration,
      isPreview: sectionContentItems.isPreview,
      fileUrl: sectionContentItems.fileUrl,
      content: sectionContentItems.content,
    })
    .from(courseModules)
    .leftJoin(courseSections, eq(courseSections.moduleId, courseModules.id))
    .leftJoin(sectionContentItems, eq(sectionContentItems.sectionId, courseSections.id))
    .where(eq(courseModules.courseId, courseId))
    .orderBy(
      courseModules.orderIndex,
      courseSections.orderIndex,
      sectionContentItems.orderIndex
    );

  const modulesMap = new Map<string, any>();

  for (const item of curriculum) {
    if (!modulesMap.has(item.moduleId)) {
      modulesMap.set(item.moduleId, {
        id: item.moduleId,
        title: item.moduleTitle,
        description: item.moduleDescription,
        orderIndex: item.moduleOrderIndex,
        learningObjectives: safeJsonValue(item.moduleLearningObjectives, []),
        estimatedDurationMinutes: item.moduleEstimatedDuration,
        sections: new Map<string, any>(),
      });
    }

    const moduleData = modulesMap.get(item.moduleId);

    if (item.sectionId && !moduleData.sections.has(item.sectionId)) {
      moduleData.sections.set(item.sectionId, {
        id: item.sectionId,
        title: item.sectionTitle,
        description: item.sectionDescription,
        orderIndex: item.sectionOrderIndex,
        contentItems: [],
      });
    }

    if (item.contentItemId && item.sectionId) {
      if ((!userId || !isEnrolled) && !item.isPreview) {
        continue;
      }

      const section = moduleData.sections.get(item.sectionId);
      section.contentItems.push({
        id: item.contentItemId,
        title: item.contentItemTitle,
        description: item.contentItemDescription,
        type: item.contentItemType,
        orderIndex: item.contentItemOrderIndex,
        duration: item.contentItemDuration,
        isPreview: item.isPreview,
        fileUrl: await resolveStorageUrl(item.fileUrl),
        content: item.content,
      });
    }
  }

  const structuredCurriculum = Array.from(modulesMap.values())
    .map((module) => ({
      ...module,
      sections: Array.from(module.sections.values()).sort(
        (a: any, b: any) => a.orderIndex - b.orderIndex
      ),
    }))
    .sort((a: any, b: any) => a.orderIndex - b.orderIndex);

  const stats = await db
    .select({
      avgRating: avg(courseReviews.rating),
      reviewCount: count(courseReviews.id),
      enrollmentCount: count(courseEnrollments.id),
    })
    .from(courses)
    .leftJoin(
      courseReviews,
      and(eq(courseReviews.courseId, courses.id), eq(courseReviews.isPublished, true))
    )
    .leftJoin(courseEnrollments, eq(courseEnrollments.courseId, courses.id))
    .where(eq(courses.id, courseId))
    .groupBy(courses.id);

  const reviews = await db
    .select({
      id: courseReviews.id,
      rating: courseReviews.rating,
      title: courseReviews.title,
      review: courseReviews.review,
      createdAt: courseReviews.createdAt,
      isVerifiedPurchase: courseReviews.isVerifiedPurchase,
      helpfulVotes: courseReviews.helpfulVotes,
      student: {
        name: users.name,
        image: users.image,
      },
      instructorResponse: courseReviews.instructorResponse,
      instructorRespondedAt: courseReviews.instructorRespondedAt,
    })
    .from(courseReviews)
    .innerJoin(courseEnrollments, eq(courseReviews.enrollmentId, courseEnrollments.id))
    .innerJoin(mentees, eq(courseEnrollments.menteeId, mentees.id))
    .innerJoin(users, eq(mentees.userId, users.id))
    .where(and(eq(courseReviews.courseId, courseId), eq(courseReviews.isPublished, true)))
    .orderBy(desc(courseReviews.createdAt))
    .limit(10);

  const totalDuration = structuredCurriculum.reduce((total: number, module: any) => {
    return (
      total +
      module.sections.reduce((moduleTotal: number, section: any) => {
        return (
          moduleTotal +
          section.contentItems.reduce(
            (sectionTotal: number, item: any) => sectionTotal + (item.duration || 0),
            0
          )
        );
      }, 0)
    );
  }, 0);

  const contentCounts = {
    modules: structuredCurriculum.length,
    sections: structuredCurriculum.reduce(
      (total: number, module: any) => total + module.sections.length,
      0
    ),
    videos: 0,
    documents: 0,
    urls: 0,
    totalItems: 0,
  };

  structuredCurriculum.forEach((module: any) => {
    module.sections.forEach((section: any) => {
      section.contentItems.forEach((item: any) => {
        contentCounts.totalItems++;
        if (item.type === 'VIDEO') contentCounts.videos++;
        else if (item.type === 'PDF' || item.type === 'DOCUMENT') contentCounts.documents++;
        else if (item.type === 'URL') contentCounts.urls++;
      });
    });
  });

  const mentorName =
    course.ownerType === 'PLATFORM'
      ? course.platformName || 'Platform'
      : course.mentorFullName || course.mentorName;

  const courseStats = stats[0] || { avgRating: 0, reviewCount: 0, enrollmentCount: 0 };

  return {
    id: course.id,
    title: course.title,
    description: course.description,
    difficulty: course.difficulty,
    duration: course.duration,
    price: course.price,
    currency: course.currency,
    thumbnailUrl: course.thumbnailUrl,
    category: course.category,
    tags: safeJsonValue(course.tags, []),
    platformTags: safeJsonValue(course.platformTags, []),
    platformName: course.platformName,
    ownerType: course.ownerType,
    prerequisites: safeJsonValue(course.prerequisites, []),
    learningOutcomes: safeJsonValue(course.learningOutcomes, []),
    mentor: {
      id: course.ownerType === 'PLATFORM' ? null : course.mentorId,
      userId: course.ownerType === 'PLATFORM' ? null : course.mentorUserId,
      name: mentorName,
      image: course.ownerType === 'PLATFORM' ? null : course.mentorImage,
      title: course.ownerType === 'PLATFORM' ? null : course.mentorTitle,
      company: course.ownerType === 'PLATFORM' ? null : course.mentorCompany,
      bio: course.ownerType === 'PLATFORM' ? null : course.mentorAbout,
      expertise:
        course.ownerType === 'PLATFORM' ? [] : safeJsonValue(course.mentorExpertise, []),
      experience: course.ownerType === 'PLATFORM' ? null : course.mentorExperience,
      linkedinUrl: course.ownerType === 'PLATFORM' ? null : course.mentorLinkedinUrl,
      websiteUrl: course.ownerType === 'PLATFORM' ? null : course.mentorWebsiteUrl,
    },
    curriculum: structuredCurriculum,
    statistics: {
      ...courseStats,
      avgRating: Number(courseStats.avgRating) || 0,
      enrollmentCount: course.enrollmentCount || 0,
      totalDurationSeconds: totalDuration,
      contentCounts,
    },
    reviews,
  };
}

export async function listPublicCourseReviews(
  courseId: string,
  viewerId: string | null,
  input: {
    limit?: number;
    offset?: number;
    includeMine?: boolean;
  }
) {
  const limit = Math.min(50, Math.max(1, input.limit ?? 10));
  const offset = Math.max(0, input.offset ?? 0);
  const includeMine = input.includeMine === true;

  const rows = await db
    .select({
      id: courseReviews.id,
      rating: courseReviews.rating,
      title: courseReviews.title,
      review: courseReviews.review,
      createdAt: courseReviews.createdAt,
      helpfulVotes: courseReviews.helpfulVotes,
      instructorResponse: courseReviews.instructorResponse,
      instructorRespondedAt: courseReviews.instructorRespondedAt,
      reviewerName: users.name,
      reviewerImage: users.image,
      viewerHasHelpful: sql<boolean>`CASE WHEN ${courseReviewHelpfulVotes.userId} IS NULL THEN false ELSE true END`,
    })
    .from(courseReviews)
    .innerJoin(mentees, eq(courseReviews.menteeId, mentees.id))
    .innerJoin(users, eq(mentees.userId, users.id))
    .leftJoin(
      courseReviewHelpfulVotes,
      and(
        eq(courseReviewHelpfulVotes.reviewId, courseReviews.id),
        viewerId
          ? eq(courseReviewHelpfulVotes.userId, viewerId)
          : sql<boolean>`false`
      )
    )
    .where(and(eq(courseReviews.courseId, courseId), eq(courseReviews.isPublished, true)))
    .orderBy(desc(courseReviews.createdAt))
    .limit(limit)
    .offset(offset);

  let myReview = null;

  if (includeMine && viewerId) {
    const [mentee] = await db
      .select({ id: mentees.id })
      .from(mentees)
      .where(eq(mentees.userId, viewerId))
      .limit(1);

    if (mentee) {
      const [review] = await db
        .select({
          id: courseReviews.id,
          rating: courseReviews.rating,
          title: courseReviews.title,
          review: courseReviews.review,
          createdAt: courseReviews.createdAt,
          helpfulVotes: courseReviews.helpfulVotes,
          instructorResponse: courseReviews.instructorResponse,
          instructorRespondedAt: courseReviews.instructorRespondedAt,
        })
        .from(courseReviews)
        .where(
          and(eq(courseReviews.courseId, courseId), eq(courseReviews.menteeId, mentee.id))
        )
        .limit(1);

      if (review) {
        myReview = review;
      }
    }
  }

  return {
    reviews: rows,
    myReview,
    pagination: {
      limit,
      offset,
      hasMore: rows.length === limit,
    },
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

export async function listPublicContentItemReviews(
  courseId: string,
  itemId: string,
  input: {
    limit?: number;
    offset?: number;
  }
) {
  const inCourse = await ensureContentItemInCourse(courseId, itemId);

  if (!inCourse) {
    throw new AppHttpError(404, 'Content item not found for this course');
  }

  const limit = Math.min(50, Math.max(1, input.limit ?? 10));
  const offset = Math.max(0, input.offset ?? 0);

  const rows = await db
    .select({
      id: contentItemReviews.id,
      rating: contentItemReviews.rating,
      title: contentItemReviews.title,
      review: contentItemReviews.review,
      createdAt: contentItemReviews.createdAt,
      helpfulVotes: contentItemReviews.helpfulVotes,
      instructorResponse: contentItemReviews.instructorResponse,
      instructorRespondedAt: contentItemReviews.instructorRespondedAt,
      reviewerName: users.name,
      reviewerImage: users.image,
    })
    .from(contentItemReviews)
    .innerJoin(mentees, eq(contentItemReviews.menteeId, mentees.id))
    .innerJoin(users, eq(mentees.userId, users.id))
    .where(
      and(
        eq(contentItemReviews.courseId, courseId),
        eq(contentItemReviews.contentItemId, itemId),
        eq(contentItemReviews.isPublished, true)
      )
    )
    .orderBy(desc(contentItemReviews.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    reviews: rows,
    pagination: {
      limit,
      offset,
      hasMore: rows.length === limit,
    },
  };
}
