import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { canViewCourseDetail } from '@/lib/courses/status';
import { 
  courses, 
  mentorContent, 
  courseModules,
  courseSections,
  sectionContentItems,
  courseReviews,
  courseEnrollments,
  mentors,
  users,
  mentees
} from '@/lib/db/schema';
import { eq, and, desc, count, avg, sql } from 'drizzle-orm';
import { resolveStorageUrl } from '@/lib/storage';
import { auth } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface CurriculumContentItem {
  id: string;
  title: string | null;
  description: string | null;
  type: string | null;
  orderIndex: number | null;
  duration: number | null;
  isPreview: boolean | null;
  fileUrl: string | null;
  content: string | null;
}

interface CurriculumSection {
  id: string;
  title: string | null;
  description: string | null;
  orderIndex: number | null;
  contentItems: CurriculumContentItem[];
}

interface CurriculumModule {
  id: string;
  title: string | null;
  description: string | null;
  orderIndex: number | null;
  learningObjectives: unknown[];
  estimatedDurationMinutes: number | null;
  sections: Map<string, CurriculumSection>;
}

// Helper function to safely parse JSON
function safeJsonParse<T>(jsonString: string | null | undefined, defaultValue: T): T {
  if (!jsonString) return defaultValue;
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn('Failed to parse JSON:', jsonString, error);
    return defaultValue;
  }
}

