import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useTRPCClient } from '@/lib/trpc/react';
import type { ContentReviewAction } from '@/lib/content/review-rules';
import type { RouterOutputs } from '@/lib/trpc/types';

type AdminContentListResponse = RouterOutputs['content']['adminList'];
export type AdminContentItem = AdminContentListResponse['data'][number];
export type AdminContentPagination = AdminContentListResponse['pagination'];
export type AdminContentDetail = RouterOutputs['content']['adminGet']['data'];
export type AdminContentSummary = RouterOutputs['content']['adminSummary']['data'];
export type AdminContentAction = ContentReviewAction;

export const adminContentKeys = {
  all: ['admin-content'] as const,
  list: (input: {
    status?: string;
    page?: number;
    search?: string;
    type?: string;
    deleted?: boolean;
  }) => ['admin-content', 'list', input] as const,
  detail: (contentId?: string | null) =>
    ['admin-content', 'detail', contentId ?? 'none'] as const,
  summary: (input: {
    search?: string;
    type?: string;
    mentorId?: string;
  }) => ['admin-content', 'summary', input] as const,
};

const adminContentActionSuccessMessages: Record<AdminContentAction, string> = {
  APPROVE: 'Content approved successfully.',
  REJECT: 'Content rejected and feedback saved.',
  FLAG: 'Content flagged for violation review.',
  UNFLAG: 'Content flag removed successfully.',
  FORCE_APPROVE: 'Content force approved successfully.',
  FORCE_ARCHIVE: 'Content archived successfully.',
  REVOKE_APPROVAL: 'Content approval revoked successfully.',
  FORCE_DELETE: 'Content deleted and scheduled for purge.',
};

export function useAdminContentListQuery(input: {
  status?: string;
  page?: number;
  search?: string;
  type?: string;
  deleted?: boolean;
}) {
  const trpcClient = useTRPCClient();

  return useQuery({
    queryKey: adminContentKeys.list(input),
    queryFn: () =>
      trpcClient.content.adminList.query({
        status: input.status,
        page: input.page ?? 1,
        search: input.search,
        deleted: input.deleted,
        type:
          input.type && input.type !== 'ALL'
            ? (input.type as 'COURSE' | 'FILE' | 'URL')
            : 'ALL',
        limit: 20,
      }),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useAdminContentSummaryQuery(input: {
  search?: string;
  type?: string;
  mentorId?: string;
}) {
  const trpcClient = useTRPCClient();

  return useQuery({
    queryKey: adminContentKeys.summary(input),
    queryFn: () =>
      trpcClient.content.adminSummary.query({
        search: input.search,
        mentorId: input.mentorId,
        type:
          input.type && input.type !== 'ALL'
            ? (input.type as 'COURSE' | 'FILE' | 'URL')
            : 'ALL',
      }),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useAdminContentDetailQuery(
  contentId?: string | null,
  enabled = true
) {
  const trpcClient = useTRPCClient();

  return useQuery({
    queryKey: adminContentKeys.detail(contentId),
    queryFn: () =>
      trpcClient.content.adminGet.query({
        contentId: contentId!,
      }),
    enabled: Boolean(contentId) && enabled,
  });
}

export function useAdminContentReviewMutation() {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      contentId: string;
      action: AdminContentAction;
      note?: string;
    }) => trpcClient.content.adminReview.mutate(input),
    onSuccess: async (_result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminContentKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['content'] }),
      ]);
      toast.success(adminContentActionSuccessMessages[variables.action]);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Failed to review content'
      );
    },
  });
}
