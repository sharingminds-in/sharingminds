import { and, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';

import { db } from '@/lib/db';
import { mentorContent, mentors, users } from '@/lib/db/schema';
import type { AiResourceCandidate } from '@/lib/infinity-ai/schemas';
import { resolveStorageUrl } from '@/lib/storage';

function normalizeTerm(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function unique(values: string[]) {
  return Array.from(new Set(values.map(normalizeTerm).filter(Boolean)));
}

function deriveMappedTags(text: string, keys: Record<string, string[]>) {
  const normalized = normalizeTerm(text);
  return Object.entries(keys)
    .filter(([, terms]) => terms.some((term) => normalized.includes(normalizeTerm(term))))
    .map(([key]) => key);
}

const CONTENT_INTENT_TERMS: Record<string, string[]> = {
  study_abroad: ['study abroad', 'university', 'admission', 'scholarship', 'visa'],
  career_growth: ['career', 'job', 'resume', 'interview', 'promotion'],
  technical_growth: ['computer science', 'software', 'engineering', 'data', 'ai', 'programming'],
  startup_scaling: ['startup', 'founder', 'scale', 'growth'],
  funding: ['funding', 'fundraising', 'scholarship', 'sponsorship', 'investor'],
  leadership: ['leadership', 'manager', 'executive'],
  business_operations: ['operations', 'supply chain', 'manufacturing', 'process'],
};

const CONTENT_OUTCOME_TERMS: Record<string, string[]> = {
  clarity: ['clarity', 'decision', 'choose', 'planning'],
  global_opportunities: ['abroad', 'global', 'international', 'visa'],
  strategic_sequencing: ['roadmap', 'plan', 'steps', 'timeline', 'checklist'],
  investors: ['investor', 'funding', 'fundraising'],
  business_growth: ['growth', 'scale', 'revenue'],
};

type PublicContentResourceRow = {
  id: string;
  title: string;
  description: string | null;
  type: 'FILE' | 'URL';
  fileUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  url: string | null;
  urlTitle: string | null;
  urlDescription: string | null;
  mentorName: string | null;
  mentorFullName: string | null;
};

function candidateText(row: PublicContentResourceRow) {
  return [
    row.title,
    row.description,
    row.fileName,
    row.mimeType,
    row.urlTitle,
    row.urlDescription,
    row.mentorFullName,
    row.mentorName,
  ]
    .map(normalizeTerm)
    .filter(Boolean)
    .join(' ');
}

async function toContentResourceCandidate(
  row: PublicContentResourceRow
): Promise<AiResourceCandidate | null> {
  const rawHref = row.type === 'URL' ? row.url : row.fileUrl;
  const href = row.type === 'FILE' ? await resolveStorageUrl(rawHref) : rawHref;

  if (!href) {
    return null;
  }

  const text = candidateText(row);
  const tags = unique([
    row.type.toLowerCase(),
    row.mimeType ?? '',
    ...deriveMappedTags(text, CONTENT_INTENT_TERMS),
    ...deriveMappedTags(text, CONTENT_OUTCOME_TERMS),
  ]);
  const learningOutcomes = unique([row.description ?? row.urlDescription ?? ''])
    .filter((value) => value.length >= 12)
    .slice(0, 2);

  return {
    resourceId: row.id,
    resourceType: row.type.toLowerCase(),
    title: row.urlTitle || row.title,
    description: row.urlDescription || row.description,
    href,
    source: 'mentor_content',
    visibility: 'public',
    providerName: row.mentorFullName || row.mentorName || 'Young Minds',
    category: row.type === 'FILE' ? 'File' : 'URL',
    difficulty: null,
    durationMinutes: null,
    price: null,
    currency: null,
    image: null,
    tags,
    learningOutcomes,
    intentTags: unique([...deriveMappedTags(text, CONTENT_INTENT_TERMS), ...tags.slice(0, 6)]),
    outcomeTags: unique([
      ...deriveMappedTags(text, CONTENT_OUTCOME_TERMS),
      ...learningOutcomes.slice(0, 4),
    ]),
    avgRating: 0,
    reviewCount: 0,
    enrollmentCount: 0,
    metadata: {
      contentType: row.type,
      source: 'mentor_content',
    },
  };
}

export async function listPublicContentResourceCandidates(input: {
  search?: string;
  limit?: number;
}) {
  const search = normalizeTerm(input.search);
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 30);
  const conditions = [
    eq(mentorContent.status, 'APPROVED' as const),
    inArray(mentorContent.type, ['FILE', 'URL'] as const),
    isNull(mentorContent.deletedAt),
  ];

  if (search) {
    conditions.push(
      or(
        ilike(mentorContent.title, `%${search}%`),
        ilike(mentorContent.description, `%${search}%`),
        ilike(mentorContent.fileName, `%${search}%`),
        ilike(mentorContent.urlTitle, `%${search}%`),
        ilike(mentorContent.urlDescription, `%${search}%`)
      )!
    );
  }

  const rows = await db
    .select({
      id: mentorContent.id,
      title: mentorContent.title,
      description: mentorContent.description,
      type: mentorContent.type,
      fileUrl: mentorContent.fileUrl,
      fileName: mentorContent.fileName,
      mimeType: mentorContent.mimeType,
      url: mentorContent.url,
      urlTitle: mentorContent.urlTitle,
      urlDescription: mentorContent.urlDescription,
      mentorName: users.name,
      mentorFullName: mentors.fullName,
    })
    .from(mentorContent)
    .leftJoin(mentors, eq(mentorContent.mentorId, mentors.id))
    .leftJoin(users, eq(mentors.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(mentorContent.updatedAt), desc(mentorContent.createdAt))
    .limit(limit);

  const candidates = await Promise.all(rows.map(toContentResourceCandidate));
  return candidates.filter((candidate): candidate is AiResourceCandidate => Boolean(candidate));
}

export const __contentResourceCandidatesTest = {
  candidateText,
};
