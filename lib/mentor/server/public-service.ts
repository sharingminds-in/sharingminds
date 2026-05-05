import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { listActiveSubscriptionUserIds } from '@/lib/db/queries/subscriptions';
import { courses, mentorContent, mentorProfileContent, mentors, users } from '@/lib/db/schema';
import { AppHttpError } from '@/lib/http/app-error';
import { consumeFeature, enforceFeature, isSubscriptionPolicyError } from '@/lib/subscriptions/policy-runtime';
import type { SubscriptionPolicyAction } from '@/lib/subscriptions/policies';
import { resolveStorageUrl } from '@/lib/storage';
import { safeJsonParse } from '@/lib/utils/safe-json';

export interface ListPublicMentorsInput {
  page?: number;
  pageSize?: number;
  q?: string;
  industry?: string;
  availableOnly?: boolean;
  aiSearch?: boolean;
  aiFilterOnly?: boolean;
}

async function resolveFeatureAccess(
  userId: string,
  primaryAction: 'ai.search.sessions' | 'mentor.ai.visibility',
  fallbackAction?: 'ai.search.sessions_monthly'
) {
  const primary = await enforceFeature({ action: primaryAction, userId }).catch((error) => {
    if (isSubscriptionPolicyError(error)) return null;
    throw error;
  });

  if (primary?.has_access) {
    return { action: primaryAction, access: primary };
  }

  if (fallbackAction) {
    const fallback = await enforceFeature({ action: fallbackAction, userId }).catch((error) => {
      if (isSubscriptionPolicyError(error)) return null;
      throw error;
    });

    if (fallback?.has_access) {
      return { action: fallbackAction, access: fallback };
    }

    return { action: primaryAction, access: primary || fallback };
  }

  return { action: primaryAction, access: primary };
}

async function tryFeatureAccess(userId: string, action: SubscriptionPolicyAction) {
  const result = await enforceFeature({ action, userId }).catch((error) => {
    if (isSubscriptionPolicyError(error)) return null;
    throw error;
  });

  return Boolean(result?.has_access);
}

async function ensureMenteeSessionAvailability(userId: string) {
  const freeAvailable = await tryFeatureAccess(userId, 'booking.mentee.free_session');
  if (freeAvailable) return true;

  return tryFeatureAccess(userId, 'booking.mentee.paid_session');
}

