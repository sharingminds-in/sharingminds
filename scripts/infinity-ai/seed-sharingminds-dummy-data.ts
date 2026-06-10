import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq, sql } from 'drizzle-orm';
import { v5 as uuidv5 } from 'uuid';

import {
  aiAdminBoostRules,
  aiExpertProfiles,
  aiRecommendationEvents,
  client,
  courses,
  db,
  mentorContent,
  mentors,
  reviews,
  sessions,
  subscriptionFeatures,
  subscriptionPlanFeatures,
  subscriptionPlans,
  subscriptions,
  users,
} from '../../lib/db';
import { FEATURE_KEYS } from '../../lib/subscriptions/feature-keys';

const SEED_BATCH = 'sharingminds_dummy_seed_v1';
const USER_PREFIX = 'seed-sharingminds-';
const EMAIL_DOMAIN = 'sharingminds-dummy.local';
const UUID_NAMESPACE = uuidv5('young-minds.infinity-ai.sharingminds-dummy-seed.v1', uuidv5.URL);

type SourceProfile = {
  source: 'expert_profiles' | 'rnd_profiles';
  profileId: string;
  expertName: string;
  ecosystemSegment: string;
  primaryDomain: string;
  sharingMindsLayer: string;
  keyExpertise: string;
  potentialRole: string;
  keywords: string;
};

type SeedBucketKey =
  | 'boosted_premium_expert'
  | 'high_quality_expert'
  | 'underexposed_new_expert'
  | 'basic_free_only_mentor'
  | 'paid_only_specialist'
  | 'overexposed_quality_mentor'
  | 'no_ai_visibility'
  | 'no_session_availability'
  | 'exclusive_search'
  | 'unavailable'
  | 'unverified'
  | 'inactive_subscription';

type SeedBucket = {
  key: SeedBucketKey;
  eligibleForAi: boolean;
  isExpert: boolean;
  planKey: string;
  subscriptionStatus: 'active' | 'trialing' | 'canceled';
  verificationStatus: 'VERIFIED' | 'IN_PROGRESS' | 'YET_TO_APPLY';
  isAvailable: boolean;
  searchMode: 'AI_SEARCH' | 'EXCLUSIVE_SEARCH';
  boost: boolean;
  quality: 'high' | 'medium' | 'new' | 'overexposed' | 'blocked';
};

const BUCKETS: SeedBucket[] = [
  {
    key: 'boosted_premium_expert',
    eligibleForAi: true,
    isExpert: true,
    planKey: 'sharingminds_dummy_mentor_premium',
    subscriptionStatus: 'active',
    verificationStatus: 'VERIFIED',
    isAvailable: true,
    searchMode: 'AI_SEARCH',
    boost: true,
    quality: 'high',
  },
  {
    key: 'high_quality_expert',
    eligibleForAi: true,
    isExpert: true,
    planKey: 'sharingminds_dummy_mentor_premium',
    subscriptionStatus: 'active',
    verificationStatus: 'VERIFIED',
    isAvailable: true,
    searchMode: 'AI_SEARCH',
    boost: false,
    quality: 'high',
  },
  {
    key: 'underexposed_new_expert',
    eligibleForAi: true,
    isExpert: true,
    planKey: 'sharingminds_dummy_mentor_basic',
    subscriptionStatus: 'trialing',
    verificationStatus: 'VERIFIED',
    isAvailable: true,
    searchMode: 'AI_SEARCH',
    boost: false,
    quality: 'new',
  },
  {
    key: 'basic_free_only_mentor',
    eligibleForAi: true,
    isExpert: false,
    planKey: 'sharingminds_dummy_mentor_basic',
    subscriptionStatus: 'active',
    verificationStatus: 'VERIFIED',
    isAvailable: true,
    searchMode: 'AI_SEARCH',
    boost: false,
    quality: 'medium',
  },
  {
    key: 'paid_only_specialist',
    eligibleForAi: true,
    isExpert: false,
    planKey: 'sharingminds_dummy_mentor_paid_only',
    subscriptionStatus: 'active',
    verificationStatus: 'VERIFIED',
    isAvailable: true,
    searchMode: 'AI_SEARCH',
    boost: false,
    quality: 'medium',
  },
  {
    key: 'overexposed_quality_mentor',
    eligibleForAi: true,
    isExpert: false,
    planKey: 'sharingminds_dummy_mentor_premium',
    subscriptionStatus: 'active',
    verificationStatus: 'VERIFIED',
    isAvailable: true,
    searchMode: 'AI_SEARCH',
    boost: false,
    quality: 'overexposed',
  },
  {
    key: 'no_ai_visibility',
    eligibleForAi: false,
    isExpert: true,
    planKey: 'sharingminds_dummy_mentor_sessions_no_visibility',
    subscriptionStatus: 'active',
    verificationStatus: 'VERIFIED',
    isAvailable: true,
    searchMode: 'AI_SEARCH',
    boost: false,
    quality: 'blocked',
  },
  {
    key: 'no_session_availability',
    eligibleForAi: false,
    isExpert: true,
    planKey: 'sharingminds_dummy_mentor_visibility_no_sessions',
    subscriptionStatus: 'active',
    verificationStatus: 'VERIFIED',
    isAvailable: true,
    searchMode: 'AI_SEARCH',
    boost: false,
    quality: 'blocked',
  },
  {
    key: 'exclusive_search',
    eligibleForAi: false,
    isExpert: true,
    planKey: 'sharingminds_dummy_mentor_premium',
    subscriptionStatus: 'active',
    verificationStatus: 'VERIFIED',
    isAvailable: true,
    searchMode: 'EXCLUSIVE_SEARCH',
    boost: false,
    quality: 'blocked',
  },
  {
    key: 'unavailable',
    eligibleForAi: false,
    isExpert: false,
    planKey: 'sharingminds_dummy_mentor_premium',
    subscriptionStatus: 'active',
    verificationStatus: 'VERIFIED',
    isAvailable: false,
    searchMode: 'AI_SEARCH',
    boost: false,
    quality: 'blocked',
  },
  {
    key: 'unverified',
    eligibleForAi: false,
    isExpert: false,
    planKey: 'sharingminds_dummy_mentor_premium',
    subscriptionStatus: 'active',
    verificationStatus: 'IN_PROGRESS',
    isAvailable: true,
    searchMode: 'AI_SEARCH',
    boost: false,
    quality: 'blocked',
  },
  {
    key: 'inactive_subscription',
    eligibleForAi: false,
    isExpert: true,
    planKey: 'sharingminds_dummy_mentor_premium',
    subscriptionStatus: 'canceled',
    verificationStatus: 'VERIFIED',
    isAvailable: true,
    searchMode: 'AI_SEARCH',
    boost: false,
    quality: 'blocked',
  },
];

