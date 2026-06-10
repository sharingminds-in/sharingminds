/**
 * LiveKit Recording Webhook Handler
 *
 * Receives notifications from LiveKit Egress when:
 * - Recording starts (egress_started)
 * - Recording completes (egress_ended)
 * - Recording fails (egress_failed)
 *
 * In the LiveKit Cloud implementation, Egress writes directly to object storage.
 * This webhook only verifies authenticity and syncs recording metadata/status.
 *
 * Security:
 * - Webhook signature validation via LiveKit WebhookReceiver
 * - Server-side only
 * - Comprehensive error handling
 * - Fail-loud approach
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  LivekitWebhookAuthError,
  LivekitWebhookPayloadError,
  verifyLivekitWebhook,
} from '@/lib/livekit/webhook';
import {
  normalizeEgressInfo,
  syncRecordingFromEgressEvent,
  type SupportedEgressEvent,
} from '@/lib/livekit/egress-event-sync';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface EgressWebhook {
  event: SupportedEgressEvent;
}

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    console.log('📥 Received Egress webhook');

    // ======================================================================
    // PARSE WEBHOOK PAYLOAD
    // ======================================================================
    let body: Record<string, unknown> & EgressWebhook;
    try {
      const rawBody = await verifyLivekitWebhook(request);
      body = JSON.parse(rawBody);
    } catch (error) {
      console.error('❌ Webhook verification failed:', error);
      if (error instanceof LivekitWebhookPayloadError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (error instanceof LivekitWebhookAuthError) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.json({ error: 'Webhook verification failed' }, { status: 401 });
    }

    console.log(`📋 Webhook event: ${body.event}`, {
      egressId:
        (body as any)?.egressInfo?.egressId ??
        (body as any)?.egress_info?.egress_id,
      roomName:
        (body as any)?.egressInfo?.roomName ??
        (body as any)?.egress_info?.room_name,
    });

    const egressInfo = normalizeEgressInfo(body);

    if (!body.event || !egressInfo) {
      console.error('❌ Invalid webhook payload:', body);
      return NextResponse.json(
        { error: 'Invalid webhook payload - missing event or egress info' },
        { status: 400 }
      );
    }

    // ======================================================================
    // HANDLE DIFFERENT EVENT TYPES
    // ======================================================================
    switch (body.event) {
      case 'egress_started':
      case 'egress_updated':
      case 'egress_ended':
      case 'egress_failed':
        await syncRecordingFromEgressEvent(body.event, egressInfo);
        break;

      default:
        console.log(`⏭️  Ignoring unknown event type: ${body.event}`);
    }

    return NextResponse.json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    console.error('❌ CRITICAL: Webhook handler error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 }
    );
  }
}
