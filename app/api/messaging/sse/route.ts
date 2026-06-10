import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { 
  messages,
  messageRequests,
  notifications,
} from '@/lib/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import {
  closeSSEConnection,
  createSSEConnectionState,
  enqueueSSEPayload,
} from '@/lib/messaging/sse-stream';
import { MESSAGING_ACCESS_INTENTS } from '@/lib/messaging/access-policy';
import { assertMessagingAccess } from '@/lib/access-policy/server';
import { nextErrorResponse } from '@/lib/http/next-response-error';

const activeConnections = new Map<
  string,
  ReturnType<typeof createSSEConnectionState>
>();

function createSSEMessage(data: any, eventType: string = 'message', id?: string) {
  const lines = [
    `event: ${eventType}`,
    `data: ${JSON.stringify(data)}`,
    id ? `id: ${id}` : '',
    '',
    ''
  ].filter(Boolean);
  
  return lines.join('\n');
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const providedLastEventId = searchParams.get('lastEventId');

  const session = await auth.api.getSession({ headers: request.headers });

  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    await assertMessagingAccess({
      userId,
      intent: MESSAGING_ACCESS_INTENTS.mailbox,
      source: 'route.messaging.sse',
    });
  } catch (error) {
    return nextErrorResponse(error, 'Unable to verify messaging access');
  }

  const lastEventId = providedLastEventId && !isNaN(Date.parse(providedLastEventId))
    ? providedLastEventId
    : new Date().toISOString();

  const encoder = new TextEncoder();
  let streamConnection: ReturnType<typeof createSSEConnectionState> | null = null;
  
  const stream = new ReadableStream({
    async start(controller) {
      const existingConnection = activeConnections.get(userId);
      if (existingConnection) {
        closeSSEConnection(existingConnection);
        activeConnections.delete(userId);
      }

      const connection = createSSEConnectionState({
        controller,
        lastEventId,
        userId,
      });
      streamConnection = connection;
      activeConnections.set(userId, connection);

      let pingInterval: ReturnType<typeof setInterval> | null = null;
      let updateInterval: ReturnType<typeof setInterval> | null = null;

      const cleanupConnection = () => {
        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }

        if (updateInterval) {
          clearInterval(updateInterval);
          updateInterval = null;
        }

        const activeConnection = activeConnections.get(userId);
        if (activeConnection === connection) {
          activeConnections.delete(userId);
        }

        closeSSEConnection(connection);
      };

      enqueueSSEPayload({
        connection,
        encoder,
        payload: createSSEMessage({
          type: 'connected',
          timestamp: new Date().toISOString()
        }, 'connection'),
        onClosed: cleanupConnection,
      });

      const sendPendingUpdates = async () => {
        try {
          const activeConnection = activeConnections.get(userId);
          if (activeConnection !== connection || connection.closed) {
            return;
          }

          const newMessages = await db
            .select()
            .from(messages)
            .where(
              and(
                eq(messages.receiverId, userId),
                gt(messages.createdAt, new Date(connection.lastEventId))
              )
            )
            .orderBy(messages.createdAt);

          for (const message of newMessages) {
            const eventData = {
              type: 'new_message',
              data: message,
              timestamp: message.createdAt.toISOString()
            };
            const eventId = message.createdAt
              ? message.createdAt.toISOString()
              : new Date().toISOString();

            if (
              !enqueueSSEPayload({
                connection,
                encoder,
                payload: createSSEMessage(eventData, 'message', eventId),
                eventId,
                onClosed: cleanupConnection,
              })
            ) {
              return;
            }
          }

          // Note: Message reactions feature can be added here later if needed

          const newRequests = await db
            .select()
            .from(messageRequests)
            .where(
              and(
                eq(messageRequests.recipientId, userId),
                eq(messageRequests.status, 'pending'),
                gt(messageRequests.createdAt, new Date(connection.lastEventId))
              )
            )
            .orderBy(messageRequests.createdAt);

          for (const request of newRequests) {
            const eventData = {
              type: 'new_request',
              data: request,
              timestamp: request.createdAt.toISOString()
            };
            const eventId = request.createdAt
              ? request.createdAt.toISOString()
              : new Date().toISOString();

            if (
              !enqueueSSEPayload({
                connection,
                encoder,
                payload: createSSEMessage(eventData, 'request', eventId),
                eventId,
                onClosed: cleanupConnection,
              })
            ) {
              return;
            }
          }

          const newNotifications = await db
            .select()
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, userId),
                eq(notifications.isRead, false),
                gt(notifications.createdAt, new Date(connection.lastEventId))
              )
            )
            .orderBy(notifications.createdAt);

          for (const notification of newNotifications) {
            const eventData = {
              type: 'notification',
              data: notification,
              timestamp: notification.createdAt.toISOString()
            };
            const eventId = notification.createdAt
              ? notification.createdAt.toISOString()
              : new Date().toISOString();

            if (
              !enqueueSSEPayload({
                connection,
                encoder,
                payload: createSSEMessage(eventData, 'notification', eventId),
                eventId,
                onClosed: cleanupConnection,
              })
            ) {
              return;
            }
          }

        } catch (error) {
          console.error('Error sending pending updates:', error);
        }
      };

      await sendPendingUpdates();

      pingInterval = setInterval(() => {
        const activeConnection = activeConnections.get(userId);
        if (activeConnection !== connection || connection.closed) {
          cleanupConnection();
          return;
        }

        try {
          enqueueSSEPayload({
            connection,
            encoder,
            payload: createSSEMessage({
              type: 'ping',
              timestamp: new Date().toISOString()
            }, 'ping'),
            onClosed: cleanupConnection,
          });
        } catch (error) {
          console.error('Error sending ping:', error);
          cleanupConnection();
        }
      }, 30000);

      updateInterval = setInterval(async () => {
        await sendPendingUpdates();
      }, 5000);

      request.signal.addEventListener('abort', cleanupConnection, { once: true });
    },

    cancel() {
      if (streamConnection) {
        const activeConnection = activeConnections.get(userId);
        if (activeConnection === streamConnection) {
          activeConnections.delete(userId);
        }
        closeSSEConnection(streamConnection);
      }
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export function broadcastToUser(userId: string, data: any, eventType: string = 'message') {
  const connection = activeConnections.get(userId);
  if (!connection || connection.closed) return;

  try {
    const encoder = new TextEncoder();
    const eventId = new Date().toISOString();

    if (
      !enqueueSSEPayload({
        connection,
        encoder,
        payload: createSSEMessage(data, eventType, eventId),
        eventId,
        onClosed: () => {
          const activeConnection = activeConnections.get(userId);
          if (activeConnection === connection) {
            activeConnections.delete(userId);
          }
        },
      })
    ) {
      return;
    }
  } catch (error) {
    console.error('Error broadcasting to user:', error);
    activeConnections.delete(userId);
  }
}