const PLAN_FEATURES: Record<string, Array<{ key: string; limitCount?: number | null }>> = {
  sharingminds_dummy_mentor_premium: [
    { key: FEATURE_KEYS.AI_VISIBILITY, limitCount: 2000 },
    { key: FEATURE_KEYS.FREE_VIDEO_SESSIONS_MONTHLY, limitCount: 60 },
    { key: FEATURE_KEYS.PAID_VIDEO_SESSIONS_MONTHLY, limitCount: 120 },
    { key: FEATURE_KEYS.CONTENT_POSTING_ACCESS },
  ],
  sharingminds_dummy_mentor_basic: [
    { key: FEATURE_KEYS.AI_VISIBILITY, limitCount: 400 },
    { key: FEATURE_KEYS.FREE_VIDEO_SESSIONS_MONTHLY, limitCount: 12 },
    { key: FEATURE_KEYS.CONTENT_POSTING_ACCESS },
  ],
  sharingminds_dummy_mentor_paid_only: [
    { key: FEATURE_KEYS.AI_VISIBILITY, limitCount: 500 },
    { key: FEATURE_KEYS.PAID_VIDEO_SESSIONS_MONTHLY, limitCount: 40 },
    { key: FEATURE_KEYS.CONTENT_POSTING_ACCESS },
  ],
  sharingminds_dummy_mentor_sessions_no_visibility: [
    { key: FEATURE_KEYS.FREE_VIDEO_SESSIONS_MONTHLY, limitCount: 20 },
    { key: FEATURE_KEYS.PAID_VIDEO_SESSIONS_MONTHLY, limitCount: 20 },
    { key: FEATURE_KEYS.CONTENT_POSTING_ACCESS },
  ],
  sharingminds_dummy_mentor_visibility_no_sessions: [
    { key: FEATURE_KEYS.AI_VISIBILITY, limitCount: 200 },
    { key: FEATURE_KEYS.CONTENT_POSTING_ACCESS },
  ],
  sharingminds_dummy_mentee_ai_tester: [
    { key: FEATURE_KEYS.AI_SEARCH_SESSIONS, limitCount: 200 },
    { key: FEATURE_KEYS.AI_SEARCH_SESSIONS_MONTHLY, limitCount: 200 },
    { key: FEATURE_KEYS.FREE_VIDEO_SESSIONS_MONTHLY, limitCount: 20 },
    { key: FEATURE_KEYS.PAID_VIDEO_SESSIONS_MONTHLY, limitCount: 20 },
    { key: FEATURE_KEYS.COURSES_ACCESS },
  ],
};

const FEATURE_DEFS: Record<
  string,
  { name: string; valueType: 'boolean' | 'count'; isMetered: boolean; unit?: string }
