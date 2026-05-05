import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import {
  AccessPolicyError,
  assertMentorFeatureAccess as assertSharedMentorFeatureAccess,
} from '@/lib/access-policy/server';
import { client as pgClient, db } from '@/lib/db';
import {
  contentReviewAudit,
  courseModules,
  courseSections,
  courses,
  mentorContent,
  mentorProfileContent,
  mentors,
  sectionContentItems,
  users,
} from '@/lib/db/schema';
import { getUserWithRoles } from '@/lib/db/user-helpers';
import {
  getMentorContentOwnershipCondition,
  getMentorForContent,
} from '@/lib/api/mentor-content';
import { MENTOR_FEATURE_KEYS } from '@/lib/mentor/access-policy';
import {
  deleteStorageValues,
  normalizeStorageValue,
  resolveStorageUrl,
} from '@/lib/storage';
import { safeJsonParse } from '@/lib/utils/safe-json';
import { checkFeatureAccess } from '@/lib/subscriptions/enforcement';
import { FEATURE_KEYS } from '@/lib/subscriptions/feature-keys';
import {
  mentorEditableContentStatuses,
  type ContentReviewAction,
  type ContentStatus,
  validateContentReviewAction,
} from '@/lib/content/review-rules';
import {
  buildContentSelectShape,
  createContentSchemaCapabilities,
  getMissingContentColumns,
  normalizeContentRow,
  type ContentOptionalColumnKey,
  type ContentSchemaCapabilities,
} from './schema-compat';
import type {
  ArchiveContentInput,
  AdminContentSummaryInput,
  CreateContentInput,
  CreateContentItemInput,
  CreateModuleInput,
  CreateSectionInput,
  DeleteContentInput,
  DeleteContentItemInput,
  DeleteModuleInput,
  DeleteSectionInput,
  GetContentInput,
  ListAdminContentInput,
  ReviewAdminContentInput,
  SaveCourseInput,
  SubmitContentForReviewInput,
  UpdateContentInput,
  UpdateContentItemInput,
  UpdateModuleInput,
  UpdateProfileContentInput,
  UpdateSectionInput,
} from './schemas';
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
  updateModuleInputSchema,
  updateProfileContentInputSchema,
  updateSectionInputSchema,
} from './schemas';

const ENFORCE_CONTENT_SUBSCRIPTION = false;
const PURGE_RETENTION_DAYS = 30;

let contentSchemaCapabilitiesPromise: Promise<ContentSchemaCapabilities> | null =
  null;

const reviewActionToAuditAction: Record<
  ContentReviewAction,
  typeof contentReviewAudit.$inferInsert.action
> = {
  APPROVE: 'APPROVED',
  REJECT: 'REJECTED',
  FLAG: 'FLAGGED',
  UNFLAG: 'UNFLAGGED',
  FORCE_APPROVE: 'FORCE_APPROVED',
  FORCE_ARCHIVE: 'FORCE_ARCHIVED',
  REVOKE_APPROVAL: 'APPROVAL_REVOKED',
  FORCE_DELETE: 'FORCE_DELETED',
};

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getUserWithRoles>>>;
type MentorRecord = Awaited<ReturnType<typeof getMentorForContent>>;

type ContentActor = {
  userId: string;
  currentUser: CurrentUser;
  isAdmin: boolean;
  isMentor: boolean;
  mentor: MentorRecord;
  ownershipCondition: ReturnType<typeof getMentorContentOwnershipCondition>;
};

type AdminContentFilterInput = Pick<
  ListAdminContentInput,
  'mentorId' | 'type' | 'search'
>;

export class ContentServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly data?: unknown
  ) {
    super(message);
    this.name = 'ContentServiceError';
  }
}

async function getContentSchemaCapabilities(): Promise<ContentSchemaCapabilities> {
  if (!contentSchemaCapabilitiesPromise) {
    contentSchemaCapabilitiesPromise = (async () => {
      const rows = await pgClient<{ column_name: string }[]>`
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'mentor_content'
      `;

      return createContentSchemaCapabilities(rows.map((row) => row.column_name));
    })();
  }

  return contentSchemaCapabilitiesPromise;
}

function assertContentColumns(
  capabilities: ContentSchemaCapabilities,
  requiredColumns: ContentOptionalColumnKey[],
  actionDescription: string
) {
  const missing = getMissingContentColumns(capabilities, requiredColumns);

  assertContent(
    missing.length === 0,
    500,
    `Content schema is outdated for ${actionDescription}. Missing mentor_content columns: ${missing.join(
      ', '
    )}`
  );
}

function buildAdminContentFilterConditions(input: AdminContentFilterInput) {
  const conditions: SQL[] = [];

  if (input.mentorId) {
    conditions.push(eq(mentorContent.mentorId, input.mentorId));
  }

  if (input.type && input.type !== 'ALL') {
    conditions.push(eq(mentorContent.type, input.type));
  }

  if (input.search) {
    conditions.push(
      or(
        ilike(mentorContent.title, `%${input.search}%`),
        ilike(mentorContent.description, `%${input.search}%`)
      )!
    );
  }

  return conditions;
}

function combineAdminContentConditions(conditions: SQL[]) {
  return conditions.length > 0 ? and(...conditions) : undefined;
}

function assertContent(
  condition: unknown,
  status: number,
  message: string,
  data?: unknown
): asserts condition {
  if (!condition) {
    throw new ContentServiceError(status, message, data);
  }
}

async function getContentActor(
  userId: string,
  currentUser?: CurrentUser
): Promise<ContentActor> {
  const resolvedUser = currentUser ?? (await getUserWithRoles(userId));
  const isAdmin = resolvedUser?.roles.some((role) => role.name === 'admin') ?? false;
  const isMentor =
    resolvedUser?.roles.some((role) => role.name === 'mentor') ?? false;

  assertContent(resolvedUser, 401, 'Authentication required');

  if (!isAdmin) {
    await assertMentorContentFeatureAccess(userId, resolvedUser);
  }

  const mentor = await getMentorForContent(userId);

  if (!isAdmin) {
    assertContent(mentor, 404, 'Mentor not found');
  }

  const ownershipCondition = getMentorContentOwnershipCondition(
    mentor?.id ?? null,
    isAdmin
  );

  assertContent(ownershipCondition, 404, 'Mentor not found');

  return {
    userId,
    currentUser: resolvedUser,
    isAdmin,
    isMentor,
    mentor,
    ownershipCondition,
  };
}

