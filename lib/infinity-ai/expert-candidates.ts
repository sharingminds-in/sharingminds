import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  aiAdminBoostRules,
  aiExpertProfiles,
  aiRecommendationEvents,
  courses,
  mentorContent,
  mentors,
  reviews,
  sessions,
  subscriptionFeatures,
  subscriptionPlanFeatures,
  subscriptionPlans,
  subscriptions,
  subscriptionUsageTracking,
  users,
} from '@/lib/db/schema';
import type { AiExpertCandidate } from '@/lib/infinity-ai/schemas';
import { resolveStorageUrl } from '@/lib/storage';
import { FEATURE_KEYS } from '@/lib/subscriptions/feature-keys';
import { safeJsonParse } from '@/lib/utils/safe-json';

const INTENT_KEYWORDS: Record<string, string[]> = {
  career_growth: ['career', 'promotion', 'growth', 'leadership', 'positioning', 'employability'],
  work_abroad: ['work abroad', 'international', 'global hiring', 'relocation', 'visa', 'overseas'],
  study_abroad: ['study abroad', 'admission', 'university', 'ms', 'mba', 'sop', 'gre'],
  career_switching: ['career switch', 'career change', 'pivot', 'transition', 'switch'],
  technical_growth: ['engineering', 'software', 'developer', 'ai', 'ml', 'data', 'backend', 'frontend'],
  research_pathways: ['research', 'phd', 'publication', 'scholar', 'academic'],
  startup_scaling: ['startup', 'scale', 'scaling', 'founder', 'growth'],
  funding: ['funding', 'fundraising', 'investor', 'capital', 'seed'],
  hiring: ['hiring', 'recruiting', 'talent'],
  team_building: ['team', 'org design', 'culture'],
  branding: ['brand', 'branding', 'positioning'],
  gtm: ['gtm', 'go to market', 'sales', 'distribution', 'market entry'],
  business_operations: ['operations', 'process', 'manufacturing', 'execution'],
  leadership: ['leadership', 'manager', 'executive', 'people management'],
  ai_adoption: ['ai adoption', 'automation', 'workflow redesign', 'enterprise ai'],
  compliance: ['compliance', 'governance', 'risk'],
  manufacturing: ['manufacturing', 'factory', 'supply chain'],
  burnout: ['burnout', 'stress', 'overwhelm'],
};

const OUTCOME_KEYWORDS: Record<string, string[]> = {
  clarity: ['clarity', 'direction'],
  promotion: ['promotion', 'career growth'],
  investors: ['investor', 'funding'],
  better_team: ['team', 'hiring'],
  business_growth: ['growth', 'scale', 'revenue'],
  career_switch: ['pivot', 'switch', 'transition'],
  global_opportunities: ['international', 'global', 'abroad'],
  confidence: ['confidence', 'positioning'],
  strategic_sequencing: ['roadmap', 'sequence', 'plan'],
  session_readiness: ['session', 'prepare', 'readiness'],
};

const PERSONA_KEYWORDS: Record<string, string[]> = {
  confused_student: ['student', 'college', 'campus', 'graduate'],
  fresher: ['fresher', 'entry level', 'new grad'],
  mid_career_professional: ['manager', 'senior', 'lead', 'experienced professional'],
  career_switcher: ['career change', 'transition', 'pivot'],
  founder: ['founder', 'startup', 'entrepreneur'],
  sme_owner: ['business owner', 'sme', 'small business'],
  enterprise_leader: ['enterprise', 'director', 'vp', 'head of'],
  corporate_hr: ['hr', 'people ops', 'talent'],
  parent: ['parent'],
  research_scholar: ['research', 'phd', 'scholar'],
};

function normalizeTag(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 +/&-]/g, '');
}

function uniqueTags(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => Boolean(value))
        .map((value) => normalizeTag(value))
        .filter(Boolean)
    )
  );
}

function parseLooseTags(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return uniqueTags(value.map((item) => String(item)));
  }

  if (typeof value !== 'string') {
    return [];
  }

  const parsed = safeJsonParse(value);
  if (Array.isArray(parsed)) {
    return uniqueTags(parsed.map((item) => String(item)));
  }

  return uniqueTags(value.split(/[;,|]/g));
}

