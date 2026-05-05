import {
  adminProcedure,
  createTRPCRouter,
  mentorFeatureProcedure,
} from '../init';
import { MENTOR_FEATURE_KEYS } from '@/lib/mentor/access-policy';
import {
  archiveContent,
  createContent,
  createContentItem,
  createModule,
  createSection,
  deleteContent,
  deleteContentItem,
  deleteModule,
  deleteSection,
  getAdminContent,
  getAdminContentSummary,
  getContent,
  listAdminContent,
  listContent,
  listProfileContent,
  reviewAdminContent,
  saveCourse,
  submitContentForReview,
  updateContent,
  updateContentItem,
  updateModule,
  updateProfileContent,
  updateSection,
} from '@/lib/content/server/service';
import { throwAsTRPCError } from '@/lib/trpc/router-error';
import {
  archiveContentInputSchema,
  adminContentSummaryInputSchema,
  createContentInputSchema,
  createContentItemInputSchema,
  createModuleInputSchema,
  createSectionInputSchema,
  deleteContentInputSchema,
  deleteContentItemInputSchema,
  deleteModuleInputSchema,
  deleteSectionInputSchema,
  getContentInputSchema,
  listAdminContentInputSchema,
  reviewAdminContentInputSchema,
  saveCourseInputSchema,
  submitContentForReviewInputSchema,
  updateContentInputSchema,
  updateContentItemInputSchema,
  updateProfileContentInputSchema,
  updateSectionInputSchema,
  updateModuleInputSchema,
} from '@/lib/content/server/schemas';

export const contentRouter = createTRPCRouter({
  list: mentorFeatureProcedure(MENTOR_FEATURE_KEYS.contentManage).query(async ({ ctx }) => {
    try {
      return await listContent(ctx.userId, ctx.currentUser);
    } catch (error) {
      throwAsTRPCError(error, 'Failed to fetch content');
    }
  }),
  get: mentorFeatureProcedure(MENTOR_FEATURE_KEYS.contentManage)
    .input(getContentInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getContent(ctx.userId, input, ctx.currentUser);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to fetch content');
      }
    }),
  create: mentorFeatureProcedure(MENTOR_FEATURE_KEYS.contentManage)
    .input(createContentInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await createContent(ctx.userId, input, ctx.currentUser);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to create content');
      }
    }),
  update: mentorFeatureProcedure(MENTOR_FEATURE_KEYS.contentManage)
    .input(updateContentInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await updateContent(ctx.userId, input, ctx.currentUser);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to update content');
      }
    }),
  archive: mentorFeatureProcedure(MENTOR_FEATURE_KEYS.contentManage)
    .input(archiveContentInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await archiveContent(ctx.userId, input, ctx.currentUser);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to update content status');
      }
    }),
  delete: mentorFeatureProcedure(MENTOR_FEATURE_KEYS.contentManage)
    .input(deleteContentInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await deleteContent(ctx.userId, input, ctx.currentUser);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to delete content');
      }
    }),
  saveCourse: mentorFeatureProcedure(MENTOR_FEATURE_KEYS.contentManage)
    .input(saveCourseInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await saveCourse(ctx.userId, input, ctx.currentUser);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to save course');
      }
    }),
  createModule: mentorFeatureProcedure(MENTOR_FEATURE_KEYS.contentManage)
    .input(createModuleInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await createModule(ctx.userId, input, ctx.currentUser);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to create module');
      }
    }),
  updateModule: mentorFeatureProcedure(MENTOR_FEATURE_KEYS.contentManage)
    .input(updateModuleInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await updateModule(ctx.userId, input, ctx.currentUser);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to update module');
      }
    }),
  deleteModule: mentorFeatureProcedure(MENTOR_FEATURE_KEYS.contentManage)
    .input(deleteModuleInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await deleteModule(ctx.userId, input, ctx.currentUser);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to delete module');
      }
    }),
  createSection: mentorFeatureProcedure(MENTOR_FEATURE_KEYS.contentManage)
    .input(createSectionInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await createSection(ctx.userId, input, ctx.currentUser);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to create section');
      }
    }),
  updateSection: mentorFeatureProcedure(MENTOR_FEATURE_KEYS.contentManage)
    .input(updateSectionInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await updateSection(ctx.userId, input, ctx.currentUser);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to update section');
      }
    }),
  deleteSection: mentorFeatureProcedure(MENTOR_FEATURE_KEYS.contentManage)
    .input(deleteSectionInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await deleteSection(ctx.userId, input, ctx.currentUser);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to delete section');
      }
    }),
  createContentItem: mentorFeatureProcedure(MENTOR_FEATURE_KEYS.contentManage)
    .input(createContentItemInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await createContentItem(ctx.userId, input, ctx.currentUser);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to create content item');
      }
    }),
  updateContentItem: mentorFeatureProcedure(MENTOR_FEATURE_KEYS.contentManage)
    .input(updateContentItemInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await updateContentItem(ctx.userId, input, ctx.currentUser);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to update content item');
      }
    }),
  deleteContentItem: mentorFeatureProcedure(MENTOR_FEATURE_KEYS.contentManage)
    .input(deleteContentItemInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await deleteContentItem(ctx.userId, input, ctx.currentUser);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to delete content item');
      }
    }),
  submitForReview: mentorFeatureProcedure(MENTOR_FEATURE_KEYS.contentManage)
    .input(submitContentForReviewInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await submitContentForReview(ctx.userId, input, ctx.currentUser);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to submit content for review');
      }
    }),
  profileList: mentorFeatureProcedure(MENTOR_FEATURE_KEYS.contentManage).query(async ({ ctx }) => {
    try {
      return await listProfileContent(ctx.userId, ctx.currentUser);
    } catch (error) {
      throwAsTRPCError(error, 'Failed to fetch profile content');
    }
  }),
  profileUpdate: mentorFeatureProcedure(MENTOR_FEATURE_KEYS.contentManage)
    .input(updateProfileContentInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await updateProfileContent(ctx.userId, input, ctx.currentUser);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to update profile content');
      }
    }),
  adminList: adminProcedure
    .input(listAdminContentInputSchema)
    .query(async ({ input }) => {
      try {
        return await listAdminContent(input);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to fetch admin content');
      }
    }),
  adminSummary: adminProcedure
    .input(adminContentSummaryInputSchema)
    .query(async ({ input }) => {
      try {
        return await getAdminContentSummary(input);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to fetch admin content summary');
      }
    }),
  adminGet: adminProcedure
    .input(getContentInputSchema)
    .query(async ({ input }) => {
      try {
        return await getAdminContent(input);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to fetch admin content detail');
      }
    }),
  adminReview: adminProcedure
    .input(reviewAdminContentInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await reviewAdminContent(ctx.userId, input);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to review content');
      }
    }),
});
