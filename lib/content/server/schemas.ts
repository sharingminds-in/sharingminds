import { z } from 'zod';

export const contentTypeSchema = z.enum(['COURSE', 'FILE', 'URL']);
export const contentStatusSchema = z.enum([
  'DRAFT',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'ARCHIVED',
  'FLAGGED',
]);
export const courseDifficultySchema = z.enum([
  'BEGINNER',
  'INTERMEDIATE',
  'ADVANCED',
]);
export const contentItemTypeSchema = z.enum([
  'VIDEO',
  'PDF',
  'DOCUMENT',
  'URL',
  'TEXT',
]);
export const adminContentReviewActionSchema = z.enum([
  'APPROVE',
  'REJECT',
  'FLAG',
  'UNFLAG',
  'FORCE_APPROVE',
  'FORCE_ARCHIVE',
  'REVOKE_APPROVAL',
  'FORCE_DELETE',
]);

export const createContentInputSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  type: contentTypeSchema,
  fileUrl: z.string().optional(),
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
  url: z.string().optional(),
  urlTitle: z.string().optional(),
  urlDescription: z.string().optional(),
});

export const updateContentFieldsSchema = z.object({
  title: z.string().min(1, 'Title is required').optional(),
  description: z.string().optional(),
  fileUrl: z.string().optional(),
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
  url: z
    .string()
    .refine((val) => !val || val === '' || /^https?:\/\/.+/.test(val), {
      message: 'Invalid URL format',
    })
    .optional(),
  urlTitle: z.string().optional(),
  urlDescription: z.string().optional(),
});

export const updateContentInputSchema = z.object({
  contentId: z.string().uuid(),
  data: updateContentFieldsSchema,
});

export const archiveContentInputSchema = z.object({
  contentId: z.string().uuid(),
  action: z.enum(['archive', 'restore']),
});

export const deleteContentInputSchema = z.object({
  contentId: z.string().uuid(),
});

export const getContentInputSchema = z.object({
  contentId: z.string().uuid(),
});

export const coursePayloadSchema = z.object({
  difficulty: courseDifficultySchema,
  duration: z.number().min(1).optional(),
  price: z
    .string()
    .optional()
    .transform((value) => (value && value !== '' ? value : undefined)),
  currency: z.string().default('USD'),
  thumbnailUrl: z.string().nullish(),
  category: z.string().min(1, 'Category is required'),
  tags: z.array(z.string()).default([]),
  platformTags: z.array(z.string()).default([]),
  platformName: z.string().optional().transform((value) => value?.trim() || undefined),
  prerequisites: z.array(z.string()).default([]),
  learningOutcomes: z
    .array(z.string())
    .min(1, 'At least one learning outcome is required'),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  maxStudents: z.number().min(1).optional(),
  isPublic: z.boolean().default(true),
  allowComments: z.boolean().default(true),
  certificateTemplate: z.string().optional(),
});

export const saveCourseInputSchema = z.object({
  contentId: z.string().uuid(),
  data: coursePayloadSchema.partial().extend({
    difficulty: courseDifficultySchema,
    category: z.string().min(1, 'Category is required'),
    learningOutcomes: z
      .array(z.string())
      .min(1, 'At least one learning outcome is required'),
  }),
});

export const createModulePayloadSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  orderIndex: z.number().min(0),
  estimatedDuration: z.number().min(1).optional(),
  learningObjectives: z.array(z.string()).default([]),
});

export const createModuleInputSchema = z.object({
  contentId: z.string().uuid(),
  data: createModulePayloadSchema,
});

export const updateModulePayloadSchema = z.object({
  title: z.string().min(1, 'Title is required').optional(),
  description: z.string().optional(),
  orderIndex: z.number().min(0).optional(),
  estimatedDuration: z.number().min(1).optional(),
  learningObjectives: z.array(z.string()).optional(),
});

export const updateModuleInputSchema = z.object({
  contentId: z.string().uuid(),
  moduleId: z.string().uuid(),
  data: updateModulePayloadSchema,
});

export const deleteModuleInputSchema = z.object({
  contentId: z.string().uuid(),
  moduleId: z.string().uuid(),
});

