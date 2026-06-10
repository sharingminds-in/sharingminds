import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useTRPCClient } from '@/lib/trpc/react';
import type { RouterOutputs } from '@/lib/trpc/types';

type BookingItem = RouterOutputs['bookings']['list'][number];
type BookingDetail = RouterOutputs['bookings']['get'];
type SessionView = RouterOutputs['bookings']['sessionView'];
type SessionPolicies = RouterOutputs['bookings']['getPolicies'];
type AlternativeMentors = RouterOutputs['bookings']['listAlternativeMentors'];

export const bookingKeys = {
  all: ['bookings'] as const,
  listPrefix: (userId: string) => ['bookings', 'list', userId] as const,
  list: (
    userId: string,
    role: 'mentor' | 'mentee',
    status?: string
  ) => ['bookings', 'list', userId, { role, status }] as const,
  detailPrefix: (bookingId: string) => ['bookings', 'detail', bookingId] as const,
  detail: (bookingId: string, userId: string) =>
    ['bookings', 'detail', bookingId, userId] as const,
  sessionView: (sessionId: string) => ['bookings', 'session-view', sessionId] as const,
  mentorPendingReviews: ['bookings', 'mentor-pending-reviews'] as const,
  menteePendingReviews: ['bookings', 'mentee-pending-reviews'] as const,
  policies: (role?: 'mentor' | 'mentee') =>
    ['bookings', 'policies', role ?? 'all'] as const,
  alternativeMentors: (bookingId: string, fixedTime: boolean) =>
    ['bookings', 'alternative-mentors', bookingId, { fixedTime }] as const,
};

export function useBookingsQuery(
  userId: string | undefined,
  role: 'mentor' | 'mentee',
  options: {
    status?: string;
    enabled?: boolean;
  } = {}
) {
  const trpcClient = useTRPCClient();

  return useQuery({
    queryKey: bookingKeys.list(userId!, role, options.status),
    queryFn: () =>
      trpcClient.bookings.list.query({
        role,
        status: options.status,
      }),
    enabled: !!userId && (options.enabled ?? true),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useBookingQuery(
  bookingId: string | undefined | null,
  userId: string | undefined
) {
  const trpcClient = useTRPCClient();

  return useQuery({
    queryKey: bookingKeys.detail(bookingId!, userId!),
    queryFn: () =>
      trpcClient.bookings.get.query({
        bookingId: bookingId!,
      }),
    enabled: !!bookingId && !!userId,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useSessionViewQuery(
  sessionId: string | undefined | null,
  userId: string | undefined
) {
  const trpcClient = useTRPCClient();

  return useQuery({
    queryKey: bookingKeys.sessionView(sessionId!),
    queryFn: (): Promise<SessionView> =>
      trpcClient.bookings.sessionView.query({
        sessionId: sessionId!,
      }),
    enabled: !!sessionId && !!userId,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useMentorPendingReviewSessionsQuery(
  userId: string | undefined,
  enabled = true
) {
  const trpcClient = useTRPCClient();

  return useQuery({
    queryKey: bookingKeys.mentorPendingReviews,
    queryFn: () => trpcClient.bookings.mentorPendingReviews.query(),
    enabled: !!userId && enabled,
  });
}

export function useMenteePendingReviewSessionsQuery(
  userId: string | undefined,
  enabled = true
) {
  const trpcClient = useTRPCClient();

  return useQuery({
    queryKey: bookingKeys.menteePendingReviews,
    queryFn: () => trpcClient.bookings.menteePendingReviews.query(),
    enabled: !!userId && enabled,
  });
}

export function useSessionPoliciesQuery(
  userId: string | undefined,
  role?: 'mentor' | 'mentee'
) {
  const trpcClient = useTRPCClient();

  return useQuery({
    queryKey: bookingKeys.policies(role),
    queryFn: () =>
      trpcClient.bookings.getPolicies.query({
        role,
      }),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useAlternativeMentorsQuery(
  bookingId: string | undefined | null,
  userId: string | undefined,
  fixedTime: boolean
) {
  const trpcClient = useTRPCClient();

  return useQuery({
    queryKey: bookingKeys.alternativeMentors(bookingId!, fixedTime),
    queryFn: () =>
      trpcClient.bookings.listAlternativeMentors.query({
        bookingId: bookingId!,
        fixedTime,
      }),
    enabled: !!bookingId && !!userId,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

function invalidateBookingQueries(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: bookingKeys.all }),
  ]);
}

export function useCreateBookingMutation() {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      mentorId,
      sessionType,
      title,
      description,
      scheduledAt,
      duration,
      meetingType,
      location,
      bookingSource,
      aiConversationId,
      aiRecommendationRunId,
      aiMentorProfileId,
    }: {
      mentorId: string;
      sessionType: 'FREE' | 'PAID' | 'COUNSELING';
      title: string;
      description?: string;
      scheduledAt: string;
      duration: number;
      meetingType: 'video' | 'audio' | 'chat';
      location?: string;
      bookingSource?: 'default' | 'ai' | 'explore';
      aiConversationId?: string;
      aiRecommendationRunId?: string;
      aiMentorProfileId?: string;
    }) =>
      trpcClient.bookings.create.mutate({
        mentorId,
        sessionType,
        title,
        description,
        scheduledAt,
        duration,
        meetingType,
        location,
        bookingSource,
        aiConversationId,
        aiRecommendationRunId,
        aiMentorProfileId,
      }),
    onSuccess: async () => {
      await invalidateBookingQueries(queryClient);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create booking');
    },
  });
}

export function useUpdateBookingMutation() {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      bookingId: string;
      status?: 'in_progress' | 'completed';
      meetingUrl?: string;
      mentorNotes?: string;
      menteeNotes?: string;
    }) => trpcClient.bookings.update.mutate(input),
    onSuccess: async (_result, variables) => {
      await Promise.all([
        invalidateBookingQueries(queryClient),
        queryClient.invalidateQueries({
          queryKey: bookingKeys.detailPrefix(variables.bookingId),
        }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update booking');
    },
  });
}

export function useCancelBookingMutation() {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      bookingId: string;
      reasonCategory: string;
      reasonDetails?: string;
    }) => trpcClient.bookings.cancel.mutate(input as any),
    onSuccess: async (_result, variables) => {
      await Promise.all([
        invalidateBookingQueries(queryClient),
        queryClient.invalidateQueries({
          queryKey: bookingKeys.detailPrefix(variables.bookingId),
        }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel booking');
    },
  });
}

export function useCreateRescheduleRequestMutation() {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      bookingId: string;
      scheduledAt: string;
      duration?: number;
    }) => trpcClient.bookings.createRescheduleRequest.mutate(input),
    onSuccess: async (_result, variables) => {
      await Promise.all([
        invalidateBookingQueries(queryClient),
        queryClient.invalidateQueries({
          queryKey: bookingKeys.detailPrefix(variables.bookingId),
        }),
      ]);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to create reschedule request'
      );
    },
  });
}

