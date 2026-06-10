import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { deleteUserMemoryItem } from '@/lib/infinity-ai/repository';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ memoryId: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { memoryId } = await context.params;
  const deleted = await deleteUserMemoryItem(session.user.id, memoryId);

  if (!deleted) {
    return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
