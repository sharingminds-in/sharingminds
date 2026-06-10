/**
 * Meeting Page - Server Component
 *
 * Handles authentication, centralized access validation, and join-window checks
 * before rendering the meeting room.
 */

import { Suspense, type ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

import { auth } from '@/lib/auth';
import { AppHttpError } from '@/lib/http/app-error';
import { livekitConfig } from '@/lib/livekit/config';
import { getMeetingJoinContext } from '@/lib/meetings/server/service';

import MeetingRoom from './MeetingRoom';

interface Props {
  params: Promise<{ sessionId: string }>;
}

export default async function MeetingPage({ params: paramsPromise }: Props) {
  const params = await paramsPromise;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect(`/auth/signin?callbackUrl=/meeting/${params.sessionId}`);
  }

  const userId = session.user.id;

  try {
    const meetingContext = await getMeetingJoinContext(params.sessionId, userId);

    return (
      <Suspense fallback={<LoadingScreen />}>
        <MeetingRoom
          sessionId={params.sessionId}
          userId={userId}
          userRole={meetingContext.userRole}
          sessionTitle={meetingContext.sessionTitle}
          otherParticipantName={meetingContext.otherParticipantName}
        />
      </Suspense>
    );
  } catch (error) {
    if (error instanceof AppHttpError) {
      return <MeetingStatePanel error={error} />;
    }

    throw error;
  }
}

function MeetingStatePanel({ error }: { error: AppHttpError }) {
  const state =
    typeof error.data?.state === 'string' ? error.data.state : 'unknown';
  const title =
    typeof error.data?.title === 'string' ? error.data.title : null;
  const scheduledAt =
    typeof error.data?.scheduledAt === 'string'
      ? new Date(error.data.scheduledAt)
      : null;
  const minutesUntil =
    typeof error.data?.minutesUntil === 'number' ? error.data.minutesUntil : null;

  switch (state) {
    case 'session_not_found':
      return (
        <MeetingMessageCard
          icon='❌'
          title='Session Not Found'
          description='This session does not exist or has been cancelled.'
        />
      );
    case 'meeting_access_denied':
      return (
        <MeetingMessageCard
          icon='🚫'
          title='Access Denied'
          description='You are not authorized to access this meeting. Only session participants can join.'
        />
      );
    case 'meeting_too_early':
      return (
        <MeetingMessageCard
          icon='⏰'
          title='Meeting Not Started Yet'
          description={
            <>
              {title ? (
                <p className='mb-4 text-gray-600'>
                  <strong>{title}</strong>
                </p>
              ) : null}
              {scheduledAt ? (
                <p className='mb-4 text-gray-600'>
                  Scheduled for:{' '}
                  <strong>
                    {scheduledAt.toLocaleString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </strong>
                </p>
              ) : null}
              <p className='text-sm text-gray-500'>
                You can join {livekitConfig.meeting.earlyJoinMinutes} minutes
                before the scheduled time
                {minutesUntil !== null ? ` (in ${minutesUntil} minutes).` : '.'}
              </p>
            </>
          }
        />
      );
    case 'meeting_expired':
      return (
        <MeetingMessageCard
          icon='⏱️'
          title='Meeting Has Ended'
          description={`Meetings are available for ${livekitConfig.meeting.lateJoinMaxHours} hours after the scheduled time.`}
        />
      );
    case 'meeting_room_not_ready':
      return (
        <MeetingMessageCard
          icon='⚠️'
          title='Meeting Room Not Ready'
          description='The meeting room for this session has not been created yet. Please contact support.'
        />
      );
    default:
      return (
        <MeetingMessageCard
          icon='🚫'
          title='Meeting Access Restricted'
          description={error.message}
        />
      );
  }
}

function MeetingMessageCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: ReactNode;
}) {
  return (
    <div className='flex min-h-screen items-center justify-center bg-gray-50'>
      <div className='max-w-md p-8 text-center'>
        <div className='mb-6 text-6xl'>{icon}</div>
        <h1 className='mb-4 text-3xl font-bold text-gray-900'>{title}</h1>
        <div className='mb-6 text-gray-600'>{description}</div>
        <a
          href='/dashboard'
          className='inline-block rounded-lg bg-blue-600 px-6 py-3 text-white transition hover:bg-blue-700'
        >
          Return to Dashboard
        </a>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className='flex min-h-screen items-center justify-center bg-gray-900'>
      <div className='text-center text-white'>
        <div className='relative mx-auto mb-6 h-20 w-20'>
          <div className='absolute inset-0 animate-spin rounded-full border-4 border-blue-600 border-t-transparent'></div>
        </div>
        <p className='text-lg font-medium'>Loading meeting room...</p>
        <p className='mt-2 text-sm text-gray-400'>
          Preparing your video connection
        </p>
      </div>
    </div>
  );
}