export function useRespondToRescheduleRequestMutation() {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      bookingId: string;
      requestId: string;
      action: 'accept' | 'reject' | 'counter_propose' | 'cancel_session';
      counterProposedTime?: string;
      cancellationReason?: string;
    }) => trpcClient.bookings.respondToRescheduleRequest.mutate(input),
    onSuccess: async (_result, variables) => {
      await Promise.all([
        invalidateBookingQueries(queryClient),
        queryClient.invalidateQueries({
          queryKey: bookingKeys.detailPrefix(variables.bookingId),
        }),
      ]);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to respond to reschedule request'
      );
    },
  });
}

export function useWithdrawRescheduleRequestMutation() {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { bookingId: string }) =>
      trpcClient.bookings.withdrawRescheduleRequest.mutate(input),
    onSuccess: async (_result, variables) => {
      await Promise.all([
        invalidateBookingQueries(queryClient),
        queryClient.invalidateQueries({
          queryKey: bookingKeys.detailPrefix(variables.bookingId),
        }),
      ]);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to withdraw reschedule request'
      );
    },
  });
}

export function useMarkBookingNoShowMutation() {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { bookingId: string }) =>
      trpcClient.bookings.markNoShow.mutate(input),
    onSuccess: async (_result, variables) => {
      await Promise.all([
        invalidateBookingQueries(queryClient),
        queryClient.invalidateQueries({
          queryKey: bookingKeys.detailPrefix(variables.bookingId),
        }),
      ]);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to mark session as no-show'
      );
    },
  });
}

export function useAcceptReassignmentMutation() {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { bookingId: string }) =>
      trpcClient.bookings.acceptReassignment.mutate(input),
    onSuccess: async (_result, variables) => {
      await Promise.all([
        invalidateBookingQueries(queryClient),
        queryClient.invalidateQueries({
          queryKey: bookingKeys.detailPrefix(variables.bookingId),
        }),
      ]);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to accept reassignment'
      );
    },
  });
}

export function useRejectReassignmentMutation() {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { bookingId: string; reason?: string }) =>
      trpcClient.bookings.rejectReassignment.mutate(input),
    onSuccess: async (_result, variables) => {
      await Promise.all([
        invalidateBookingQueries(queryClient),
        queryClient.invalidateQueries({
          queryKey: bookingKeys.detailPrefix(variables.bookingId),
        }),
      ]);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to reject reassignment'
      );
    },
  });
}

export function useSelectAlternativeMentorMutation() {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      bookingId: string;
      newMentorId: string;
      scheduledAt?: string;
    }) => trpcClient.bookings.selectAlternativeMentor.mutate(input),
    onSuccess: async (_result, variables) => {
      await Promise.all([
        invalidateBookingQueries(queryClient),
        queryClient.invalidateQueries({
          queryKey: bookingKeys.detailPrefix(variables.bookingId),
        }),
      ]);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to select alternative mentor'
      );
    },
  });
}

export type {
  AlternativeMentors,
  BookingDetail,
  BookingItem,
  SessionPolicies,
};
