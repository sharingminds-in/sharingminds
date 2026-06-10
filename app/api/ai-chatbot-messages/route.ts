import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import {
  listChatbotMessages,
  saveChatbotMessage,
} from '@/lib/chatbot/server/message-service';
import { AppHttpError } from '@/lib/http/app-error';
import { nextErrorResponse } from '@/lib/http/next-response-error';

// GET: fetch all messages for a chat session
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const chatSessionId = searchParams.get('chatSessionId');
    if (!chatSessionId) {
      throw new AppHttpError(400, 'chatSessionId is required');
    }

    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      throw new AppHttpError(401, 'Authentication required');
    }

    const messages = await listChatbotMessages(chatSessionId, session.user.id);
    return NextResponse.json({ success: true, data: messages });
  } catch (error) {
    return nextErrorResponse(error, 'Failed to fetch messages');
  }
}

// POST: save a new message
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    const userId = session?.user?.id ?? null;

    const body = await request.json();
    const { chatSessionId, senderType, content, metadata } = body;
    if (!chatSessionId || !senderType || !content) {
      throw new AppHttpError(
        400,
        'chatSessionId, senderType, and content are required'
      );
    }

    const newMessage = await saveChatbotMessage(
      request.headers,
      {
        chatSessionId,
        senderType,
        content,
        metadata,
      },
      userId
    );

    return NextResponse.json({ success: true, data: newMessage });
  } catch (error) {
    return nextErrorResponse(error, 'Failed to save message');
  }
}
