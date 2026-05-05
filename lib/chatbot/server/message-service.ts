import { and, eq } from 'drizzle-orm';

import { assertMenteeFeatureAccess } from '@/lib/access-policy/server';
import { recordChatInsight } from '@/lib/chatbot/insights';
import { db } from '@/lib/db';
import { aiChatbotMessages } from '@/lib/db/schema';
import { AppHttpError } from '@/lib/http/app-error';
import { MENTEE_FEATURE_KEYS } from '@/lib/mentee/access-policy';
import { consumeFeature, enforceFeature, isSubscriptionPolicyError } from '@/lib/subscriptions/policy-runtime';

function getRequestIp(headers: Headers) {
  const forwardedFor = headers.get('x-forwarded-for');
  const realIp = headers.get('x-real-ip');
  const cfConnectingIp = headers.get('cf-connecting-ip');
  let ipAddress =
    cfConnectingIp || forwardedFor?.split(',')[0]?.trim() || realIp || 'unknown';

  if (ipAddress === '::1' || ipAddress === '127.0.0.1') {
    ipAddress = 'localhost';
  }

  return ipAddress;
}

async function assertChatbotFeatureAccess(userId: string) {
  await assertMenteeFeatureAccess({
    userId,
    feature: MENTEE_FEATURE_KEYS.aiChatUse,
    source: 'chatbot.messages',
  });
}

export async function listChatbotMessages(chatSessionId: string, userId: string) {
  await assertChatbotFeatureAccess(userId);

  return db
    .select()
    .from(aiChatbotMessages)
    .where(
      and(
        eq(aiChatbotMessages.chatSessionId, chatSessionId),
        eq(aiChatbotMessages.userId, userId)
      )
    )
    .orderBy(aiChatbotMessages.createdAt);
}

export async function saveChatbotMessage(
  headers: Headers,
  input: {
    chatSessionId: string;
    senderType: 'user' | 'ai' | 'system';
    content: string;
    metadata?: Record<string, unknown> | null;
  },
  userId: string | null
) {
  if (userId && input.senderType === 'user') {
    await assertChatbotFeatureAccess(userId);

    try {
      await enforceFeature({
        action: 'ai.chat.message',
        userId,
        failureMessage: 'Message limit reached',
      });
    } catch (error) {
      if (isSubscriptionPolicyError(error)) {
        if (error.status === 403) {
          // Hard limit reached — block the message
          throw new AppHttpError(
            403,
            typeof error.payload?.error === 'string'
              ? error.payload.error
              : 'Message limit reached'
          );
        }
        // 500 = metering infrastructure failure (misconfigured feature, DB error)
        // ai.chat.access already passed, so allow the message rather than blocking the user
        console.error('[chatbot] message metering check failed, allowing message through:', error.payload?.details);
      } else {
        throw error;
      }
    }
  }

  const [newMessage] = await db
    .insert(aiChatbotMessages)
    .values({
      chatSessionId: input.chatSessionId,
      userId: userId || null,
      senderType: input.senderType,
      content: input.content.trim(),
      metadata: input.metadata || null,
      ipAddress: getRequestIp(headers),
    })
    .returning();

  if (newMessage && input.senderType === 'user') {
    recordChatInsight({
      messageId: newMessage.id,
      chatSessionId: input.chatSessionId,
      userId: userId || null,
      content: newMessage.content,
    }).catch((error) => {
      console.error('[chatbot-insights] recording failed', error);
    });
  }

  if (userId && input.senderType === 'user') {
    await consumeFeature({
      action: 'ai.chat.message',
      userId,
      resourceType: 'chat_message',
      resourceId: newMessage.id,
    });
  }

  return newMessage;
}
