import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  courseReviews,
  courseReviewHelpfulVotes,
  mentees,
  users,
} from '@/lib/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/courses/[id]/reviews
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: courseId } = await params;

    if (!uuidRegex.test(courseId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid course id' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || '10')));
    const offset = Math.max(0, Number(searchParams.get('offset') || '0'));
    const includeMine = searchParams.get('includeMine') === 'true';

    const session = await auth.api.getSession({ headers: request.headers });
    const viewerId = session?.user?.id || null;

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
          viewerId ? eq(courseReviewHelpfulVotes.userId, viewerId) : sql<boolean>`false`
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
            and(
              eq(courseReviews.courseId, courseId),
              eq(courseReviews.menteeId, mentee.id)
            )
          )
          .limit(1);
        if (review) myReview = review;
      }
    }

    return NextResponse.json({
      success: true,
      data: rows,
      myReview,
      pagination: {
        limit,
        offset,
        hasMore: rows.length === limit,
      },
    });
  } catch (error) {
    console.error('Failed to fetch course reviews:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch reviews' },
      { status: 500 }
    );
  }
}