async function assertMentorContentFeatureAccess(
  userId: string,
  currentUser: CurrentUser
) {
  try {
    await assertSharedMentorFeatureAccess({
      userId,
      feature: MENTOR_FEATURE_KEYS.contentManage,
      currentUser,
      source: 'content.manage',
    });
  } catch (error) {
    if (error instanceof AccessPolicyError) {
      assertContent(false, error.status, error.message, error.data);
    }

    throw error;
  }
}

async function hydrateRootContent<T extends { fileUrl: string | null }>(content: T) {
  return {
    ...content,
    fileUrl: await resolveStorageUrl(content.fileUrl),
  };
}

async function hydrateCourse<T extends { thumbnailUrl: string | null; tags: string | null; platformTags: string | null; prerequisites: string | null; learningOutcomes: string | null }>(
  course: T
) {
  return {
    ...course,
    thumbnailUrl: await resolveStorageUrl(course.thumbnailUrl),
    tags: safeJsonParse(course.tags),
    platformTags: safeJsonParse(course.platformTags),
    prerequisites: safeJsonParse(course.prerequisites),
    learningOutcomes: safeJsonParse(course.learningOutcomes),
  };
}

async function hydrateContentItem<T extends { fileUrl: string | null }>(item: T) {
  return {
    ...item,
    fileUrl: await resolveStorageUrl(item.fileUrl),
  };
}

async function getOwnedContentRecord(
  actor: ContentActor,
  contentId: string,
  options: {
    requireCourseType?: boolean;
    allowDeletedForAdmin?: boolean;
  } = {}
) {
  const capabilities = await getContentSchemaCapabilities();
  const rows = await db
    .select(buildContentSelectShape(capabilities))
    .from(mentorContent)
    .where(
      and(
        eq(mentorContent.id, contentId),
        actor.ownershipCondition,
        options.requireCourseType ? eq(mentorContent.type, 'COURSE') : undefined
      )
    )
    .limit(1);

  const content = rows[0]
    ? normalizeContentRow(rows[0], capabilities)
    : null;
  assertContent(content, 404, 'Content not found');

  if (!actor.isAdmin && content.deletedAt) {
    throw new ContentServiceError(404, 'Content not found');
  }

  if (actor.isAdmin && !options.allowDeletedForAdmin && content.deletedAt) {
    throw new ContentServiceError(400, 'Deleted content cannot be modified');
  }

  return content;
}

async function getOwnedCourseRecord(actor: ContentActor, contentId: string) {
  await getOwnedContentRecord(actor, contentId, { requireCourseType: true });

  const rows = await db
    .select()
    .from(courses)
    .where(eq(courses.contentId, contentId))
    .limit(1);

  const course = rows[0];
  assertContent(course, 404, 'Course not found');
  return course;
}

async function getOwnedModuleRecord(actor: ContentActor, moduleId: string) {
  const capabilities = await getContentSchemaCapabilities();
  const rows = await db
    .select({
      module: courseModules,
      course: courses,
      content: buildContentSelectShape(capabilities),
    })
    .from(courseModules)
    .innerJoin(courses, eq(courseModules.courseId, courses.id))
    .innerJoin(mentorContent, eq(courses.contentId, mentorContent.id))
    .where(and(eq(courseModules.id, moduleId), actor.ownershipCondition))
    .limit(1);

  const moduleRow = rows[0]
    ? {
        ...rows[0],
        content: normalizeContentRow(rows[0].content, capabilities),
      }
    : null;
  assertContent(moduleRow, 404, 'Module not found');

  if (!actor.isAdmin && moduleRow.content.deletedAt) {
    throw new ContentServiceError(404, 'Module not found');
  }

  return moduleRow;
}

async function getOwnedSectionRecord(actor: ContentActor, sectionId: string) {
  const capabilities = await getContentSchemaCapabilities();
  const rows = await db
    .select({
      section: courseSections,
      module: courseModules,
      course: courses,
      content: buildContentSelectShape(capabilities),
    })
    .from(courseSections)
    .innerJoin(courseModules, eq(courseSections.moduleId, courseModules.id))
    .innerJoin(courses, eq(courseModules.courseId, courses.id))
    .innerJoin(mentorContent, eq(courses.contentId, mentorContent.id))
    .where(and(eq(courseSections.id, sectionId), actor.ownershipCondition))
    .limit(1);

  const sectionRow = rows[0]
    ? {
        ...rows[0],
        content: normalizeContentRow(rows[0].content, capabilities),
      }
    : null;
  assertContent(sectionRow, 404, 'Section not found');

  if (!actor.isAdmin && sectionRow.content.deletedAt) {
    throw new ContentServiceError(404, 'Section not found');
  }

  return sectionRow;
}

function validateContentItemPayload(data: {
  type?: string;
  content?: string | null;
  fileUrl?: string | null;
}) {
  if (data.type === 'TEXT' && !data.content) {
    throw new ContentServiceError(400, 'Content is required for TEXT type items');
  }

  if (
    (data.type === 'VIDEO' ||
      data.type === 'PDF' ||
      data.type === 'DOCUMENT') &&
    !data.fileUrl
  ) {
    throw new ContentServiceError(
      400,
      'File URL is required for file-based content items'
    );
  }

  if (data.type === 'URL' && !data.content) {
    throw new ContentServiceError(400, 'URL is required for URL type items');
  }
}

export async function listContent(
  userId: string,
  currentUser?: CurrentUser
) {
  const actor = await getContentActor(userId, currentUser);
  const capabilities = await getContentSchemaCapabilities();

  const rows = await db
    .select(buildContentSelectShape(capabilities))
    .from(mentorContent)
    .where(
      actor.isAdmin || !capabilities.deletedAt
        ? actor.ownershipCondition
        : and(actor.ownershipCondition, isNull(mentorContent.deletedAt))
    )
    .orderBy(mentorContent.createdAt);

  return Promise.all(
    rows.map((row) =>
      hydrateRootContent(normalizeContentRow(row, capabilities))
    )
  );
}