function deriveMappedTags(text: string, mapping: Record<string, string[]>) {
  const normalized = normalizeTag(text);
  return Object.entries(mapping)
    .filter(([, keywords]) => keywords.some((keyword) => normalized.includes(normalizeTag(keyword))))
    .map(([key]) => key);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

const INFINITY_MENTOR_FEATURE_KEYS = [
  FEATURE_KEYS.AI_VISIBILITY,
  FEATURE_KEYS.FREE_VIDEO_SESSIONS_MONTHLY,
  FEATURE_KEYS.PAID_VIDEO_SESSIONS_MONTHLY,
] as const;

interface MentorFeatureAccessRow {
  userId: string;
  featureKey: string;
  valueType: 'boolean' | 'count' | 'minutes' | 'text' | 'amount' | 'percent' | 'json';
  isMetered: boolean;
  isIncluded: boolean;
  limitCount: number | null;
  limitMinutes: number | null;
  limitAmount: string | number | null;
  usageCount: number | null;
  usageMinutes: number | null;
  usageAmount: string | number | null;
}

interface MentorEligibility {
  eligible: boolean;
  hasActiveMentorSubscription: boolean;
  hasAiVisibility: boolean;
  hasFreeSessionAvailability: boolean;
  hasPaidSessionAvailability: boolean;
}

function toNumber(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function hasPlanFeatureAccess(row: MentorFeatureAccessRow) {
  if (!row.isIncluded) {
    return false;
  }

  if (row.valueType === 'boolean') {
    return true;
  }

  if (!row.isMetered) {
    return true;
  }

  if (row.valueType === 'count' && row.limitCount !== null) {
    return row.limitCount - (row.usageCount ?? 0) > 0;
  }

  if (row.valueType === 'minutes' && row.limitMinutes !== null) {
    return row.limitMinutes - (row.usageMinutes ?? 0) > 0;
  }

  if (row.valueType === 'amount' && row.limitAmount !== null) {
    return toNumber(row.limitAmount) - toNumber(row.usageAmount) > 0;
  }

  return true;
}

export function buildInfinityMentorEligibility(
  userIds: string[],
  featureRows: MentorFeatureAccessRow[]
) {
  const uniqueUserIds = Array.from(new Set(userIds));
  const eligibilityByUser = new Map<string, MentorEligibility>();

  for (const userId of uniqueUserIds) {
    eligibilityByUser.set(userId, {
      eligible: false,
      hasActiveMentorSubscription: false,
      hasAiVisibility: false,
      hasFreeSessionAvailability: false,
      hasPaidSessionAvailability: false,
    });
  }

  for (const row of featureRows) {
    const existing = eligibilityByUser.get(row.userId);
    if (!existing) {
      continue;
    }

    existing.hasActiveMentorSubscription = true;

    if (!hasPlanFeatureAccess(row)) {
      continue;
    }

    if (row.featureKey === FEATURE_KEYS.AI_VISIBILITY) {
      existing.hasAiVisibility = true;
    } else if (row.featureKey === FEATURE_KEYS.FREE_VIDEO_SESSIONS_MONTHLY) {
      existing.hasFreeSessionAvailability = true;
    } else if (row.featureKey === FEATURE_KEYS.PAID_VIDEO_SESSIONS_MONTHLY) {
      existing.hasPaidSessionAvailability = true;
    }
  }

  for (const eligibility of eligibilityByUser.values()) {
    eligibility.eligible =
      eligibility.hasActiveMentorSubscription &&
      eligibility.hasAiVisibility &&
      (eligibility.hasFreeSessionAvailability || eligibility.hasPaidSessionAvailability);
  }

  return eligibilityByUser;
}

async function listInfinityMentorEligibility(userIds: string[]) {
  const uniqueUserIds = Array.from(new Set(userIds));

  if (uniqueUserIds.length === 0) {
    return new Map<string, MentorEligibility>();
  }

  const now = new Date();
  const featureRows = await db
    .select({
      userId: subscriptions.userId,
      featureKey: subscriptionFeatures.featureKey,
      valueType: subscriptionFeatures.valueType,
      isMetered: subscriptionFeatures.isMetered,
      isIncluded: subscriptionPlanFeatures.isIncluded,
      limitCount: subscriptionPlanFeatures.limitCount,
      limitMinutes: subscriptionPlanFeatures.limitMinutes,
      limitAmount: subscriptionPlanFeatures.limitAmount,
      usageCount: subscriptionUsageTracking.usageCount,
      usageMinutes: subscriptionUsageTracking.usageMinutes,
      usageAmount: subscriptionUsageTracking.usageAmount,
    })
    .from(subscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptions.planId))
    .innerJoin(subscriptionPlanFeatures, eq(subscriptionPlanFeatures.planId, subscriptions.planId))
    .innerJoin(subscriptionFeatures, eq(subscriptionFeatures.id, subscriptionPlanFeatures.featureId))
    .leftJoin(
      subscriptionUsageTracking,
      and(
        eq(subscriptionUsageTracking.subscriptionId, subscriptions.id),
        eq(subscriptionUsageTracking.featureId, subscriptionFeatures.id),
        sql`${subscriptionUsageTracking.periodStart} <= ${now.toISOString()}`,
        sql`${subscriptionUsageTracking.periodEnd} >= ${now.toISOString()}`
      )
    )
    .where(
      and(
        inArray(subscriptions.userId, uniqueUserIds),
        inArray(subscriptions.status, ['trialing', 'active']),
        eq(subscriptionPlans.audience, 'mentor'),
        eq(subscriptionPlanFeatures.isIncluded, true),
        inArray(subscriptionFeatures.featureKey, [...INFINITY_MENTOR_FEATURE_KEYS])
      )
    );

  return buildInfinityMentorEligibility(uniqueUserIds, featureRows);
}

export async function listInfinityExpertCandidates(_input: {
  signalSnapshot?: Record<string, unknown>;
}) {
  const mentorRows = await db
    .select({
      mentorProfileId: mentors.id,
      mentorUserId: mentors.userId,
      title: mentors.title,
      company: mentors.company,
      industry: mentors.industry,
      expertise: mentors.expertise,
      experienceYears: mentors.experience,
      hourlyRate: mentors.hourlyRate,
      currency: mentors.currency,
      headline: mentors.headline,
      about: mentors.about,
      city: mentors.city,
      country: mentors.country,
      profileImageUrl: mentors.profileImageUrl,
      userName: users.name,
      userImage: users.image,
    })
    .from(mentors)
    .innerJoin(users, eq(mentors.userId, users.id))
    .where(
      and(
        eq(mentors.verificationStatus, 'VERIFIED'),
        eq(mentors.isAvailable, true),
        eq(mentors.searchMode, 'AI_SEARCH')
      )
    )
    .orderBy(desc(mentors.updatedAt));

  const eligibilityByUser = await listInfinityMentorEligibility(
    mentorRows.map((row) => row.mentorUserId)
  );
  const eligibleRows = mentorRows.filter((row) => eligibilityByUser.get(row.mentorUserId)?.eligible);
  const mentorProfileIds = eligibleRows.map((row) => row.mentorProfileId);
  const mentorUserIds = eligibleRows.map((row) => row.mentorUserId);

  if (eligibleRows.length === 0) {
    return { candidates: [] as AiExpertCandidate[] };
  }

  const [existingProfiles, reviewAggRows, sessionAggRows, contentAggRows, eventAggRows, boostRows] =
    await Promise.all([
      db
        .select()
        .from(aiExpertProfiles)
        .where(inArray(aiExpertProfiles.mentorProfileId, mentorProfileIds)),
      db
        .select({
          mentorUserId: reviews.revieweeId,
          avgReviewScore: sql<number>`coalesce(avg(cast(${reviews.finalScore} as decimal)), 0)::float`,
          reviewCount: sql<number>`count(*)::int`,
        })
        .from(reviews)
        .where(inArray(reviews.revieweeId, mentorUserIds))
        .groupBy(reviews.revieweeId),
      db
        .select({
          mentorUserId: sessions.mentorId,
          completedSessions: sql<number>`sum(case when ${sessions.status} = 'completed' then 1 else 0 end)::int`,
          cancelledSessions: sql<number>`sum(case when ${sessions.status} = 'cancelled' then 1 else 0 end)::int`,
        })
        .from(sessions)
        .where(inArray(sessions.mentorId, mentorUserIds))
        .groupBy(sessions.mentorId),
      db
        .select({
          mentorProfileId: mentorContent.mentorId,
          approvedContentCount: sql<number>`count(*)::int`,
          courseCount: sql<number>`sum(case when ${courses.id} is not null then 1 else 0 end)::int`,
        })
        .from(mentorContent)
        .leftJoin(courses, eq(courses.contentId, mentorContent.id))
        .where(
          and(inArray(mentorContent.mentorId, mentorProfileIds), eq(mentorContent.status, 'APPROVED'))
        )
        .groupBy(mentorContent.mentorId),
      db
        .select({
          mentorProfileId: aiRecommendationEvents.mentorProfileId,
          recentImpressions7d: sql<number>`sum(case when ${aiRecommendationEvents.eventType} = 'impression' and ${aiRecommendationEvents.createdAt} >= now() - interval '7 days' then 1 else 0 end)::int`,
          recentClicks7d: sql<number>`sum(case when ${aiRecommendationEvents.eventType} = 'click' and ${aiRecommendationEvents.createdAt} >= now() - interval '7 days' then 1 else 0 end)::int`,
          recentBookings30d: sql<number>`sum(case when ${aiRecommendationEvents.eventType} = 'booking_attributed' and ${aiRecommendationEvents.createdAt} >= now() - interval '30 days' then 1 else 0 end)::int`,
          recentCompletions90d: sql<number>`sum(case when ${aiRecommendationEvents.eventType} = 'completion_attributed' and ${aiRecommendationEvents.createdAt} >= now() - interval '90 days' then 1 else 0 end)::int`,
          lastShownAt: sql<Date | null>`max(case when ${aiRecommendationEvents.eventType} = 'impression' then ${aiRecommendationEvents.createdAt} else null end)`,
        })
        .from(aiRecommendationEvents)
        .where(inArray(aiRecommendationEvents.mentorProfileId, mentorProfileIds))
        .groupBy(aiRecommendationEvents.mentorProfileId),
      db
        .select()
        .from(aiAdminBoostRules)
        .where(
          and(
            inArray(aiAdminBoostRules.mentorProfileId, mentorProfileIds),
            eq(aiAdminBoostRules.status, 'active'),
            sql`${aiAdminBoostRules.startsAt} <= now()`,
            sql`${aiAdminBoostRules.expiresAt} >= now()`
          )
        ),
    ]);

  const reviewAggByUser = new Map(reviewAggRows.map((row) => [row.mentorUserId, row]));
  const sessionAggByUser = new Map(sessionAggRows.map((row) => [row.mentorUserId, row]));
  const contentAggByProfile = new Map(contentAggRows.map((row) => [row.mentorProfileId, row]));
  const eventAggByProfile = new Map(eventAggRows.map((row) => [row.mentorProfileId, row]));
  const existingProfileByMentor = new Map(existingProfiles.map((row) => [row.mentorProfileId, row]));
  const boostRulesByProfile = new Map<string, typeof boostRows>();

  for (const rule of boostRows) {
    const existing = boostRulesByProfile.get(rule.mentorProfileId) ?? [];
    existing.push(rule);
    boostRulesByProfile.set(rule.mentorProfileId, existing);
  }

  const upsertValues: (typeof aiExpertProfiles.$inferInsert)[] = [];
  const candidates: AiExpertCandidate[] = [];

  for (const row of eligibleRows) {
    const expertiseTags = parseLooseTags(row.expertise);
    const rawTagText = [
      row.title,
      row.company,
      row.industry,
      row.expertise,
      row.headline,
      row.about,
    ]
      .filter(Boolean)
      .join(' | ');

    const derivedIntentTags = uniqueTags([
      ...deriveMappedTags(rawTagText, INTENT_KEYWORDS),
      ...expertiseTags.slice(0, 8),
    ]);
    const derivedOutcomeTags = uniqueTags([
      ...deriveMappedTags(rawTagText, OUTCOME_KEYWORDS),
      ...expertiseTags.filter((tag) => tag.includes('growth') || tag.includes('transition')),
    ]);
    const derivedIndustryTags = uniqueTags([row.industry, ...expertiseTags]);
    const derivedPersonaTags = uniqueTags(deriveMappedTags(rawTagText, PERSONA_KEYWORDS));

    const reviewAgg = reviewAggByUser.get(row.mentorUserId);
    const sessionAgg = sessionAggByUser.get(row.mentorUserId);
    const contentAgg = contentAggByProfile.get(row.mentorProfileId);
    const eventAgg = eventAggByProfile.get(row.mentorProfileId);

    const completedSessions = sessionAgg?.completedSessions ?? 0;
    const cancelledSessions = sessionAgg?.cancelledSessions ?? 0;
    const reviewCount = reviewAgg?.reviewCount ?? 0;
    const avgReviewScore = reviewAgg?.avgReviewScore ?? 0;
    const approvedContentCount = contentAgg?.approvedContentCount ?? 0;
    const courseCount = contentAgg?.courseCount ?? 0;
    const recentImpressions7d = eventAgg?.recentImpressions7d ?? 0;
    const recentClicks7d = eventAgg?.recentClicks7d ?? 0;
    const recentBookings30d = eventAgg?.recentBookings30d ?? 0;
    const recentCompletions90d = eventAgg?.recentCompletions90d ?? 0;
    const lastShownAt = eventAgg?.lastShownAt ?? null;

    const keywordTrustScore = clamp01(
      0.3 +
        Math.min(expertiseTags.length, 6) * 0.07 +
        (row.headline ? 0.15 : 0) +
        (row.about ? 0.15 : 0)
    );
    const contentAuthorityScore = clamp01(
      approvedContentCount * 0.12 + courseCount * 0.16 + (avgReviewScore / 5) * 0.2
    );
    const qualityScore = clamp01(
      (avgReviewScore / 5) * 0.55 +
        Math.min(completedSessions, 12) / 12 * 0.3 -
        Math.min(cancelledSessions, 6) / 6 * 0.15
    );
    const conversionScore = clamp01(
      Math.min(recentBookings30d, 6) / 6 * 0.4 +
        Math.min(recentCompletions90d, 10) / 10 * 0.35 +
        Math.min(recentClicks7d, 10) / 10 * 0.1 +
        (avgReviewScore / 5) * 0.15
    );

    const derivedAllocationSnapshot = {
      recentImpressions7d,
      recentClicks7d,
      recentBookings30d,
      recentCompletions90d,
      lastShownAt: lastShownAt ? new Date(lastShownAt).toISOString() : null,
    };

    upsertValues.push({
      mentorProfileId: row.mentorProfileId,
      mentorUserId: row.mentorUserId,
      intentTags: derivedIntentTags,
      outcomeTags: derivedOutcomeTags,
      industryTags: derivedIndustryTags,
      personaFitTags: derivedPersonaTags,
      keywordTrustScore: keywordTrustScore.toFixed(3),
      contentAuthorityScore: contentAuthorityScore.toFixed(3),
      qualityScore: qualityScore.toFixed(3),
      conversionScore: conversionScore.toFixed(3),
      allocationSnapshot: derivedAllocationSnapshot,
      metadataQualityStatus: 'derived_v1',
    });

    const storedProfile = existingProfileByMentor.get(row.mentorProfileId);
    const image = await resolveStorageUrl(row.profileImageUrl);
    const boostRules = boostRulesByProfile.get(row.mentorProfileId) ?? [];

    candidates.push({
      mentorProfileId: row.mentorProfileId,
      mentorUserId: row.mentorUserId,
      name: row.userName || 'Mentor',
      title: row.title,
      company: row.company,
      industry: row.industry,
      headline: row.headline,
      about: row.about,
      image: image || row.userImage || null,
      location: [row.city, row.country].filter(Boolean).join(', ') || null,
      hourlyRate: row.hourlyRate ? Number(row.hourlyRate) : null,
      currency: row.currency ?? null,
      experienceYears: row.experienceYears ?? null,
      expertise: expertiseTags,
      intentTags: derivedIntentTags,
      outcomeTags: derivedOutcomeTags,
      industryTags: derivedIndustryTags,
      personaFitTags: derivedPersonaTags,
      keywordTrustScore,
      contentAuthorityScore,
      qualityScore,
      conversionScore,
      allocationSnapshot: derivedAllocationSnapshot,
      metadataQualityStatus: storedProfile?.metadataQualityStatus ?? 'derived_v1',
      metrics: {
        completedSessions,
        cancelledSessions,
        avgReviewScore,
        reviewCount,
        recentImpressions7d,
        recentClicks7d,
        recentBookings30d,
        recentCompletions90d,
        lastShownAt: lastShownAt ? new Date(lastShownAt).toISOString() : null,
      },
      activeBoostRules: boostRules.map((rule) => ({
        id: rule.id,
        mentorProfileId: rule.mentorProfileId,
        ruleType: rule.ruleType,
        categoryScope: (rule.categoryScope ?? {}) as Record<string, unknown>,
        priorityMultiplier: Number(rule.priorityMultiplier),
        inclusionPercentageCap: rule.inclusionPercentageCap,
        maxImpressions: rule.maxImpressions ?? null,
        startsAt: rule.startsAt.toISOString(),
        expiresAt: rule.expiresAt.toISOString(),
        status: rule.status,
        reason: rule.reason,
      })),
    });
  }

  if (upsertValues.length > 0) {
    await db
      .insert(aiExpertProfiles)
      .values(upsertValues)
      .onConflictDoUpdate({
        target: aiExpertProfiles.mentorProfileId,
        set: {
          intentTags: sql`excluded.intent_tags`,
          outcomeTags: sql`excluded.outcome_tags`,
          industryTags: sql`excluded.industry_tags`,
          personaFitTags: sql`excluded.persona_fit_tags`,
          keywordTrustScore: sql`excluded.keyword_trust_score`,
          contentAuthorityScore: sql`excluded.content_authority_score`,
          qualityScore: sql`excluded.quality_score`,
          conversionScore: sql`excluded.conversion_score`,
          allocationSnapshot: sql`excluded.allocation_snapshot`,
          metadataQualityStatus: sql`excluded.metadata_quality_status`,
          updatedAt: sql`now()`,
        },
      });
  }

  return {
    candidates,
  };
}