> = {
  [FEATURE_KEYS.AI_VISIBILITY]: {
    name: 'AI visibility',
    valueType: 'count',
    isMetered: true,
    unit: 'profile_impression',
  },
  [FEATURE_KEYS.FREE_VIDEO_SESSIONS_MONTHLY]: {
    name: 'Free video sessions monthly',
    valueType: 'count',
    isMetered: true,
    unit: 'session',
  },
  [FEATURE_KEYS.PAID_VIDEO_SESSIONS_MONTHLY]: {
    name: 'Paid video sessions monthly',
    valueType: 'count',
    isMetered: true,
    unit: 'session',
  },
  [FEATURE_KEYS.CONTENT_POSTING_ACCESS]: {
    name: 'Content posting access',
    valueType: 'boolean',
    isMetered: false,
  },
  [FEATURE_KEYS.AI_SEARCH_SESSIONS]: {
    name: 'AI search sessions',
    valueType: 'count',
    isMetered: true,
    unit: 'ai_search',
  },
  [FEATURE_KEYS.AI_SEARCH_SESSIONS_MONTHLY]: {
    name: 'AI search sessions monthly',
    valueType: 'count',
    isMetered: true,
    unit: 'ai_search',
  },
  [FEATURE_KEYS.COURSES_ACCESS]: {
    name: 'Courses access',
    valueType: 'boolean',
    isMetered: false,
  },
};

function parseArgs() {
  const args = new Map<string, string | boolean>();
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--')) continue;
    const [key, value] = raw.slice(2).split('=');
    args.set(key, value ?? true);
  }

  return {
    execute: args.get('execute') === true || args.get('execute') === 'true',
    includeRnd: args.get('include-rnd') === true || args.get('include-rnd') === 'true',
    all: args.get('all') === true || args.get('all') === 'true',
    limit: Number(args.get('limit') ?? 180),
  };
}