export async function getContent(
  userId: string,
  input: GetContentInput,
  currentUser?: CurrentUser
) {
  const parsed = getContentInputSchema.parse(input);
  const capabilities = await getContentSchemaCapabilities();
  const actor = await getContentActor(userId, currentUser);
  const content = await getOwnedContentRecord(actor, parsed.contentId, {
    allowDeletedForAdmin: true,
  });

  if (content.type !== 'COURSE') {
    return hydrateRootContent(content);
  }

  const courseRows = await db
    .select()
    .from(courses)
    .where(eq(courses.contentId, parsed.contentId))
    .limit(1);

  const course = courseRows[0];

  if (!course) {
    return hydrateRootContent(content);
  }

  const modules = await db
    .select()
    .from(courseModules)
    .where(eq(courseModules.courseId, course.id))
    .orderBy(courseModules.orderIndex);

  const modulesWithSections = await Promise.all(
    modules.map(async (module) => {
      const sections = await db
        .select()
        .from(courseSections)
        .where(eq(courseSections.moduleId, module.id))
        .orderBy(courseSections.orderIndex);

      const sectionsWithContent = await Promise.all(
        sections.map(async (section) => {
          const contentItems = await db
            .select()
            .from(sectionContentItems)
            .where(eq(sectionContentItems.sectionId, section.id))
            .orderBy(sectionContentItems.orderIndex);

          return {
            ...section,
            contentItems: await Promise.all(
              contentItems.map((item) => hydrateContentItem(item))
            ),
          };
        })
      );

      return {
        ...module,
        sections: sectionsWithContent,
      };
    })
  );

  return {
    ...(await hydrateRootContent(normalizeContentRow(content, capabilities))),
    course: {
      ...(await hydrateCourse(course)),
      modules: modulesWithSections,
    },
  };
}

export async function createContent(
  userId: string,
  input: CreateContentInput,
  currentUser?: CurrentUser
) {
  const parsed = createContentInputSchema.parse(input);
  const capabilities = await getContentSchemaCapabilities();
  const actor = await getContentActor(userId, currentUser);

  if (ENFORCE_CONTENT_SUBSCRIPTION && !actor.isAdmin) {
    if (parsed.type === 'COURSE') {
      const access = await checkFeatureAccess(
        userId,
        FEATURE_KEYS.COURSES_ACCESS,
        { audience: 'mentor', actorRole: 'mentor' }
      );

      assertContent(access.has_access, 403, 'Courses are not included in your plan', {
        feature: FEATURE_KEYS.COURSES_ACCESS,
        details: access.reason,
        limit: access.limit ?? null,
        usage: access.usage,
        remaining: access.remaining,
        upgrade_required: true,
      });
    } else {
      const access = await checkFeatureAccess(
        userId,
        FEATURE_KEYS.CONTENT_POSTING_ACCESS,
        { audience: 'mentor', actorRole: 'mentor' }
      );

      assertContent(
        access.has_access,
        403,
        'Content publishing is not included in your plan',
        {
          feature: FEATURE_KEYS.CONTENT_POSTING_ACCESS,
          details: access.reason,
          limit: access.limit ?? null,
          usage: access.usage,
          remaining: access.remaining,
          upgrade_required: true,
        }
      );
    }
  }

  if (actor.isAdmin && parsed.type !== 'COURSE') {
    throw new ContentServiceError(403, 'Admins can only create courses');
  }

  if (parsed.type === 'FILE' && !parsed.fileUrl) {
    throw new ContentServiceError(400, 'File URL is required for FILE type content');
  }

  if (parsed.type === 'URL' && !parsed.url) {
    throw new ContentServiceError(400, 'URL is required for URL type content');
  }

  const [created] = await db
    .insert(mentorContent)
    .values({
      title: parsed.title!,
      description: parsed.description,
      type: parsed.type!,
      status: 'DRAFT',
      fileUrl: normalizeStorageValue(parsed.fileUrl),
      fileName: parsed.fileName,
      fileSize: parsed.fileSize,
      mimeType: parsed.mimeType,
      url: parsed.url,
      urlTitle: parsed.urlTitle,
      urlDescription: parsed.urlDescription,
      mentorId: actor.isAdmin ? null : actor.mentor?.id ?? null,
    })
    .returning(buildContentSelectShape(capabilities));

  assertContent(created, 500, 'Failed to create content');
  return hydrateRootContent(normalizeContentRow(created, capabilities));
}

export async function updateContent(
  userId: string,
  input: UpdateContentInput,
  currentUser?: CurrentUser
) {
  const parsed = updateContentInputSchema.parse(input);
  const capabilities = await getContentSchemaCapabilities();
  const actor = await getContentActor(userId, currentUser);
  const currentContent = await getOwnedContentRecord(actor, parsed.contentId);

  assertContent(
    mentorEditableContentStatuses.has(currentContent.status as ContentStatus),
    400,
    `Content in status '${currentContent.status}' is not editable`
  );

  const mutableKeys = Object.keys(parsed.data);
  assertContent(mutableKeys.length > 0, 400, 'No updates provided');

  const updatePayload: Partial<typeof mentorContent.$inferInsert> = {
    updatedAt: new Date(),
  };

  for (const key of mutableKeys) {
    const value = parsed.data[key as keyof typeof parsed.data];
    if (key === 'fileUrl') {
      updatePayload.fileUrl = normalizeStorageValue(value as string | undefined);
    } else {
      (updatePayload as Record<string, unknown>)[key] = value;
    }
  }

  const shouldCleanupRootFile =
    updatePayload.fileUrl !== undefined &&
    normalizeStorageValue(currentContent.fileUrl) !==
      normalizeStorageValue(updatePayload.fileUrl);

  const [updated] = await db
    .update(mentorContent)
    .set(updatePayload)
    .where(and(eq(mentorContent.id, parsed.contentId), actor.ownershipCondition))
    .returning(buildContentSelectShape(capabilities));

  assertContent(updated, 500, 'Failed to update content');

  if (shouldCleanupRootFile && currentContent.fileUrl) {
    await deleteStorageValues([normalizeStorageValue(currentContent.fileUrl)]);
  }

  return hydrateRootContent(normalizeContentRow(updated, capabilities));
}