function compareOrderIndex(
  a: { orderIndex: number | null },
  b: { orderIndex: number | null }
) {
  return (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
}

// GET /api/courses/[id] - Get detailed course information
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await auth.api.getSession({ headers: request.headers });
    const userId = session?.user?.id || null;
    const isAuthenticated = Boolean(userId);
    let isEnrolled = false;
    let menteeId: string | null = null;

    if (isAuthenticated) {
      const menteeRecord = await db
        .select({ menteeId: mentees.id })
        .from(mentees)
        .where(eq(mentees.userId, userId as string))
        .limit(1);

      menteeId = menteeRecord[0]?.menteeId ?? null;

      if (menteeId) {
        const enrollment = await db
          .select({ id: courseEnrollments.id })
          .from(courseEnrollments)
          .where(and(
            eq(courseEnrollments.courseId, id),
            eq(courseEnrollments.menteeId, menteeId)
          ))
          .limit(1);

        isEnrolled = enrollment.length > 0;
      }
    }

    // Get course details with mentor info
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
        // Mentor info
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
      .where(eq(courses.id, id))
      .limit(1);

    if (!courseData.length) {
      return NextResponse.json(
        { success: false, error: 'Course not found' },
        { status: 404 }
      );
    }

    const course = courseData[0];

    const canAccessUnapprovedCourse = canViewCourseDetail({
      status: course.status,
      isEnrolled,
      isOwner: Boolean(userId) && course.mentorUserId === userId,
    });

    if (!canAccessUnapprovedCourse) {
      return NextResponse.json(
        { success: false, error: 'Course not found' },
        { status: 404 }
      );
    }

    // Get course curriculum (modules, sections, content items)
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
      .where(eq(courseModules.courseId, id))
      .orderBy(
        courseModules.orderIndex,
        courseSections.orderIndex,
        sectionContentItems.orderIndex
      );

    // Structure the curriculum data
    const modulesMap = new Map<string, CurriculumModule>();
    
    for (const item of curriculum) {
      if (!modulesMap.has(item.moduleId)) {
        modulesMap.set(item.moduleId, {
          id: item.moduleId,
          title: item.moduleTitle,
          description: item.moduleDescription,
          orderIndex: item.moduleOrderIndex,
          learningObjectives: safeJsonParse<unknown[]>(item.moduleLearningObjectives, []),
          estimatedDurationMinutes: item.moduleEstimatedDuration,
          sections: new Map<string, CurriculumSection>(),
        });
      }

      const moduleData = modulesMap.get(item.moduleId);
      if (!moduleData) {
        continue;
      }

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
        if ((!isAuthenticated || !isEnrolled) && !item.isPreview) {
          continue;
        }
        const section = moduleData.sections.get(item.sectionId);
        if (!section) {
          continue;
        }
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

    // Convert maps to arrays and sort
    const structuredCurriculum = Array.from(modulesMap.values()).map(module => ({
      ...module,
      sections: Array.from(module.sections.values()).sort(compareOrderIndex),
    })).sort(compareOrderIndex);

    // Get course statistics
    const stats = await db
      .select({
        avgRating: avg(courseReviews.rating),
        reviewCount: count(courseReviews.id),
        enrollmentCount: count(courseEnrollments.id),
      })
      .from(courses)
      .leftJoin(courseReviews, and(
        eq(courseReviews.courseId, courses.id),
        eq(courseReviews.isPublished, true)
      ))
      .leftJoin(courseEnrollments, eq(courseEnrollments.courseId, courses.id))
      .where(eq(courses.id, id))
      .groupBy(courses.id);

    const courseStats = stats[0] || { avgRating: 0, reviewCount: 0, enrollmentCount: 0 };

    // Get recent reviews
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
      .where(and(
        eq(courseReviews.courseId, id),
        eq(courseReviews.isPublished, true)
      ))
      .orderBy(desc(courseReviews.createdAt))
      .limit(10);

    // Calculate total content duration
    const totalDuration = structuredCurriculum.reduce((total, module) => {
      return total + module.sections.reduce((moduleTotal, section) => {
        return moduleTotal + section.contentItems.reduce((sectionTotal, item) => {
          return sectionTotal + (item.duration || 0);
        }, 0);
      }, 0);
    }, 0);

    // Calculate content counts
    const contentCounts = {
      modules: structuredCurriculum.length,
      sections: structuredCurriculum.reduce((total, module) => total + module.sections.length, 0),
      videos: 0,
      documents: 0,
      urls: 0,
      totalItems: 0,
    };

    structuredCurriculum.forEach(module => {
      module.sections.forEach(section => {
        section.contentItems.forEach(item => {
          contentCounts.totalItems++;
          if (item.type === 'VIDEO') contentCounts.videos++;
          else if (item.type === 'PDF' || item.type === 'DOCUMENT') contentCounts.documents++;
          else if (item.type === 'URL') contentCounts.urls++;
        });
      });
    });

    const mentorName = course.ownerType === 'PLATFORM'
      ? (course.platformName || 'Platform')
      : (course.mentorFullName || course.mentorName);

    // Parse JSON fields and structure response
    const courseDetails = {
      id: course.id,
      title: course.title,
      description: course.description,
      difficulty: course.difficulty,
      duration: course.duration,
      price: course.price,
      currency: course.currency,
      thumbnailUrl: course.thumbnailUrl,
      category: course.category,
      tags: safeJsonParse(course.tags, []),
      platformTags: safeJsonParse(course.platformTags, []),
      platformName: course.platformName,
      ownerType: course.ownerType,
      prerequisites: safeJsonParse(course.prerequisites, []),
      learningOutcomes: safeJsonParse(course.learningOutcomes, []),
      mentor: {
        id: course.ownerType === 'PLATFORM' ? null : course.mentorId,
        userId: course.ownerType === 'PLATFORM' ? null : course.mentorUserId,
        name: mentorName,
        image: course.ownerType === 'PLATFORM' ? null : course.mentorImage,
        title: course.ownerType === 'PLATFORM' ? null : course.mentorTitle,
        company: course.ownerType === 'PLATFORM' ? null : course.mentorCompany,
        bio: course.ownerType === 'PLATFORM' ? null : course.mentorAbout,
        expertise: course.ownerType === 'PLATFORM' ? [] : safeJsonParse(course.mentorExpertise, []),
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

    return NextResponse.json({
      success: true,
      data: courseDetails,
    });

  } catch (error) {
    console.error('Error fetching course details:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch course details' },
      { status: 500 }
    );
  }
}
