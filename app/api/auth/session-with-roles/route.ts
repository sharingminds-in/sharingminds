import { NextRequest, NextResponse } from 'next/server';

import { getSessionWithRoles } from '@/lib/auth/server/session-with-roles';
import { nextErrorResponse } from '@/lib/http/next-response-error';

export async function GET(request: NextRequest) {
  try {
    const data = await getSessionWithRoles(request.headers);

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    return nextErrorResponse(error, 'Failed to fetch session');
  }
}