export async function archiveContent(
  userId: string,
  input: ArchiveContentInput,
  currentUser?: CurrentUser
) {
  const parsed = archiveContentInputSchema.parse(input);
  const capabilities = await getContentSchemaCapabilities();
  const actor = await getContentActor(userId, currentUser);
  const currentContent = await getOwnedContentRecord(actor, parsed.contentId);

  assertContentColumns(
    capabilities,
    parsed.action === 'archive'
      ? ['statusBeforeArchive']
      : [
          'statusBeforeArchive',
          'requireReviewAfterRestore',
          'deletedAt',
          'deletedBy',
          'deleteReason',
          'purgeAfterAt',
        ],
    parsed.action === 'archive' ? 'archiving content' : 'restoring content'
  );

  const updatePayload: Partial<typeof mentorContent.$inferInsert> = {
    updatedAt: new Date(),
  };

  let nextStatus = currentContent.status;
  let reviewAction: typeof contentReviewAudit.$inferInsert.action | null = null;

  if (parsed.action === 'archive') {
    assertContent(
      currentContent.status !== 'ARCHIVED',
      400,
      'Content is already archived'
    );
    assertContent(
      currentContent.status !== 'PENDING_REVIEW',
      400,
      'Content under review cannot be archived'
    );

    updatePayload.status = 'ARCHIVED';
    updatePayload.statusBeforeArchive = currentContent.status;
    nextStatus = 'ARCHIVED';
    reviewAction = 'ARCHIVED';
  } else {
    assertContent(
      currentContent.status === 'ARCHIVED',
      400,
      'Only archived content can be restored'
    );

    const restoreStatus =
      currentContent.statusBeforeArchive === 'APPROVED' &&
      !currentContent.requireReviewAfterRestore
        ? 'APPROVED'
        : 'DRAFT';

    updatePayload.status = restoreStatus as ContentStatus;
    updatePayload.statusBeforeArchive = null;
    updatePayload.deletedAt = null;
    updatePayload.deletedBy = null;
    updatePayload.deleteReason = null;
    updatePayload.purgeAfterAt = null;
    nextStatus = restoreStatus;
    reviewAction = 'RESTORED';
  }

  const [updated] = await db.transaction(async (tx) => {
    const rows = await tx
      .update(mentorContent)
      .set(updatePayload)
      .where(and(eq(mentorContent.id, parsed.contentId), actor.ownershipCondition))
      .returning(buildContentSelectShape(capabilities));

    if (rows[0] && reviewAction && currentContent.mentorId) {
      await tx.insert(contentReviewAudit).values({
        contentId: parsed.contentId,
        mentorId: currentContent.mentorId,
        action: reviewAction,
        previousStatus: currentContent.status,
        newStatus: nextStatus,
        reviewedBy: null,
        note: null,
      });
    }

    return rows;
  });

  assertContent(updated, 500, 'Failed to update content');
  return hydrateRootContent(normalizeContentRow(updated, capabilities));
}

export async function deleteContent(
  userId: string,
  input: DeleteContentInput,
  currentUser?: CurrentUser
) {
  const parsed = deleteContentInputSchema.parse(input);
  const capabilities = await getContentSchemaCapabilities();
  const actor = await getContentActor(userId, currentUser);
  const content = await getOwnedContentRecord(actor, parsed.contentId, {
    allowDeletedForAdmin: true,
  });

  assertContentColumns(
    capabilities,
    ['statusBeforeArchive', 'requireReviewAfterRestore', 'deletedAt', 'deletedBy', 'deleteReason', 'purgeAfterAt'],
    'deleting content'
  );

  if (content.deletedAt) {
    return {
      message: 'Content is already deleted',
      purgeAfterAt: content.purgeAfterAt?.toISOString() ?? null,
    };
  }

  const now = new Date();
  const purgeAfter = new Date(
    now.getTime() + PURGE_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );

  await db.transaction(async (tx) => {
    await tx
      .update(mentorContent)
      .set({
        status: 'ARCHIVED',
        statusBeforeArchive:
          content.status === 'ARCHIVED'
            ? content.statusBeforeArchive || 'DRAFT'
            : content.status,
        requireReviewAfterRestore: true,
        deletedAt: now,
        deletedBy: userId,
        deleteReason: actor.isAdmin ? 'Deleted by admin' : 'Deleted by mentor',
        purgeAfterAt: purgeAfter,
        updatedAt: now,
      })
      .where(eq(mentorContent.id, parsed.contentId));

    if (content.mentorId) {
      await tx.insert(contentReviewAudit).values({
        contentId: parsed.contentId,
        mentorId: content.mentorId,
        action: 'ARCHIVED',
        previousStatus: content.status,
        newStatus: 'ARCHIVED',
        reviewedBy: null,
        note: actor.isAdmin
          ? 'Soft deleted by admin via delete action'
          : 'Soft deleted by mentor via delete action',
      });
    }
  });

  return {
    message:
      'Content deleted successfully. It is retained for 30 days before permanent purge.',
    purgeAfterAt: purgeAfter.toISOString(),
  };
}

export async function saveCourse(
  userId: string,
  input: SaveCourseInput,
  currentUser?: CurrentUser
) {
  const parsed = saveCourseInputSchema.parse(input);
  const actor = await getContentActor(userId, currentUser);
  await getOwnedContentRecord(actor, parsed.contentId, { requireCourseType: true });

  const existingRows = await db
    .select({
      id: courses.id,
      ownerType: courses.ownerType,
      thumbnailUrl: courses.thumbnailUrl,
    })
    .from(courses)
    .where(eq(courses.contentId, parsed.contentId))
    .limit(1);

  if (!existingRows.length) {
    const [created] = await db
      .insert(courses)
      .values({
        contentId: parsed.contentId,
        difficulty: parsed.data.difficulty,
        duration: parsed.data.duration,
        price: parsed.data.price,
        currency: parsed.data.currency,
        thumbnailUrl: normalizeStorageValue(parsed.data.thumbnailUrl),
        category: parsed.data.category,
        tags: JSON.stringify(parsed.data.tags ?? []),
        platformTags: actor.isAdmin
          ? JSON.stringify(parsed.data.platformTags ?? [])
          : null,
        platformName: actor.isAdmin ? parsed.data.platformName ?? null : null,
        prerequisites: JSON.stringify(parsed.data.prerequisites ?? []),
        learningOutcomes: JSON.stringify(parsed.data.learningOutcomes ?? []),
        ownerType: actor.isAdmin ? 'PLATFORM' : 'MENTOR',
        ownerId: actor.isAdmin ? null : actor.mentor?.id ?? null,
      })
      .returning();

    assertContent(created, 500, 'Failed to create course');
    return hydrateCourse(created);
  }

  const existingCourse = existingRows[0];
  const updateData: Partial<typeof courses.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (parsed.data.difficulty !== undefined) updateData.difficulty = parsed.data.difficulty;
  if (parsed.data.duration !== undefined) updateData.duration = parsed.data.duration;
  if (parsed.data.price !== undefined) updateData.price = parsed.data.price;
  if (parsed.data.currency !== undefined) updateData.currency = parsed.data.currency;
  if (parsed.data.thumbnailUrl !== undefined) {
    updateData.thumbnailUrl = normalizeStorageValue(parsed.data.thumbnailUrl);
  }
  if (parsed.data.category !== undefined) updateData.category = parsed.data.category;
  if (parsed.data.tags !== undefined) updateData.tags = JSON.stringify(parsed.data.tags);
  if (parsed.data.prerequisites !== undefined) {
    updateData.prerequisites = JSON.stringify(parsed.data.prerequisites);
  }
  if (parsed.data.learningOutcomes !== undefined) {
    updateData.learningOutcomes = JSON.stringify(parsed.data.learningOutcomes);
  }

  if (actor.isAdmin && existingCourse.ownerType === 'PLATFORM') {
    if (parsed.data.platformTags !== undefined) {
      updateData.platformTags = JSON.stringify(parsed.data.platformTags);
    }
    if (parsed.data.platformName !== undefined) {
      updateData.platformName = parsed.data.platformName;
    }
  }

  const [updated] = await db
    .update(courses)
    .set(updateData)
    .where(eq(courses.contentId, parsed.contentId))
    .returning();

  assertContent(updated, 500, 'Failed to update course');

  const previousThumbnail = normalizeStorageValue(existingCourse.thumbnailUrl);
  const nextThumbnail = normalizeStorageValue(updated.thumbnailUrl);
  if (previousThumbnail && previousThumbnail !== nextThumbnail) {
    await deleteStorageValues([previousThumbnail]);
  }

  return hydrateCourse(updated);
}

