import { NextRequest } from 'next/server';

import { getInfinityAiServerConfig } from '@/lib/infinity-ai/config';

export function assertInfinityInternalRequest(request: NextRequest) {
  const config = getInfinityAiServerConfig();
  const headerSecret = request.headers.get('x-infinity-ai-internal-secret');

  if (!config.internalSecret || !headerSecret || headerSecret !== config.internalSecret) {
    throw new Error('Invalid Infinity AI internal secret');
  }
}

export function buildRequestOrigin(request: NextRequest) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
