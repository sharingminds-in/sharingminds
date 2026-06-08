import { z } from 'zod';

import {
  listChatbotMessages,
  saveChatbotMessage,
} from '@/lib/chatbot/server/message-service';
import { MENTEE_FEATURE_KEYS } from '@/lib/mentee/access-policy';
import { getFeaturePlanLimit } from '@/lib/subscriptions/policy-runtime';
import { throwAsTRPCError } from '@/lib/trpc/router-error';

import {
  createTRPCRouter,
  menteeFeatureProcedure,
  protectedProcedure,
  publicProcedure,
} from '../init';

export const chatbotRouter = createTRPCRouter({
  listMessages: menteeFeatureProcedure(MENTEE_FEATURE_KEYS.aiChatUse)
    .input(
      z.object({
        chatSessionId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await listChatbotMessages(input.chatSessionId, ctx.userId);
      } catch (error) {
        throwAsTRPCError(error, 'Failed to fetch messages');
      }
    }),
  getMessageLimit: protectedProcedure.query(async ({ ctx }) => {
    try {
      const limit = await getFeaturePlanLimit({
        action: 'ai.chat.max_user_messages',
        userId: ctx.userId,
      });
      return { limit };
    } catch (error) {
      throwAsTRPCError(error, 'Failed to fetch message limit');
    }
  }),
  saveMessage: publicProcedure
    .input(
      z.object({
        chatSessionId: z.string().uuid(),
        senderType: z.enum(['user', 'ai', 'system']),
        content: z.string().trim().min(1),
        responseToMessageId: z.string().uuid().nullable().optional(),
        metadata: z.record(z.unknown()).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await saveChatbotMessage(
          ctx.req.headers,
          {
            chatSessionId: input.chatSessionId,
            senderType: input.senderType,
            content: input.content,
            metadata: input.metadata,
          },
          ctx.userId
        );
      } catch (error) {
        throwAsTRPCError(error, 'Failed to save message');
      }
    }),
});