export async function createModule(
  userId: string,
  input: CreateModuleInput,
  currentUser?: CurrentUser
) {
  const parsed = createModuleInputSchema.parse(input);
  const actor = await getContentActor(userId, currentUser);
  const course = await getOwnedCourseRecord(actor, parsed.contentId);

  const [created] = await db
    .insert(courseModules)
    .values({
      courseId: course.id,
      title: parsed.data.title,
      description: parsed.data.description,
      orderIndex: parsed.data.orderIndex,
      learningObjectives: JSON.stringify(parsed.data.learningObjectives ?? []),
      estimatedDurationMinutes: parsed.data.estimatedDuration,
    })
    .returning();

  assertContent(created, 500, 'Failed to create module');
  return created;
}

export async function updateModule(
  userId: string,
  input: UpdateModuleInput,
  currentUser?: CurrentUser
) {
  const parsed = updateModuleInputSchema.parse(input);
  const actor = await getContentActor(userId, currentUser);
  const moduleRow = await getOwnedModuleRecord(actor, parsed.moduleId);
  assertContent(
    moduleRow.course.contentId === parsed.contentId,
    404,
    'Module not found'
  );

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
  if (parsed.data.description !== undefined) {
    updateData.description = parsed.data.description;
  }
  if (parsed.data.orderIndex !== undefined) updateData.orderIndex = parsed.data.orderIndex;
  if (parsed.data.learningObjectives !== undefined) {
    updateData.learningObjectives = JSON.stringify(parsed.data.learningObjectives);
  }
  if (parsed.data.estimatedDuration !== undefined) {
    updateData.estimatedDurationMinutes = parsed.data.estimatedDuration;
  }

  const [updated] = await db
    .update(courseModules)
    .set(updateData)
    .where(eq(courseModules.id, parsed.moduleId))
    .returning();

  assertContent(updated, 500, 'Failed to update module');
  return updated;
}

export async function deleteModule(
  userId: string,
  input: DeleteModuleInput,
  currentUser?: CurrentUser
) {
  const parsed = deleteModuleInputSchema.parse(input);
  const actor = await getContentActor(userId, currentUser);
  const moduleRow = await getOwnedModuleRecord(actor, parsed.moduleId);
  assertContent(
    moduleRow.course.contentId === parsed.contentId,
    404,
    'Module not found'
  );

  const nestedItems = await db
    .select({ fileUrl: sectionContentItems.fileUrl })
    .from(sectionContentItems)
    .innerJoin(courseSections, eq(sectionContentItems.sectionId, courseSections.id))
    .where(eq(courseSections.moduleId, parsed.moduleId));

  await db.delete(courseModules).where(eq(courseModules.id, parsed.moduleId));
  await deleteStorageValues(nestedItems.map((item) => normalizeStorageValue(item.fileUrl)));

  return { success: true };
}

export async function createSection(
  userId: string,
  input: CreateSectionInput,
  currentUser?: CurrentUser
) {
  const parsed = createSectionInputSchema.parse(input);
  const actor = await getContentActor(userId, currentUser);
  await getOwnedModuleRecord(actor, parsed.moduleId);

  const [created] = await db
    .insert(courseSections)
    .values({
      moduleId: parsed.moduleId,
      title: parsed.data.title,
      description: parsed.data.description,
      orderIndex: parsed.data.orderIndex,
    })
    .returning();

  assertContent(created, 500, 'Failed to create section');
  return created;
}

export async function updateSection(
  userId: string,
  input: UpdateSectionInput,
  currentUser?: CurrentUser
) {
  const parsed = updateSectionInputSchema.parse(input);
  const actor = await getContentActor(userId, currentUser);
  const sectionRow = await getOwnedSectionRecord(actor, parsed.sectionId);
  assertContent(
    sectionRow.section.moduleId === parsed.moduleId,
    404,
    'Section not found'
  );

  const [updated] = await db
    .update(courseSections)
    .set({
      ...parsed.data,
      updatedAt: new Date(),
    })
    .where(eq(courseSections.id, parsed.sectionId))
    .returning();

  assertContent(updated, 500, 'Failed to update section');
  return updated;
}

export async function deleteSection(
  userId: string,
  input: DeleteSectionInput,
  currentUser?: CurrentUser
) {
  const parsed = deleteSectionInputSchema.parse(input);
  const actor = await getContentActor(userId, currentUser);
  const sectionRow = await getOwnedSectionRecord(actor, parsed.sectionId);
  assertContent(
    sectionRow.section.moduleId === parsed.moduleId,
    404,
    'Section not found'
  );

  const items = await db
    .select({ fileUrl: sectionContentItems.fileUrl })
    .from(sectionContentItems)
    .where(eq(sectionContentItems.sectionId, parsed.sectionId));

  await db.delete(courseSections).where(eq(courseSections.id, parsed.sectionId));
  await deleteStorageValues(items.map((item) => normalizeStorageValue(item.fileUrl)));

  return { success: true };
}