function seedUuid(value: string) {
  return uuidv5(`${SEED_BATCH}:${value}`, UUID_NAMESPACE);
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

function splitTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function inferIntentTags(profile: SourceProfile) {
  const text = [profile.primaryDomain, profile.keyExpertise, profile.keywords].join(' ').toLowerCase();
  const tags = new Set<string>();
  if (/study|student|university|admission|scholar|visa|education|mba|gmat/.test(text)) {
    tags.add('study_abroad');
  }
  if (/career|resume|interview|promotion|job|professional|leadership/.test(text)) {
    tags.add('career_growth');
  }
  if (/ai|data|software|technology|cyber|automation|digital/.test(text)) {
    tags.add('technical_growth');
  }
  if (/founder|startup|investor|funding|capital|gtm|go-to-market/.test(text)) {
    tags.add('startup_scaling');
    tags.add('funding');
  }
  if (/business|sme|msme|operations|supply|manufacturing|retail/.test(text)) {
    tags.add('business_operations');
  }
  if (/governance|risk|compliance/.test(text)) {
    tags.add('compliance');
  }
  return Array.from(tags);
}

function inferOutcomeTags(profile: SourceProfile) {
  const text = [profile.primaryDomain, profile.keyExpertise, profile.keywords].join(' ').toLowerCase();
  const tags = new Set<string>();
  if (/clarity|roadmap|planning|strategy/.test(text)) tags.add('clarity');
  if (/growth|scale|revenue|market/.test(text)) tags.add('business_growth');
  if (/investor|funding|capital|scholar/.test(text)) tags.add('investors');
  if (/global|abroad|international|visa/.test(text)) tags.add('global_opportunities');
  if (/leadership|team|culture|manager/.test(text)) tags.add('better_team');
  if (tags.size === 0) tags.add('strategic_sequencing');
  return Array.from(tags);
}

function inferPersonaTags(profile: SourceProfile) {
  const text = [profile.ecosystemSegment, profile.sharingMindsLayer, profile.keywords].join(' ').toLowerCase();
  const tags = new Set<string>();
  if (/student|education|university/.test(text)) tags.add('confused_student');
  if (/working|career|professional/.test(text)) tags.add('mid_career_professional');
  if (/founder|startup|investor/.test(text)) tags.add('founder');
  if (/sme|msme|business/.test(text)) tags.add('sme_owner');
  if (/corporate|enterprise|leadership/.test(text)) tags.add('enterprise_leader');
  if (tags.size === 0) tags.add('explorer');
  return Array.from(tags);
}

function locationFor(index: number) {
  const locations = [
    ['Mumbai', 'India'],
    ['Bengaluru', 'India'],
    ['Delhi', 'India'],
    ['London', 'United Kingdom'],
    ['Dubai', 'United Arab Emirates'],
    ['Singapore', 'Singapore'],
    ['Toronto', 'Canada'],
    ['San Francisco', 'United States'],
  ];
  return locations[index % locations.length];
}

function bucketFor(index: number): SeedBucket {
  return BUCKETS[index % BUCKETS.length];
}

function loadProfiles(options: ReturnType<typeof parseArgs>) {
  const fixturePath = join(
    dirname(fileURLToPath(import.meta.url)),
    'fixtures',
    'sharingminds-profiles.json'
  );
  const allProfiles = JSON.parse(readFileSync(fixturePath, 'utf8')) as SourceProfile[];
  const filtered = allProfiles.filter((profile) => options.includeRnd || profile.source === 'expert_profiles');
  return (options.all ? filtered : filtered.slice(0, Math.max(1, options.limit))).filter(
    (profile) => profile.profileId && profile.primaryDomain
  );
}

async function ensureSeedPlans() {
  const featureKeys = Array.from(
    new Set(Object.values(PLAN_FEATURES).flatMap((features) => features.map((feature) => feature.key)))
  );

  for (const featureKey of featureKeys) {
    const def = FEATURE_DEFS[featureKey];
    if (!def) {
      throw new Error(`Missing seed feature definition for ${featureKey}`);
    }

    await db
      .insert(subscriptionFeatures)
      .values({
        featureKey,
        name: def.name,
        valueType: def.valueType,
        unit: def.unit ?? null,
        isMetered: def.isMetered,
        metadata: { seedBatch: SEED_BATCH },
      })
      .onConflictDoNothing();
  }

  const featureRows = await db
    .select({ id: subscriptionFeatures.id, featureKey: subscriptionFeatures.featureKey })
    .from(subscriptionFeatures);
  const featureIdByKey = new Map(featureRows.map((row) => [row.featureKey, row.id]));

  for (const [planKey, features] of Object.entries(PLAN_FEATURES)) {
    const audience = planKey.includes('mentee') ? 'mentee' : 'mentor';
    const [plan] = await db
      .insert(subscriptionPlans)
      .values({
        id: seedUuid(`plan:${planKey}`),
        planKey,
        audience,
        name: `SharingMinds Dummy ${planKey.replace('sharingminds_dummy_', '').replace(/_/g, ' ')}`,
        description: 'Local/staging seed plan for Infinity AI recommendation testing.',
        status: 'active',
        sortOrder: 900,
        metadata: { seedBatch: SEED_BATCH },
      })
      .onConflictDoUpdate({
        target: subscriptionPlans.planKey,
        set: {
          status: 'active',
          metadata: { seedBatch: SEED_BATCH },
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: subscriptionPlans.id });

    for (const feature of features) {
      const featureId = featureIdByKey.get(feature.key);
      if (!featureId) {
        throw new Error(`Feature ${feature.key} was not found after seed feature creation`);
      }

      await db
        .insert(subscriptionPlanFeatures)
        .values({
          planId: plan.id,
          featureId,
          isIncluded: true,
          limitCount: feature.limitCount ?? null,
          limitInterval: feature.limitCount ? 'month' : null,
          limitIntervalCount: 1,
          metadata: { seedBatch: SEED_BATCH },
        })
        .onConflictDoUpdate({
          target: [subscriptionPlanFeatures.planId, subscriptionPlanFeatures.featureId],
          set: {
            isIncluded: true,
            limitCount: feature.limitCount ?? null,
            limitInterval: feature.limitCount ? 'month' : null,
            metadata: { seedBatch: SEED_BATCH },
            updatedAt: sql`now()`,
          },
        });
    }
  }
}

async function seedMentees(count: number) {
  const rows = Array.from({ length: count }, (_, index) => ({
    id: `${USER_PREFIX}mentee-${String(index + 1).padStart(3, '0')}`,
    email: `${USER_PREFIX}mentee-${String(index + 1).padStart(3, '0')}@${EMAIL_DOMAIN}`,
    name: `SharingMinds Dummy Mentee ${index + 1}`,
    emailVerified: true,
    firstName: 'SharingMinds',
    lastName: `Mentee ${index + 1}`,
    isActive: true,
    isBlocked: false,
    bio: 'Synthetic mentee for Infinity AI scoring/review seed data.',
  }));

  await db
    .insert(users)
    .values(rows)
    .onConflictDoUpdate({
      target: users.id,
      set: {
        name: sql`excluded.name`,
        email: sql`excluded.email`,
        isActive: true,
        isBlocked: false,
        updatedAt: sql`now()`,
      },
    });

  const [plan] = await db
    .select({ id: subscriptionPlans.id })
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.planKey, 'sharingminds_dummy_mentee_ai_tester'))
    .limit(1);

  if (plan) {
    await db
      .insert(subscriptions)
      .values(
        rows.slice(0, 3).map((row, index) => ({
          id: seedUuid(`subscription:${row.id}`),
          userId: row.id,
          planId: plan.id,
          status: 'active',
          currentPeriodStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
          currentPeriodEnd: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000),
          provider: 'dummy',
          providerSubscriptionId: `${SEED_BATCH}-mentee-${index + 1}`,
          metadata: { seedBatch: SEED_BATCH, seedRole: 'mentee_ai_tester' },
        }))
      )
      .onConflictDoUpdate({
        target: subscriptions.id,
        set: {
          status: 'active',
          currentPeriodEnd: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000),
          metadata: { seedBatch: SEED_BATCH, seedRole: 'mentee_ai_tester' },
          updatedAt: sql`now()`,
        },
      });
  }

  return rows.map((row) => row.id);
}

