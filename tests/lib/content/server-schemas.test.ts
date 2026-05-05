import { describe, expect, it } from 'vitest';

import {
  contentStatusSchema,
  createContentInputSchema,
  listAdminContentInputSchema,
  saveCourseInputSchema,
} from '@/lib/content/server/schemas';

describe('content server schemas', () => {
  it('rejects the removed PUBLISHED status', () => {
    expect(contentStatusSchema.safeParse('APPROVED').success).toBe(true);
    expect(contentStatusSchema.safeParse('PUBLISHED').success).toBe(false);
  });

  it('accepts admin list filters including ALL content type', () => {
    const parsed = listAdminContentInputSchema.parse({
      type: 'ALL',
      page: 2,
      limit: 10,
      search: 'course',
    });

    expect(parsed).toEqual({
      type: 'ALL',
      page: 2,
      limit: 10,
      search: 'course',
    });
  });

  it('normalizes protocol-less URL content links', () => {
    const parsed = createContentInputSchema.parse({
      title: 'Useful article',
      type: 'URL',
      url: ' example.com/article ',
    });

    expect(parsed.url).toBe('https://example.com/article');
  });

  it('normalizes empty course strings while preserving required arrays', () => {
    const parsed = saveCourseInputSchema.parse({
      contentId: 'a4350b4f-54dd-4baa-bbef-71521df95bd5',
      data: {
        difficulty: 'BEGINNER',
        category: 'Programming',
        learningOutcomes: ['Ship a working project'],
        price: '',
        platformName: '  Young Minds  ',
      },
    });

    expect(parsed.data.price).toBeUndefined();
    expect(parsed.data.platformName).toBe('Young Minds');
    expect(parsed.data.learningOutcomes).toEqual(['Ship a working project']);
  });
});