export async function createContentItem(
  userId: string,
  input: CreateContentItemInput,
  currentUser?: CurrentUser
) {
  const parsed = createContentItemInputSchema.parse(input);
  const actor = await getContentActor(userId, currentUser);
  await getOwnedSectionRecord(actor, parsed.sectionId);
  validateContentItemPayload(parsed.data);

  const [created] = await db
    .insert(sectionContentItems)
    .values({
      sectionId: parsed.sectionId,
      title: parsed.data.title,
      description: parsed.data.description,
      type: parsed.data.type,
      orderIndex: parsed.data.orderIndex,
      content: parsed.data.content,
      fileUrl: normalizeStorageValue(parsed.data.fileUrl),
      fileName: parsed.data.fileName,
      fileSize: parsed.data.fileSize,
      mimeType: parsed.data.mimeType,
      duration: parsed.data.duration,
      isPreview: parsed.data.isPreview,
    })
    .returning();

  assertContent(created, 500, 'Failed to create content item');
  return hydrateContentItem(created);
}

export async function updateContentItem(
  userId: string,
  input: UpdateContentItemInput,
  currentUser?: CurrentUser
) {
  const parsed = updateContentItemInputSchema.parse(input);
  const actor = await getContentActor(userId, currentUser);
  await getOwnedSectionRecord(actor, parsed.sectionId);

  const existingRows = await db
    .select()
    .from(sectionContentItems)
    .where(
      and(
        eq(sectionContentItems.id, parsed.itemId),
        eq(sectionContentItems.sectionId, parsed.sectionId)
      )
    )
    .limit(1);

  const existing = existingRows[0];
  assertContent(existing, 404, 'Content item not found');

  const mergedType = parsed.data.type ?? existing.type;
  const mergedPayload = {
    type: mergedType,
    content: parsed.data.content ?? existing.content,
    fileUrl:
      parsed.data.fileUrl !== undefined
        ? parsed.data.fileUrl
        : existing.fileUrl,
  };
  validateContentItemPayload(mergedPayload);

  const previousFileUrl = normalizeStorageValue(existing.fileUrl);
  const nextFileUrl = normalizeStorageValue(parsed.data.fileUrl);

  const [updated] = await db
    .update(sectionContentItems)
    .set({
      ...parsed.data,
      fileUrl:
        parsed.data.fileUrl !== undefined
          ? normalizeStorageValue(parsed.data.fileUrl)
          : undefined,
      updatedAt: new Date(),
    })
    .where(eq(sectionContentItems.id, parsed.itemId))
    .returning();

  assertContent(updated, 500, 'Failed to update content item');

  if (
    parsed.data.fileUrl !== undefined &&
    previousFileUrl &&
    previousFileUrl !== nextFileUrl
  ) {
    await deleteStorageValues([previousFileUrl]);
  }

  return hydrateContentItem(updated);
}

export async function deleteContentItem(
  userId: string,
  input: DeleteContentItemInput,
  currentUser?: CurrentUser
) {
  const parsed = deleteContentItemInputSchema.parse(input);
  const actor = await getContentActor(userId, currentUser);
  await getOwnedSectionRecord(actor, parsed.sectionId);

  const existingRows = await db
    .select()
    .from(sectionContentItems)
    .where(
      and(
        eq(sectionContentItems.id, parsed.itemId),
        eq(sectionContentItems.sectionId, parsed.sectionId)
      )
    )
    .limit(1);

  const existing = existingRows[0];
  assertContent(existing, 404, 'Content item not found');

  await db.delete(sectionContentItems).where(eq(sectionContentItems.id, parsed.itemId));

  const fileUrlToDelete = normalizeStorageValue(existing.fileUrl);
  if (fileUrlToDelete) {
    await deleteStorageValues([fileUrlToDelete]);
  }

  return { success: true };
}

export async function submitContentForReview(
  userId: string,
  input: SubmitContentForReviewInput,
  currentUser?: CurrentUser
) {
  const parsed = submitContentForReviewInputSchema.parse(input);
  const capabilities = await getContentSchemaCapabilities();
  const actor = await getContentActor(userId, currentUser);
  assertContent(!actor.isAdmin, 403, 'Admins cannot submit content for review');

  const content = await getOwnedContentRecord(actor, parsed.contentId);
  const currentStatus = content.status;

  assertContent(
    currentStatus === 'DRAFT' || currentStatus === 'REJECTED',
    400,
    `Content with status '${currentStatus}' cannot be submitted for review. Only DRAFT or REJECTED content can be submitted.`
  );

  const [updated] = await db.transaction(async (tx) => {
    const rows = await tx
      .update(mentorContent)
      .set({
        status: 'PENDING_REVIEW',
        submittedForReviewAt: new Date(),
        reviewNote: null,
        updatedAt: new Date(),
      })
      .where(eq(mentorContent.id, parsed.contentId))
      .returning(buildContentSelectShape(capabilities));

    await tx.insert(contentReviewAudit).values({
      contentId: parsed.contentId,
      mentorId: actor.mentor!.id,
      action: currentStatus === 'REJECTED' ? 'RESUBMITTED' : 'SUBMITTED',
      previousStatus: currentStatus,
      newStatus: 'PENDING_REVIEW',
      reviewedBy: null,
      note: null,
    });

    return rows;
  });

  assertContent(updated, 500, 'Failed to submit content for review');
  return hydrateRootContent(normalizeContentRow(updated, capabilities));
}

export async function listProfileContent(
  userId: string,
  currentUser?: CurrentUser
) {
  const actor = await getContentActor(userId, currentUser);
  const capabilities = await getContentSchemaCapabilities();
  assertContent(actor.mentor, 404, 'Mentor not found');

  const selections = await db
    .select({
      selection: mentorProfileContent,
      content: buildContentSelectShape(capabilities),
    })
    .from(mentorProfileContent)
    .innerJoin(mentorContent, eq(mentorProfileContent.contentId, mentorContent.id))
    .where(eq(mentorProfileContent.mentorId, actor.mentor.id))
    .orderBy(asc(mentorProfileContent.displayOrder));

  const hydrated = await Promise.all(
    selections.map(async ({ selection, content }) => ({
      ...(await hydrateRootContent(normalizeContentRow(content, capabilities))),
      displayOrder: selection.displayOrder,
      addedAt: selection.addedAt,
    }))
  );

  return hydrated;
}