async function seedProfiles(profiles: SourceProfile[], menteeUserIds: string[]) {
  const mentorUsers = [];
  const mentorRows = [];
  const profileRows = [];
  const subscriptionRows = [];
  const sessionRows = [];
  const reviewRows = [];
  const eventRows = [];
  const boostRows = [];
  const contentRows = [];
  const courseRows = [];

  const planRows = await db
    .select({ id: subscriptionPlans.id, planKey: subscriptionPlans.planKey })
    .from(subscriptionPlans);
  const planIdByKey = new Map(planRows.map((row) => [row.planKey, row.id]));

  for (const [index, profile] of profiles.entries()) {
    const bucket = bucketFor(index);
    const slug = normalizeSlug(`${profile.profileId}-${profile.expertName || 'mentor'}`);
    const userId = `${USER_PREFIX}mentor-${slug}`;
    const mentorProfileId = seedUuid(`mentor:${profile.profileId}`);
    const subscriptionId = seedUuid(`subscription:${profile.profileId}`);
    const [city, country] = locationFor(index);
    const expertise = splitTags(profile.keyExpertise || profile.keywords).slice(0, 8);
    const keywordTags = splitTags(profile.keywords).slice(0, 18);
    const domainTags = [profile.primaryDomain, profile.ecosystemSegment, ...expertise].filter(Boolean);
    const intentTags = inferIntentTags(profile);
    const outcomeTags = inferOutcomeTags(profile);
    const personaTags = inferPersonaTags(profile);
    const planId = planIdByKey.get(bucket.planKey);

    if (!planId) {
      throw new Error(`Seed subscription plan ${bucket.planKey} was not created`);
    }

    mentorUsers.push({
      id: userId,
      email: `${USER_PREFIX}${slug}@${EMAIL_DOMAIN}`,
      name: profile.expertName || `SharingMinds Mentor ${index + 1}`,
      emailVerified: true,
      firstName: (profile.expertName || 'SharingMinds').split(' ')[0],
      lastName: (profile.expertName || `Mentor ${index + 1}`).split(' ').slice(1).join(' ') || 'Mentor',
      isActive: true,
      isBlocked: false,
      bio: `Synthetic ${profile.primaryDomain} profile for Infinity AI recommendation testing.`,
    });

    mentorRows.push({
      id: mentorProfileId,
      userId,
      title: profile.potentialRole || (bucket.isExpert ? 'Expert Advisor' : 'Mentor'),
      company: `SharingMinds Dummy ${profile.ecosystemSegment || 'Network'}`,
      industry: profile.primaryDomain,
      expertise: JSON.stringify(expertise.length ? expertise : keywordTags.slice(0, 8)),
      experience: 3 + (index % 18),
      hourlyRate: String(bucket.isExpert ? 120 + (index % 8) * 25 : 35 + (index % 8) * 10),
      currency: 'USD',
      availability: JSON.stringify({
        monday: ['09:00', '12:00'],
        wednesday: ['14:00', '18:00'],
        friday: ['10:00', '13:00'],
      }),
      maxMentees: bucket.isExpert ? 12 : 20,
      headline: `${profile.primaryDomain} ${bucket.isExpert ? 'expert' : 'mentor'} for ${profile.ecosystemSegment || 'learners'}`,
      about: [
        `Synthetic profile seeded from ${profile.source} for Infinity AI testing.`,
        `Primary domain: ${profile.primaryDomain}.`,
        `Focus areas: ${(expertise.length ? expertise : keywordTags).slice(0, 6).join(', ')}.`,
        `Seed bucket: ${bucket.key}.`,
      ].join(' '),
      fullName: profile.expertName || `SharingMinds Mentor ${index + 1}`,
      email: `${USER_PREFIX}${slug}@${EMAIL_DOMAIN}`,
      city,
      country,
      isVerified: bucket.verificationStatus === 'VERIFIED',
      verificationStatus: bucket.verificationStatus,
      verificationNotes: `${SEED_BATCH}:${bucket.key}`,
      isAvailable: bucket.isAvailable,
      paymentStatus: 'COMPLETED',
      isExpert: bucket.isExpert,
      searchMode: bucket.searchMode,
    });

    subscriptionRows.push({
      id: subscriptionId,
      userId,
      planId,
      status: bucket.subscriptionStatus,
      currentPeriodStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000),
      endedAt: bucket.subscriptionStatus === 'canceled' ? new Date(Date.now() - 24 * 60 * 60 * 1000) : null,
      provider: 'dummy',
      providerSubscriptionId: `${SEED_BATCH}-${profile.profileId}`,
      metadata: {
        seedBatch: SEED_BATCH,
        bucket: bucket.key,
        eligibleForAi: bucket.eligibleForAi,
      },
    });

    profileRows.push({
      id: seedUuid(`ai-expert-profile:${profile.profileId}`),
      mentorProfileId,
      mentorUserId: userId,
      intentTags,
      outcomeTags,
      industryTags: Array.from(new Set(domainTags.map((value) => value.toLowerCase()))),
      personaFitTags: personaTags,
      keywordTrustScore: bucket.quality === 'blocked' ? '0.450' : '0.760',
      contentAuthorityScore: bucket.quality === 'high' ? '0.750' : bucket.quality === 'new' ? '0.250' : '0.500',
      qualityScore: bucket.quality === 'high' ? '0.850' : bucket.quality === 'overexposed' ? '0.780' : '0.420',
      conversionScore: bucket.quality === 'high' ? '0.680' : bucket.quality === 'overexposed' ? '0.550' : '0.200',
      allocationSnapshot: {
        seedBatch: SEED_BATCH,
        bucket: bucket.key,
        sourceProfileId: profile.profileId,
      },
      metadataQualityStatus: 'sharingminds_seed_v1',
    });

    if (bucket.boost) {
      boostRows.push({
        id: seedUuid(`boost:${profile.profileId}`),
        mentorProfileId,
        ruleType: 'seed_priority',
        categoryScope: {
          intents: intentTags.length ? intentTags : ['career_growth', 'technical_growth'],
          outcomes: outcomeTags,
        },
        priorityMultiplier: '1.350',
        inclusionPercentageCap: 35,
        maxImpressions: 60,
        startsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        status: 'active',
        reason: `${SEED_BATCH}: boosted recommendation test bucket`,
        createdBy: null,
      });
    }

    const sessionCount =
      bucket.quality === 'high' ? 8 : bucket.quality === 'overexposed' ? 6 : bucket.quality === 'medium' ? 3 : 0;
    const cancelledCount = bucket.quality === 'medium' ? 1 : 0;

    for (let s = 0; s < sessionCount + cancelledCount; s += 1) {
      const menteeId = menteeUserIds[(index + s) % menteeUserIds.length];
      const sessionId = seedUuid(`session:${profile.profileId}:${s}`);
      const isCancelled = s >= sessionCount;

      sessionRows.push({
        id: sessionId,
        mentorId: userId,
        menteeId,
        title: `Seed session for ${profile.primaryDomain}`,
        description: `${SEED_BATCH}:${bucket.key}`,
        status: isCancelled ? 'cancelled' : 'completed',
        sessionType: s % 2 === 0 ? 'FREE' : 'PAID',
        bookingSource: 'ai',
        scheduledAt: new Date(Date.now() - (20 + s) * 24 * 60 * 60 * 1000),
        startedAt: isCancelled ? null : new Date(Date.now() - (20 + s) * 24 * 60 * 60 * 1000 + 5 * 60 * 1000),
        endedAt: isCancelled ? null : new Date(Date.now() - (20 + s) * 24 * 60 * 60 * 1000 + 65 * 60 * 1000),
        duration: 60,
        rate: String(bucket.isExpert ? 120 : 50),
        currency: 'USD',
        mentorNotes: `${SEED_BATCH}: mentor note`,
        menteeNotes: `${SEED_BATCH}: mentee note`,
      });

      if (!isCancelled) {
        reviewRows.push({
          id: seedUuid(`review:${profile.profileId}:${s}`),
          sessionId,
          reviewerId: menteeId,
          revieweeId: userId,
          reviewerRole: 'mentee',
          status: 'submitted',
          finalScore: String(bucket.quality === 'high' ? 4.8 : bucket.quality === 'overexposed' ? 4.5 : 4.1),
          feedback: `${SEED_BATCH}: synthetic review for recommendation scoring.`,
        });
      }
    }

    const impressionCount = bucket.quality === 'overexposed' ? 24 : bucket.quality === 'high' ? 4 : 0;
    const clickCount = bucket.quality === 'high' ? 4 : bucket.quality === 'overexposed' ? 3 : 0;
    const bookingCount = bucket.quality === 'high' ? 3 : 0;

    for (let e = 0; e < impressionCount + clickCount + bookingCount; e += 1) {
      const eventType =
        e < impressionCount
          ? 'impression'
          : e < impressionCount + clickCount
            ? 'click'
            : e % 2 === 0
              ? 'booking_attributed'
              : 'completion_attributed';

      eventRows.push({
        id: seedUuid(`recommendation-event:${profile.profileId}:${e}`),
        mentorProfileId,
        mentorUserId: userId,
        candidateType: 'expert',
        entityId: mentorProfileId,
        eventType,
        metadata: { seedBatch: SEED_BATCH, bucket: bucket.key },
        idempotencyKey: `${SEED_BATCH}:${profile.profileId}:${e}`,
      });
    }

    if (index % 3 === 0) {
      const contentBase = `${profile.primaryDomain} ${expertise[0] || 'mentoring'}`;
      contentRows.push({
        id: seedUuid(`content-url:${profile.profileId}`),
        mentorId: mentorProfileId,
        title: `SharingMinds Seed URL: ${contentBase} guide`,
        description: `Public URL resource for ${profile.primaryDomain} and ${profile.ecosystemSegment}.`,
        type: 'URL',
        status: bucket.eligibleForAi ? 'APPROVED' : 'DRAFT',
        url: `https://example.com/sharingminds/${slug}/guide`,
        urlTitle: `${contentBase} guide`,
        urlDescription: `A test URL resource covering ${keywordTags.slice(0, 5).join(', ')}.`,
        reviewedAt: bucket.eligibleForAi ? new Date() : null,
        reviewNote: `${SEED_BATCH}:${bucket.key}`,
      });
    }

    if (index % 4 === 0) {
      const contentBase = `${profile.primaryDomain} checklist`;
      contentRows.push({
        id: seedUuid(`content-file:${profile.profileId}`),
        mentorId: mentorProfileId,
        title: `SharingMinds Seed File: ${contentBase}`,
        description: `Public file resource for planning around ${profile.primaryDomain}.`,
        type: 'FILE',
        status: bucket.eligibleForAi ? 'APPROVED' : 'REJECTED',
        fileUrl: `https://example.com/sharingminds/${slug}/checklist.pdf`,
        fileName: `${normalizeSlug(contentBase)}.pdf`,
        fileSize: 128000,
        mimeType: 'application/pdf',
        reviewedAt: bucket.eligibleForAi ? new Date() : null,
        reviewNote: `${SEED_BATCH}:${bucket.key}`,
      });
    }

    if (index % 9 === 0 && bucket.eligibleForAi) {
      const contentId = seedUuid(`content-course:${profile.profileId}`);
      const courseId = seedUuid(`course:${profile.profileId}`);
      contentRows.push({
        id: contentId,
        mentorId: mentorProfileId,
        title: `SharingMinds Seed Course: ${profile.primaryDomain} starter path`,
        description: `A synthetic starter course for ${profile.primaryDomain}.`,
        type: 'COURSE',
        status: 'APPROVED',
        reviewedAt: new Date(),
        reviewNote: `${SEED_BATCH}:${bucket.key}`,
      });
      courseRows.push({
        id: courseId,
        contentId,
        ownerType: 'MENTOR',
        ownerId: mentorProfileId,
        difficulty: index % 2 === 0 ? 'BEGINNER' : 'INTERMEDIATE',
        duration: 90 + (index % 5) * 30,
        price: String(index % 4 === 0 ? 0 : 49),
        currency: 'USD',
        category: profile.primaryDomain,
        tags: JSON.stringify(keywordTags.slice(0, 8)),
        platformTags: JSON.stringify([...intentTags, ...outcomeTags]),
        prerequisites: JSON.stringify(['A clear goal', 'Willingness to practice']),
        learningOutcomes: JSON.stringify([
          `Understand the main path for ${profile.primaryDomain}`,
          `Identify next steps for ${profile.ecosystemSegment || 'your segment'}`,
        ]),
        enrollmentCount: bucket.quality === 'high' ? 60 : 10,
      });
    }
  }

  if (mentorUsers.length > 0) {
    await db
      .insert(users)
      .values(mentorUsers)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: sql`excluded.email`,
          name: sql`excluded.name`,
          bio: sql`excluded.bio`,
          isActive: true,
          isBlocked: false,
          updatedAt: sql`now()`,
        },
      });
  }

  if (mentorRows.length > 0) {
    await db
      .insert(mentors)
      .values(mentorRows)
      .onConflictDoUpdate({
        target: mentors.userId,
        set: {
          title: sql`excluded.title`,
          company: sql`excluded.company`,
          industry: sql`excluded.industry`,
          expertise: sql`excluded.expertise`,
          experience: sql`excluded.experience_years`,
          hourlyRate: sql`excluded.hourly_rate`,
          availability: sql`excluded.availability`,
          headline: sql`excluded.headline`,
          about: sql`excluded.about`,
          fullName: sql`excluded.full_name`,
          city: sql`excluded.city`,
          country: sql`excluded.country`,
          isVerified: sql`excluded.is_verified`,
          verificationStatus: sql`excluded.verification_status`,
          verificationNotes: sql`excluded.verification_notes`,
          isAvailable: sql`excluded.is_available`,
          paymentStatus: sql`excluded.payment_status`,
          isExpert: sql`excluded.is_expert`,
          searchMode: sql`excluded.search_mode`,
          updatedAt: sql`now()`,
        },
      });
  }

  if (subscriptionRows.length > 0) {
    await db
      .insert(subscriptions)
      .values(subscriptionRows)
      .onConflictDoUpdate({
        target: subscriptions.id,
        set: {
          status: sql`excluded.status`,
          currentPeriodStart: sql`excluded.current_period_start`,
          currentPeriodEnd: sql`excluded.current_period_end`,
          endedAt: sql`excluded.ended_at`,
          metadata: sql`excluded.metadata`,
          updatedAt: sql`now()`,
        },
      });
  }

  if (profileRows.length > 0) {
    await db
      .insert(aiExpertProfiles)
      .values(profileRows)
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

  if (contentRows.length > 0) {
    await db
      .insert(mentorContent)
      .values(contentRows)
      .onConflictDoUpdate({
        target: mentorContent.id,
        set: {
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          type: sql`excluded.type`,
          status: sql`excluded.status`,
          fileUrl: sql`excluded.file_url`,
          fileName: sql`excluded.file_name`,
          fileSize: sql`excluded.file_size`,
          mimeType: sql`excluded.mime_type`,
          url: sql`excluded.url`,
          urlTitle: sql`excluded.url_title`,
          urlDescription: sql`excluded.url_description`,
          reviewedAt: sql`excluded.reviewed_at`,
          reviewNote: sql`excluded.review_note`,
          updatedAt: sql`now()`,
        },
      });
  }

  if (courseRows.length > 0) {
    await db
      .insert(courses)
      .values(courseRows)
      .onConflictDoUpdate({
        target: courses.id,
        set: {
          difficulty: sql`excluded.difficulty`,
          duration: sql`excluded.duration_minutes`,
          price: sql`excluded.price`,
          category: sql`excluded.category`,
          tags: sql`excluded.tags`,
          platformTags: sql`excluded.platform_tags`,
          prerequisites: sql`excluded.prerequisites`,
          learningOutcomes: sql`excluded.learning_outcomes`,
          enrollmentCount: sql`excluded.enrollment_count`,
          updatedAt: sql`now()`,
        },
      });
  }

  if (sessionRows.length > 0) {
    await db.insert(sessions).values(sessionRows).onConflictDoNothing();
  }

  if (reviewRows.length > 0) {
    await db.insert(reviews).values(reviewRows).onConflictDoNothing();
  }

  await seedRecommendationEvents(eventRows);

  if (boostRows.length > 0) {
    await db
      .insert(aiAdminBoostRules)
      .values(boostRows)
      .onConflictDoUpdate({
        target: aiAdminBoostRules.id,
        set: {
          categoryScope: sql`excluded.category_scope`,
          priorityMultiplier: sql`excluded.priority_multiplier`,
          inclusionPercentageCap: sql`excluded.inclusion_percentage_cap`,
          maxImpressions: sql`excluded.max_impressions`,
          startsAt: sql`excluded.starts_at`,
          expiresAt: sql`excluded.expires_at`,
          status: sql`excluded.status`,
          reason: sql`excluded.reason`,
          updatedAt: sql`now()`,
        },
      });
  }

  return {
    mentorUsers: mentorUsers.length,
    mentors: mentorRows.length,
    aiExpertProfiles: profileRows.length,
    subscriptions: subscriptionRows.length,
    sessions: sessionRows.length,
    reviews: reviewRows.length,
    recommendationEvents: eventRows.length,
    boostRules: boostRows.length,
    content: contentRows.length,
    courses: courseRows.length,
  };
}

