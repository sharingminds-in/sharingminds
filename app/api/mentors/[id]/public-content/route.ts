import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { mentorContent, mentors, mentorProfileContent, courses } from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { safeJsonParse } from '@/lib/utils/safe-json';
import { resolveStorageUrl } from '@/lib/storage';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: mentorId } = await params;

    // No auth required — public endpoint

    // Verify mentor exists
    const mentor = await db.select()
      .from(mentors)
      .where(eq(mentors.id, mentorId))
      .limit(1);

    if (!mentor.length) {
      return NextResponse.json({ error: 'Mentor not found' }, { status: 404 });
    }

    // Get profile-selected content (only APPROVED) ordered by displayOrder
    const profileContent = await db
      .select({
        content: {
          id: mentorContent.id,
          title: mentorContent.title,
          description: mentorContent.description,
          type: mentorContent.type,
          status: mentorContent.status,
          fileUrl: mentorContent.fileUrl,
          fileName: mentorContent.fileName,
          fileSize: mentorContent.fileSize,
          mimeType: mentorContent.mimeType,
          url: mentorContent.url,
          urlTitle: mentorContent.urlTitle,
          urlDescription: mentorContent.urlDescription,
        },
        displayOrder: mentorProfileContent.displayOrder,
      })
      .from(mentorProfileContent)
      .innerJoin(mentorContent, and(
        eq(mentorProfileContent.contentId, mentorContent.id),
        eq(mentorContent.status, 'APPROVED')
      ))
      .where(eq(mentorProfileContent.mentorId, mentorId))
      .orderBy(asc(mentorProfileContent.displayOrder));

    // Enrich with course details if applicable and resolve storage URLs
    const enrichedContent = await Promise.all(
      profileContent.map(async (item: { content: any; displayOrder: number }) => {
        const baseContent: any = {
          id: item.content.id,
          title: item.content.title,
          description: item.content.description,
          type: item.content.type,
          displayOrder: item.displayOrder,
        };

        // For FILE type — include file metadata
        if (item.content.type === 'FILE') {
          baseContent.fileName = item.content.fileName;
          baseContent.fileSize = item.content.fileSize;
          baseContent.mimeType = item.content.mimeType;
          baseContent.fileUrl = await resolveStorageUrl(item.content.fileUrl);
        }

        // For URL type — include URL info
        if (item.content.type === 'URL') {
          baseContent.url = item.content.url;
          baseContent.urlTitle = item.content.urlTitle;
          baseContent.urlDescription = item.content.urlDescription;
        }

        // For COURSE type — include course-level details
        if (item.content.type === 'COURSE') {
          const courseData = await db.select()
            .from(courses)
            .where(eq(courses.contentId, item.content.id))
            .limit(1);

          if (courseData.length) {
            baseContent.course = {
              difficulty: courseData[0].difficulty,
              duration: courseData[0].duration,
              price: courseData[0].price,
              currency: courseData[0].currency,
              thumbnailUrl: await resolveStorageUrl(courseData[0].thumbnailUrl),
              category: courseData[0].category,
              tags: safeJsonParse(courseData[0].tags),
              learningOutcomes: safeJsonParse(courseData[0].learningOutcomes),
              enrollmentCount: courseData[0].enrollmentCount,
            };
          }
        }

        return baseContent;
      })
    );

    return NextResponse.json({
      success: true,
      data: enrichedContent,
    });
  } catch (error) {
    console.error('Error fetching public content:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