export async function updateProfileContent(
  userId: string,
  input: UpdateProfileContentInput,
  currentUser?: CurrentUser
) {
  const parsed = updateProfileContentInputSchema.parse(input);
  const actor = await getContentActor(userId, currentUser);
  assertContent(actor.mentor, 404, 'Mentor not found');

  if (parsed.contentIds.length > 0) {
    const validContent = await db
      .select({ id: mentorContent.id })
      .from(mentorContent)
      .where(
        and(
          eq(mentorContent.mentorId, actor.mentor.id),
          eq(mentorContent.status, 'APPROVED'),
          inArray(mentorContent.id, parsed.contentIds)
        )
      );

    const validIds = new Set(validContent.map((item) => item.id));
    const invalidIds = parsed.contentIds.filter((id) => !validIds.has(id));

    assertContent(
      invalidIds.length === 0,
      400,
      'Some content IDs are invalid or not approved',
      { invalidIds }
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(mentorProfileContent)
      .where(eq(mentorProfileContent.mentorId, actor.mentor!.id));

    if (parsed.contentIds.length > 0) {
      await tx.insert(mentorProfileContent).values(
        parsed.contentIds.map((contentId, index) => ({
          mentorId: actor.mentor!.id,
          contentId,
          displayOrder: index,
        }))
      );
    }
  });

  return {
    success: true,
    data: await listProfileContent(userId, currentUser),
  };
}

export async function listAdminContent(input: ListAdminContentInput) {
  const parsed = listAdminContentInputSchema.parse(input);
  const capabilities = await getContentSchemaCapabilities();
  const offset = (parsed.page - 1) * parsed.limit;
  const conditions = buildAdminContentFilterConditions(parsed);

  if (parsed.status && parsed.status !== 'ALL') {
    conditions.push(eq(mentorContent.status, parsed.status as ContentStatus));
  }
  if (parsed.deleted) {
    conditions.push(
      capabilities.deletedAt ? isNotNull(mentorContent.deletedAt) : sql`false`
    );
  } else if (capabilities.deletedAt) {
    conditions.push(isNull(mentorContent.deletedAt));
  }

  const whereClause = combineAdminContentConditions(conditions);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(mentorContent)
    .where(whereClause);

  const rows = await db
    .select({
      content: buildContentSelectShape(capabilities),
      mentorName: users.name,
      mentorEmail: users.email,
      mentorImage: users.image,
    })
    .from(mentorContent)
    .leftJoin(mentors, eq(mentorContent.mentorId, mentors.id))
    .leftJoin(users, eq(mentors.userId, users.id))
    .where(whereClause)
    .orderBy(
      parsed.deleted && capabilities.deletedAt
        ? desc(mentorContent.deletedAt)
        : desc(mentorContent.submittedForReviewAt),
      desc(mentorContent.createdAt)
    )
    .limit(parsed.limit)
    .offset(offset);

  return {
    success: true,
    data: rows.map((row) => ({
      ...row,
      content: normalizeContentRow(row.content, capabilities),
      mentorName: row.mentorName ?? (row.content.mentorId ? 'Unknown mentor' : 'Platform'),
      mentorEmail: row.mentorEmail ?? '',
      mentorImage: row.mentorImage ?? null,
    })),
    pagination: {
      page: parsed.page,
      limit: parsed.limit,
      totalCount: Number(countResult.count),
      totalPages: Math.ceil(Number(countResult.count) / parsed.limit),
    },
  };
}

async function countAdminContent(conditions: SQL[]) {
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(mentorContent)
    .where(combineAdminContentConditions(conditions));

  return Number(result?.count ?? 0);
}

export async function getAdminContentSummary(input: AdminContentSummaryInput) {
  const parsed = adminContentSummaryInputSchema.parse(input);
  const capabilities = await getContentSchemaCapabilities();
  const baseConditions = buildAdminContentFilterConditions(parsed);
  const activeConditions = capabilities.deletedAt
    ? [...baseConditions, isNull(mentorContent.deletedAt)]
    : [...baseConditions];
  const deletedConditions = capabilities.deletedAt
    ? [...baseConditions, isNotNull(mentorContent.deletedAt)]
    : [...baseConditions, sql`false`];
  const statuses: ContentStatus[] = [
    'DRAFT',
    'PENDING_REVIEW',
    'APPROVED',
    'REJECTED',
    'ARCHIVED',
    'FLAGGED',
  ];

  const [
    total,
    activeTotal,
    deleted,
    ...statusCounts
  ] = await Promise.all([
    countAdminContent(baseConditions),
    countAdminContent(activeConditions),
    countAdminContent(deletedConditions),
    ...statuses.map((status) =>
      countAdminContent([
        ...activeConditions,
        eq(mentorContent.status, status),
      ])
    ),
  ]);

  return {
    success: true,
    data: {
      total,
      activeTotal,
      deleted,
      byStatus: statuses.reduce(
        (acc, status, index) => ({
          ...acc,
          [status]: statusCounts[index] ?? 0,
        }),
        {} as Record<ContentStatus, number>
      ),
    },
  };
}

export async function getAdminContent(input: GetContentInput) {
  const parsed = getContentInputSchema.parse(input);
  const capabilities = await getContentSchemaCapabilities();

  const rows = await db
    .select({
      content: buildContentSelectShape(capabilities),
      mentorName: users.name,
      mentorEmail: users.email,
      mentorImage: users.image,
    })
    .from(mentorContent)
    .leftJoin(mentors, eq(mentorContent.mentorId, mentors.id))
    .leftJoin(users, eq(mentors.userId, users.id))
    .where(eq(mentorContent.id, parsed.contentId))
    .limit(1);

  const row = rows[0];
  assertContent(row, 404, 'Content not found');

  const rootContent = await hydrateRootContent(
    normalizeContentRow(row.content, capabilities)
  );

  const reviewAudit = await db
    .select({
      id: contentReviewAudit.id,
      action: contentReviewAudit.action,
      previousStatus: contentReviewAudit.previousStatus,
      newStatus: contentReviewAudit.newStatus,
      reviewedBy: contentReviewAudit.reviewedBy,
      note: contentReviewAudit.note,
      createdAt: contentReviewAudit.createdAt,
    })
    .from(contentReviewAudit)
    .where(eq(contentReviewAudit.contentId, parsed.contentId))
    .orderBy(desc(contentReviewAudit.createdAt))
    .limit(25);

  if (rootContent.type !== 'COURSE') {
    return {
      success: true,
      data: {
        content: rootContent,
        mentorName: row.mentorName ?? (rootContent.mentorId ? 'Unknown mentor' : 'Platform'),
        mentorEmail: row.mentorEmail ?? '',
        mentorImage: row.mentorImage ?? null,
        reviewAudit,
      },
    };
  }

  const courseRows = await db
    .select()
    .from(courses)
    .where(eq(courses.contentId, parsed.contentId))
    .limit(1);

  const course = courseRows[0];

  if (!course) {
    return {
      success: true,
      data: {
        content: rootContent,
        mentorName: row.mentorName ?? (rootContent.mentorId ? 'Unknown mentor' : 'Platform'),
        mentorEmail: row.mentorEmail ?? '',
        mentorImage: row.mentorImage ?? null,
        reviewAudit,
      },
    };
  }

  const modules = await db
    .select()
    .from(courseModules)
    .where(eq(courseModules.courseId, course.id))
    .orderBy(courseModules.orderIndex);

  const modulesWithSections = await Promise.all(
    modules.map(async (module) => {
      const sections = await db
        .select()
        .from(courseSections)
        .where(eq(courseSections.moduleId, module.id))
        .orderBy(courseSections.orderIndex);

      const sectionsWithContent = await Promise.all(
        sections.map(async (section) => {
          const contentItems = await db
            .select()
            .from(sectionContentItems)
            .where(eq(sectionContentItems.sectionId, section.id))
            .orderBy(sectionContentItems.orderIndex);

          return {
            ...section,
            contentItems: await Promise.all(
              contentItems.map((item) => hydrateContentItem(item))
            ),
          };
        })
      );

      return {
        ...module,
        sections: sectionsWithContent,
      };
    })
  );

  return {
    success: true,
    data: {
      content: {
        ...rootContent,
        course: {
          ...(await hydrateCourse(course)),
          modules: modulesWithSections,
        },
      },
      mentorName: row.mentorName ?? (rootContent.mentorId ? 'Unknown mentor' : 'Platform'),
      mentorEmail: row.mentorEmail ?? '',
      mentorImage: row.mentorImage ?? null,
      reviewAudit,
    },
  };
}

