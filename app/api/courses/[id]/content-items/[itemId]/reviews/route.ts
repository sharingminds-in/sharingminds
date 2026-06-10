import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  contentItemReviews,
  courses,
  courseModules,
  courseSections,
  sectionContentItems,
  mentees,
  users,
} from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';

interface RouteParams {
  params: Promise<{ id: string; itemId: string }>;
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// GET /api/courses/[id]/content-items/[itemId]/reviews
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: courseId, itemId } = await params;

    if (!uuidRegex.test(courseId) || !uuidRegex.test(itemId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid course or item id' },
        { status: 400 }
      );
    }

    const inCourse = await ensureContentItemInCourse(courseId, itemId);
    if (!inCourse) {
      return NextResponse.json(
        { success: false, error: 'Content item not found for this course' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || '10')));
    const offset = Math.max(0, Number(searchParams.get('offset') || '0'));

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

    return NextResponse.json({
      success: true,
      data: rows,
      pagination: {
        limit,
        offset,
        hasMore: rows.length === limit,
      },
    });
  } catch (error) {
    console.error('Failed to fetch content item reviews:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch reviews' },
      { status: 500 }
    );
  }
}
