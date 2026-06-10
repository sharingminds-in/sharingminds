import { listPublicCourses } from '@/lib/courses/server/public-service';
import { listPublicContentResourceCandidates } from '@/lib/infinity-ai/content-resource-candidates';
import type { AiResourceCandidate } from '@/lib/infinity-ai/schemas';
import { resolveStorageUrl } from '@/lib/storage';

function normalizeTerm(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function valuesFromSnapshot(snapshot: Record<string, unknown>, key: string) {
  const value = snapshot[key];
  if (Array.isArray(value)) {
    return value.map(normalizeTerm).filter(Boolean);
  }
  const normalized = normalizeTerm(value);
  return normalized ? [normalized] : [];
}

function unique(values: string[]) {
  return Array.from(new Set(values.map(normalizeTerm).filter(Boolean)));
}

function buildSearchTerms(input: {
  signalSnapshot?: Record<string, unknown>;
  userMessage?: string;
}) {
  const snapshot = input.signalSnapshot ?? {};
  const intents = valuesFromSnapshot(snapshot, 'intents');
  const outcomes = valuesFromSnapshot(snapshot, 'outcomes');
  const industries = valuesFromSnapshot(snapshot, 'industries');
  const geography = valuesFromSnapshot(snapshot, 'geography');
  const constraints = valuesFromSnapshot(snapshot, 'constraints');
  const primaryIntent = valuesFromSnapshot(snapshot, 'primary_intent');
  const userMessage = normalizeTerm(input.userMessage);

  const focused = unique([
    [...intents, ...outcomes].join(' '),
    [...primaryIntent, ...industries].join(' '),
    [...geography, ...constraints].join(' '),
    userMessage,
  ]).filter((term) => term.length >= 4);

  return focused.slice(0, 4);
}

function candidateText(course: Record<string, any>) {
  return [
    course.title,
    course.description,
    course.category,
    course.difficulty,
    course.platformName,
    ...(Array.isArray(course.tags) ? course.tags : []),
    ...(Array.isArray(course.platformTags) ? course.platformTags : []),
    ...(Array.isArray(course.learningOutcomes) ? course.learningOutcomes : []),
  ]
    .map(normalizeTerm)
    .filter(Boolean)
    .join(' ');
}

function deriveMappedTags(course: Record<string, any>, keys: Record<string, string[]>) {
  const text = candidateText(course);
  return Object.entries(keys)
    .filter(([, terms]) => terms.some((term) => text.includes(normalizeTerm(term))))
    .map(([key]) => key);
}

const RESOURCE_INTENT_TERMS: Record<string, string[]> = {
  study_abroad: ['study abroad', 'masters', 'university', 'admission', 'sop', 'gre', 'ielts'],
  career_growth: ['career', 'job', 'employability', 'resume', 'interview', 'planning'],
  technical_growth: ['computer science', 'software', 'engineering', 'data', 'ai', 'programming'],
  startup_scaling: ['startup', 'founder', 'scale', 'growth'],
  funding: ['funding', 'fundraising', 'investor'],
};

const RESOURCE_OUTCOME_TERMS: Record<string, string[]> = {
  clarity: ['clarity', 'decision', 'choose', 'planning'],
  global_opportunities: ['abroad', 'global', 'international'],
  strategic_sequencing: ['roadmap', 'plan', 'steps', 'timeline'],
  confidence: ['confidence', 'interview', 'portfolio'],
};

async function toResourceCandidate(course: Record<string, any>): Promise<AiResourceCandidate> {
  const tags = unique([
    ...(Array.isArray(course.tags) ? course.tags : []),
    ...(Array.isArray(course.platformTags) ? course.platformTags : []),
    course.category,
    course.difficulty,
  ]);
  const learningOutcomes = Array.isArray(course.learningOutcomes)
    ? course.learningOutcomes.map((item: unknown) => String(item)).filter(Boolean)
    : [];
  const image = await resolveStorageUrl(course.thumbnailUrl);

  return {
    resourceId: course.id,
    resourceType: 'course',
    title: course.title,
    description: course.description ?? null,
    href: `/courses/${course.id}`,
    source: 'courses',
    visibility: 'public',
    providerName: course.mentor?.name ?? course.platformName ?? null,
    category: course.category ?? null,
    difficulty: course.difficulty ?? null,
    durationMinutes: course.duration ?? null,
    price: course.price != null ? Number(course.price) : null,
    currency: course.currency ?? null,
    image: image || null,
    tags,
    learningOutcomes,
    intentTags: unique([
      ...deriveMappedTags(course, RESOURCE_INTENT_TERMS),
      ...tags.slice(0, 8),
    ]),
    outcomeTags: unique([
      ...deriveMappedTags(course, RESOURCE_OUTCOME_TERMS),
      ...learningOutcomes.slice(0, 6),
    ]),
    avgRating: Number(course.avgRating ?? 0),
    reviewCount: Number(course.reviewCount ?? 0),
    enrollmentCount: Number(course.enrollmentCount ?? 0),
    metadata: {
      ownerType: course.ownerType ?? null,
      platformName: course.platformName ?? null,
    },
  };
}

export async function listInfinityResourceCandidates(input: {
  signalSnapshot?: Record<string, unknown>;
  userMessage?: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(input.limit ?? 24, 1), 30);
  const seen = new Set<string>();
  const candidates: AiResourceCandidate[] = [];

  for (const search of buildSearchTerms(input)) {
    const [result, contentResources] = await Promise.all([
      listPublicCourses({
        page: 1,
        limit: 12,
        search,
        sortBy: 'rating',
        sortOrder: 'desc',
      }),
      listPublicContentResourceCandidates({
        search,
        limit: 12,
      }),
    ]);

    for (const course of result.courses) {
      if (seen.has(course.id)) continue;
      seen.add(course.id);
      candidates.push(await toResourceCandidate(course));
    }

    for (const resource of contentResources) {
      if (seen.has(resource.resourceId)) continue;
      seen.add(resource.resourceId);
      candidates.push(resource);
    }

    if (candidates.length >= limit) {
      return { candidates: candidates.slice(0, limit), visibility: 'public' as const };
    }
  }

  if (candidates.length === 0) {
    const [broad, broadContentResources] = await Promise.all([
      listPublicCourses({
        page: 1,
        limit,
        sortBy: 'rating',
        sortOrder: 'desc',
      }),
      listPublicContentResourceCandidates({
        limit,
      }),
    ]);

    for (const course of broad.courses) {
      if (seen.has(course.id)) continue;
      seen.add(course.id);
      candidates.push(await toResourceCandidate(course));
    }

    for (const resource of broadContentResources) {
      if (seen.has(resource.resourceId)) continue;
      seen.add(resource.resourceId);
      candidates.push(resource);
    }
  }

  return { candidates: candidates.slice(0, limit), visibility: 'public' as const };
}

export const __resourceCandidatesTest = {
  buildSearchTerms,
};