async function tableColumns(tableName: string) {
  const rows = await client`
    select column_name
    from information_schema.columns
    where table_schema = current_schema()
      and table_name = ${tableName}
  `;

  return new Set(rows.map((row) => String(row.column_name)));
}

async function seedRecommendationEvents(
  eventRows: Array<typeof aiRecommendationEvents.$inferInsert>
) {
  if (eventRows.length === 0) return;

  const columns = await tableColumns('ai_recommendation_events');
  if (columns.size === 0) {
    console.warn('[sharingminds-seed] ai_recommendation_events table not found; skipping exposure events.');
    return;
  }

  if (columns.has('candidate_type')) {
    await db.insert(aiRecommendationEvents).values(eventRows).onConflictDoNothing();
    return;
  }

  console.warn(
    '[sharingminds-seed] ai_recommendation_events direct candidate columns are missing; writing legacy exposure-event shape only.'
  );

  for (const row of eventRows) {
    await client`
      insert into ai_recommendation_events
        (id, mentor_profile_id, event_type, metadata, idempotency_key)
      values
        (${row.id}, ${row.mentorProfileId}, ${row.eventType}, ${JSON.stringify(row.metadata ?? {})}::jsonb, ${row.idempotencyKey})
      on conflict (idempotency_key) do nothing
    `;
  }
}