export async function reviewAdminContent(
  adminUserId: string,
  input: ReviewAdminContentInput
) {
  const parsed = reviewAdminContentInputSchema.parse(input);
  const capabilities = await getContentSchemaCapabilities();

  const rows = await db
    .select(buildContentSelectShape(capabilities))
    .from(mentorContent)
    .where(eq(mentorContent.id, parsed.contentId))
    .limit(1);

  const currentContent = rows[0]
    ? normalizeContentRow(rows[0], capabilities)
    : null;
  assertContent(currentContent, 404, 'Content not found');

  const validation = validateContentReviewAction({
    action: parsed.action,
    currentStatus: currentContent.status as ContentStatus,
    note: parsed.note,
    isDeleted: Boolean(currentContent.deletedAt),
  });
  assertContent(validation.ok, 400, validation.error);

  const now = new Date();
  const purgeAfter = new Date(
    now.getTime() + PURGE_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  const updates: Partial<typeof mentorContent.$inferInsert> = {
    updatedAt: now,
  };
  const currentStatus = currentContent.status as ContentStatus;
  let newStatus = currentStatus;

  if (parsed.action === 'FLAG' || parsed.action === 'UNFLAG' || parsed.action === 'FORCE_ARCHIVE') {
    assertContentColumns(
      capabilities,
      ['statusBeforeArchive'],
      `review action '${parsed.action}'`
    );
  }

  if (parsed.action === 'FORCE_DELETE') {
    assertContentColumns(
      capabilities,
      ['statusBeforeArchive', 'requireReviewAfterRestore', 'deletedAt', 'deletedBy', 'deleteReason', 'purgeAfterAt'],
      `review action '${parsed.action}'`
    );
  }

  switch (parsed.action) {
    case 'APPROVE':
      newStatus = 'APPROVED';
      updates.reviewedAt = now;
      updates.reviewedBy = adminUserId;
      updates.reviewNote = null;
      break;
    case 'FORCE_APPROVE':
      newStatus = 'APPROVED';
      updates.reviewedAt = now;
      updates.reviewedBy = adminUserId;
      updates.reviewNote = null;
      if (currentStatus === 'FLAGGED') {
        updates.flagReason = null;
        updates.flaggedAt = null;
        updates.flaggedBy = null;
        updates.statusBeforeArchive = null;
      }
      break;
    case 'REJECT':
    case 'REVOKE_APPROVAL':
      newStatus = 'REJECTED';
      updates.reviewedAt = now;
      updates.reviewedBy = adminUserId;
      updates.reviewNote = parsed.note;
      break;
    case 'FLAG':
      newStatus = 'FLAGGED';
      updates.statusBeforeArchive = currentStatus;
      updates.flagReason = parsed.note;
      updates.flaggedAt = now;
      updates.flaggedBy = adminUserId;
      break;
    case 'UNFLAG':
      newStatus = (currentContent.statusBeforeArchive || 'DRAFT') as ContentStatus;
      updates.statusBeforeArchive = null;
      updates.flagReason = null;
      updates.flaggedAt = null;
      updates.flaggedBy = null;
      break;
    case 'FORCE_ARCHIVE':
      newStatus = 'ARCHIVED';
      updates.statusBeforeArchive = currentStatus;
      if (currentStatus === 'FLAGGED') {
        updates.flagReason = null;
        updates.flaggedAt = null;
        updates.flaggedBy = null;
      }
      break;
    case 'FORCE_DELETE':
      newStatus = 'ARCHIVED';
      updates.statusBeforeArchive =
        currentStatus === 'ARCHIVED'
          ? currentContent.statusBeforeArchive || 'DRAFT'
          : currentStatus;
      updates.requireReviewAfterRestore = true;
      updates.deletedAt = now;
      updates.deletedBy = adminUserId;
      updates.deleteReason = parsed.note || null;
      updates.purgeAfterAt = purgeAfter;
      updates.reviewedAt = now;
      updates.reviewedBy = adminUserId;
      if (currentStatus === 'FLAGGED') {
        updates.flagReason = null;
        updates.flaggedAt = null;
        updates.flaggedBy = null;
      }
      break;
  }

  updates.status = newStatus;

  const [updated] = await db.transaction(async (tx) => {
    const result = await tx
      .update(mentorContent)
      .set(updates)
      .where(eq(mentorContent.id, parsed.contentId))
      .returning(buildContentSelectShape(capabilities));

    if (result[0] && currentContent.mentorId) {
      await tx.insert(contentReviewAudit).values({
        contentId: parsed.contentId,
        mentorId: currentContent.mentorId,
        action: reviewActionToAuditAction[parsed.action],
        previousStatus: currentStatus,
        newStatus,
        reviewedBy: adminUserId,
        note: parsed.note || null,
      });
    }

    return result;
  });

  assertContent(updated, 500, 'Failed to review content');
  return {
    success: true,
    data: await hydrateRootContent(normalizeContentRow(updated, capabilities)),
  };
}