export async function listPublicMentors(
  requesterId: string | null,
  input: ListPublicMentorsInput
) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 12));
  const q = input.q?.trim() ?? '';
  const industry = input.industry?.trim() ?? '';
  const availableOnly = input.availableOnly ?? true;
  const aiSearch = input.aiSearch ?? false;
  const aiFilterOnly = input.aiFilterOnly ?? false;
  const requiresAiEligibilityFilters = aiSearch || aiFilterOnly;
  const offset = (page - 1) * pageSize;

  if (aiSearch) {
    if (!requesterId) {
      throw new AppHttpError(401, 'Authentication required for AI search');
    }

    const requesterAccess = await resolveFeatureAccess(
      requesterId,
      'ai.search.sessions',
      'ai.search.sessions_monthly'
    );

    if (!requesterAccess.access?.has_access) {
      const errorPayload = (requesterAccess.access as any)?.payload;
      throw new AppHttpError(
        403,
        typeof errorPayload?.error === 'string'
          ? errorPayload.error
          : 'AI search not included in your plan'
      );
    }

    const sessionAvailability = await ensureMenteeSessionAvailability(requesterId);
    if (!sessionAvailability) {
      throw new AppHttpError(403, 'Session bookings are not included in your plan');
    }
  }

  const whereClauses: any[] = [eq(mentors.verificationStatus, 'VERIFIED' as const)];

  if (availableOnly) {
    whereClauses.push(eq(mentors.isAvailable, true));
  }

  if (requiresAiEligibilityFilters) {
    whereClauses.push(eq(mentors.searchMode, 'AI_SEARCH'));
  }

  if (industry) {
    whereClauses.push(ilike(mentors.industry, `%${industry}%`));
  }

  if (q && !requiresAiEligibilityFilters) {
    whereClauses.push(
      or(
        ilike(users.name, `%${q}%`),
        ilike(mentors.title, `%${q}%`),
        ilike(mentors.company, `%${q}%`),
        ilike(mentors.expertise, `%${q}%`),
        ilike(mentors.headline, `%${q}%`),
        ilike(mentors.about, `%${q}%`),
        sql`EXISTS (SELECT 1 FROM ${courses} WHERE ${courses.ownerId} = ${mentors.id} AND ${courses.tags} ILIKE ${'%' + q + '%'})`,
      )
    );
  }

  const qLike = `%${q}%`;

  // Tiered relevance: 4 = exact skill token match, 3 = expertise/headline substring,
  // 2 = about/company substring, 1 = name/title substring, 0 = no text match (e.g. course tag only)
  const relevanceExpr = sql<number>`(CASE
    WHEN ${q} <> '' AND EXISTS (
      SELECT 1 FROM unnest(string_to_array(COALESCE(${mentors.expertise}, ''), ',')) AS _s
      WHERE trim(lower(_s)) = lower(${q})
    ) THEN 4
    WHEN ${q} <> '' AND (${mentors.expertise} ILIKE ${qLike} OR ${mentors.headline} ILIKE ${qLike}) THEN 3
    WHEN ${q} <> '' AND (${mentors.about} ILIKE ${qLike} OR ${mentors.company} ILIKE ${qLike}) THEN 2
    WHEN ${q} <> '' AND (${users.name} ILIKE ${qLike} OR ${mentors.title} ILIKE ${qLike}) THEN 1
    ELSE 0
  END)`;

  const rows = await db
    .select({
      id: mentors.id,
      userId: mentors.userId,
      title: mentors.title,
      company: mentors.company,
      industry: mentors.industry,
      expertise: mentors.expertise,
      experience: mentors.experience,
      hourlyRate: mentors.hourlyRate,
      currency: mentors.currency,
      headline: mentors.headline,
      about: mentors.about,
      linkedinUrl: mentors.linkedinUrl,
      githubUrl: mentors.githubUrl,
      websiteUrl: mentors.websiteUrl,
      verificationStatus: mentors.verificationStatus,
      isAvailable: mentors.isAvailable,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(mentors)
    .innerJoin(users, eq(mentors.userId, users.id))
    .where(and(...whereClauses))
    .orderBy(desc(relevanceExpr), desc(mentors.createdAt))
    .limit(pageSize)
    .offset(offset);

  type MentorRow = (typeof rows)[number];
  let filteredRows = rows;

  if (requiresAiEligibilityFilters && filteredRows.length > 0) {
    const mentorUserIds = filteredRows.map((row) => row.userId);
    const eligibleMentorIds = await listActiveSubscriptionUserIds(mentorUserIds);
    filteredRows = filteredRows.filter((row) => eligibleMentorIds.has(row.userId));
  }

  if (aiSearch && requesterId && filteredRows.length > 0) {
    const eligibilityChecks = await Promise.all(
      filteredRows.map(async (row: MentorRow) => {
        try {
          const [freeAccess, paidAccess, visibilityAccess] = await Promise.all([
            enforceFeature({ action: 'mentor.free_session_availability', userId: row.userId }).catch(
              (error) => {
                if (isSubscriptionPolicyError(error)) return null;
                throw error;
              }
            ),
            enforceFeature({ action: 'mentor.paid_session_availability', userId: row.userId }).catch(
              (error) => {
                if (isSubscriptionPolicyError(error)) return null;
                throw error;
              }
            ),
            resolveFeatureAccess(row.userId, 'mentor.ai.visibility'),
          ]);

          const sessionAvailable =
            Boolean((freeAccess as any)?.has_access) ||
            Boolean((paidAccess as any)?.has_access);

          return {
            row,
            eligible: sessionAvailable && (visibilityAccess as any)?.access?.has_access === true,
            visibilityAction: (visibilityAccess as any)?.action,
          };
        } catch (error) {
          console.error('Failed to check mentor eligibility:', error);
          return { row, eligible: false, visibilityAction: null };
        }
      })
    );

    filteredRows = eligibilityChecks
      .filter((item) => item.eligible)
      .map((item) => item.row);

    const visibilityKeyByUser = new Map<string, SubscriptionPolicyAction>(
      eligibilityChecks
        .filter((item) => item.eligible)
        .map((item) => [item.row.userId, item.visibilityAction || 'mentor.ai.visibility'])
    );

    const requesterAccess = await resolveFeatureAccess(
      requesterId,
      'ai.search.sessions',
      'ai.search.sessions_monthly'
    );

    if (requesterAccess.access?.has_access) {
      await consumeFeature({
        action: requesterAccess.action,
        userId: requesterId,
        resourceType: 'ai_search',
      });
    }

    for (const row of filteredRows) {
      const visibilityAction = visibilityKeyByUser.get(row.userId);
      if (!visibilityAction) continue;

      try {
        await consumeFeature({
          action: visibilityAction,
          userId: row.userId,
          resourceType: 'mentor_profile',
          resourceId: row.id,
        });
      } catch (error) {
        console.error('Failed to track mentor visibility:', error);
      }
    }
  }

  return {
    mentors: filteredRows,
    pagination: {
      page,
      pageSize,
      hasMore: filteredRows.length === pageSize,
    },
  };
}

export async function getMentorPublicContent(mentorId: string) {
  const [mentor] = await db
    .select({ id: mentors.id })
    .from(mentors)
    .where(eq(mentors.id, mentorId))
    .limit(1);

  if (!mentor) {
    throw new AppHttpError(404, 'Mentor not found');
  }

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
    .innerJoin(
      mentorContent,
      and(
        eq(mentorProfileContent.contentId, mentorContent.id),
        eq(mentorContent.status, 'APPROVED')
      )
    )
    .where(eq(mentorProfileContent.mentorId, mentorId))
    .orderBy(asc(mentorProfileContent.displayOrder));

  return Promise.all(
    profileContent.map(async (item) => {
      const baseContent: any = {
        id: item.content.id,
        title: item.content.title,
        description: item.content.description,
        type: item.content.type,
        displayOrder: item.displayOrder,
      };

      if (item.content.type === 'FILE') {
        baseContent.fileName = item.content.fileName;
        baseContent.fileSize = item.content.fileSize;
        baseContent.mimeType = item.content.mimeType;
        baseContent.fileUrl = await resolveStorageUrl(item.content.fileUrl);
      }

      if (item.content.type === 'URL') {
        baseContent.url = item.content.url;
        baseContent.urlTitle = item.content.urlTitle;
        baseContent.urlDescription = item.content.urlDescription;
      }

      if (item.content.type === 'COURSE') {
        const [courseData] = await db
          .select()
          .from(courses)
          .where(eq(courses.contentId, item.content.id))
          .limit(1);

        if (courseData) {
          baseContent.course = {
            courseId: courseData.id,
            difficulty: courseData.difficulty,
            duration: courseData.duration,
            price: courseData.price,
            currency: courseData.currency,
            thumbnailUrl: await resolveStorageUrl(courseData.thumbnailUrl),
            category: courseData.category,
            tags: safeJsonParse(courseData.tags),
            learningOutcomes: safeJsonParse(courseData.learningOutcomes),
            enrollmentCount: courseData.enrollmentCount,
          };
        }
      }

      return baseContent;
    })
  );
}