async function main() {
  const options = parseArgs();
  const profiles = loadProfiles(options);
  const bucketCounts = profiles.reduce<Record<string, number>>((acc, _profile, index) => {
    const bucket = bucketFor(index).key;
    acc[bucket] = (acc[bucket] ?? 0) + 1;
    return acc;
  }, {});

  console.log('[sharingminds-seed] seed batch:', SEED_BATCH);
  console.log('[sharingminds-seed] profiles selected:', profiles.length);
  console.log('[sharingminds-seed] bucket counts:', bucketCounts);

  if (!options.execute) {
    console.log('[sharingminds-seed] dry run only. Add --execute and INFINITY_AI_ALLOW_DUMMY_SEED=true to write.');
    return;
  }

  if (process.env.INFINITY_AI_ALLOW_DUMMY_SEED !== 'true') {
    throw new Error('Refusing to seed dummy data unless INFINITY_AI_ALLOW_DUMMY_SEED=true is set.');
  }

  if (process.env.NODE_ENV === 'production' && process.env.INFINITY_AI_ALLOW_PRODUCTION_DUMMY_SEED !== 'true') {
    throw new Error('Refusing to seed dummy data in NODE_ENV=production.');
  }

  await ensureSeedPlans();
  const menteeUserIds = await seedMentees(24);
  const result = await seedProfiles(profiles, menteeUserIds);
  console.log('[sharingminds-seed] wrote:', result);
}

main()
  .catch((error) => {
    console.error('[sharingminds-seed] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
