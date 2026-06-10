import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listPublicCourses, listPublicContentResourceCandidates, resolveStorageUrl } = vi.hoisted(() => ({
  listPublicCourses: vi.fn(),
  listPublicContentResourceCandidates: vi.fn(),
  resolveStorageUrl: vi.fn(),
}));

vi.mock('@/lib/courses/server/public-service', () => ({
  listPublicCourses,
}));

vi.mock('@/lib/infinity-ai/content-resource-candidates', () => ({
  listPublicContentResourceCandidates,
}));

vi.mock('@/lib/storage', () => ({
  resolveStorageUrl,
}));

import {
  __resourceCandidatesTest,
  listInfinityResourceCandidates,
} from '@/lib/infinity-ai/resource-candidates';

const course = {
  id: '66666666-6666-6666-6666-666666666666',
  title: 'Study Abroad Decision Planning',
  description: 'Compare masters options and job options.',
  difficulty: 'BEGINNER',
  duration: 90,
  price: '0',
  currency: 'USD',
  thumbnailUrl: null,
  category: 'Career Planning',
  tags: ['study abroad', 'career planning'],
  platformTags: ['masters'],
  platformName: 'Young Minds',
  ownerType: 'PLATFORM',
  prerequisites: [],
  learningOutcomes: ['Compare masters and job options'],
  enrollmentCount: 42,
  mentor: {
    name: 'Young Minds',
  },
  avgRating: 4.7,
  reviewCount: 8,
};

describe('Infinity AI resource candidates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveStorageUrl.mockResolvedValue(null);
    listPublicContentResourceCandidates.mockResolvedValue([]);
  });

  it('builds humanized search terms from signals instead of one raw signal blob', () => {
    const terms = __resourceCandidatesTest.buildSearchTerms({
      signalSnapshot: {
        intents: ['study_abroad'],
        outcomes: ['decision_clarity'],
        geography: ['London'],
        constraints: ['budget matters'],
      },
      userMessage: 'Please recommend public courses',
    });

    expect(terms).toContain('study abroad decision clarity');
    expect(terms).toContain('london budget matters');
    expect(terms).not.toContain('study_abroad decision_clarity london budget matters');
  });

  it('falls back to a broad public course pool when focused search is empty', async () => {
    listPublicCourses
      .mockResolvedValueOnce({
        courses: [],
        pagination: { totalCount: 0 },
        filters: {},
      })
      .mockResolvedValueOnce({
        courses: [course],
        pagination: { totalCount: 1 },
        filters: {},
      });

    const result = await listInfinityResourceCandidates({
      signalSnapshot: {
        intents: ['study_abroad'],
      },
      userMessage: '',
    });

    expect(listPublicCourses).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ search: 'study abroad', sortBy: 'rating' })
    );
    expect(listPublicCourses).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sortBy: 'rating' })
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      resourceId: course.id,
      resourceType: 'course',
      href: `/courses/${course.id}`,
      visibility: 'public',
    });
  });

  it('includes approved file and URL content resources alongside courses', async () => {
    listPublicCourses.mockResolvedValue({
      courses: [],
      pagination: { totalCount: 0 },
      filters: {},
    });
    listPublicContentResourceCandidates.mockResolvedValueOnce([
      {
        resourceId: '77777777-7777-7777-7777-777777777777',
        resourceType: 'url',
        title: 'Scholarship Funding Checklist',
        description: 'A public checklist for fully funded study abroad routes.',
        href: 'https://example.com/scholarship-checklist',
        source: 'mentor_content',
        visibility: 'public',
        providerName: 'Young Minds',
        category: 'URL',
        difficulty: null,
        durationMinutes: null,
        price: null,
        currency: null,
        image: null,
        tags: ['funding', 'study abroad'],
        learningOutcomes: ['Find scholarship routes'],
        intentTags: ['funding', 'study_abroad'],
        outcomeTags: ['strategic_sequencing'],
        avgRating: 0,
        reviewCount: 0,
        enrollmentCount: 0,
        metadata: { source: 'mentor_content' },
      },
    ]);

    const result = await listInfinityResourceCandidates({
      signalSnapshot: {
        intents: ['funding'],
      },
      userMessage: 'Help me with scholarship',
    });

    expect(listPublicContentResourceCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'funding', limit: 12 })
    );
    expect(result.candidates).toEqual([
      expect.objectContaining({
        resourceId: '77777777-7777-7777-7777-777777777777',
        resourceType: 'url',
        source: 'mentor_content',
        href: 'https://example.com/scholarship-checklist',
      }),
    ]);
  });
});