export const createSectionPayloadSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  orderIndex: z.number().min(0),
  estimatedDuration: z.number().min(1).optional(),
  learningObjectives: z.array(z.string()).default([]),
  contentItems: z
    .array(
      z.object({
        type: z.enum(['VIDEO', 'DOCUMENT', 'TEXT', 'URL']),
        title: z.string(),
        description: z.string().optional(),
        estimatedDuration: z.number().optional(),
      })
    )
    .default([]),
});

export const createSectionInputSchema = z.object({
  moduleId: z.string().uuid(),
  data: createSectionPayloadSchema,
});

export const updateSectionPayloadSchema = z.object({
  title: z.string().min(1, 'Title is required').optional(),
  description: z.string().optional(),
  orderIndex: z.number().min(0).optional(),
});

export const updateSectionInputSchema = z.object({
  moduleId: z.string().uuid(),
  sectionId: z.string().uuid(),
  data: updateSectionPayloadSchema,
});

export const deleteSectionInputSchema = z.object({
  moduleId: z.string().uuid(),
  sectionId: z.string().uuid(),
});

export const createContentItemPayloadSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  type: contentItemTypeSchema,
  orderIndex: z.number().min(0),
  content: z.string().optional(),
  fileUrl: z.string().optional(),
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
  duration: z.number().optional(),
  isPreview: z.boolean().default(false),
});

export const createContentItemInputSchema = z.object({
  sectionId: z.string().uuid(),
  data: createContentItemPayloadSchema,
});

export const updateContentItemPayloadSchema = z.object({
  title: z.string().min(1, 'Title is required').optional(),
  description: z.string().optional(),
  type: contentItemTypeSchema.optional(),
  orderIndex: z.number().min(0).optional(),
  content: z.string().optional(),
  fileUrl: z.string().optional(),
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
  duration: z.number().optional(),
  isPreview: z.boolean().optional(),
});

export const updateContentItemInputSchema = z.object({
  sectionId: z.string().uuid(),
  itemId: z.string().uuid(),
  data: updateContentItemPayloadSchema,
});

export const deleteContentItemInputSchema = z.object({
  sectionId: z.string().uuid(),
  itemId: z.string().uuid(),
});

export const submitContentForReviewInputSchema = z.object({
  contentId: z.string().uuid(),
});

export const updateProfileContentInputSchema = z.object({
  contentIds: z.array(z.string().uuid()).min(0),
});

export const listAdminContentInputSchema = z.object({
  status: z.string().optional(),
  mentorId: z.string().uuid().optional(),
  type: contentTypeSchema.or(z.literal('ALL')).optional(),
  search: z.string().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export const reviewAdminContentInputSchema = z.object({
  contentId: z.string().uuid(),
  action: adminContentReviewActionSchema,
  note: z.string().optional(),
});

export type CreateContentInput = z.infer<typeof createContentInputSchema>;
export type UpdateContentInput = z.infer<typeof updateContentInputSchema>;
export type ArchiveContentInput = z.infer<typeof archiveContentInputSchema>;
export type DeleteContentInput = z.infer<typeof deleteContentInputSchema>;
export type GetContentInput = z.infer<typeof getContentInputSchema>;
export type SaveCourseInput = z.infer<typeof saveCourseInputSchema>;
export type CreateModuleInput = z.infer<typeof createModuleInputSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleInputSchema>;
export type DeleteModuleInput = z.infer<typeof deleteModuleInputSchema>;
export type CreateSectionInput = z.infer<typeof createSectionInputSchema>;
export type UpdateSectionInput = z.infer<typeof updateSectionInputSchema>;
export type DeleteSectionInput = z.infer<typeof deleteSectionInputSchema>;
export type CreateContentItemInput = z.infer<typeof createContentItemInputSchema>;
export type UpdateContentItemInput = z.infer<typeof updateContentItemInputSchema>;
export type DeleteContentItemInput = z.infer<typeof deleteContentItemInputSchema>;
export type SubmitContentForReviewInput = z.infer<
  typeof submitContentForReviewInputSchema
>;
export type UpdateProfileContentInput = z.infer<
  typeof updateProfileContentInputSchema
>;
export type ListAdminContentInput = z.infer<typeof listAdminContentInputSchema>;
export type ReviewAdminContentInput = z.infer<
  typeof reviewAdminContentInputSchema
>;
