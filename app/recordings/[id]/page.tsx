/**
 * Recording Playback Page - Server Component
 *
 * Handles authentication and centralized recording access validation before
 * rendering the playback UI.
 */

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { auth } from '@/lib/auth';
import { AppHttpError } from '@/lib/http/app-error';
import { getRecordingPlaybackPageView } from '@/lib/recordings/server/service';

import RecordingPlayer from './RecordingPlayer';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RecordingPlaybackPage({ params }: Props) {
  const { id } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect(`/auth/signin?callbackUrl=/recordings/${id}`);
  }

  const userId = session.user.id;

  try {
    const recordingView = await getRecordingPlaybackPageView(id, userId);

    return (
      <div className='min-h-screen bg-gray-900'>
        <RecordingPlayer
          recordingId={id}
          sessionTitle={recordingView.sessionTitle}
          durationSeconds={recordingView.durationSeconds}
          fileSizeBytes={recordingView.fileSizeBytes}
          recordedAt={recordingView.recordedAt}
        />
      </div>
    );
  } catch (error) {
    if (error instanceof AppHttpError) {
      return <RecordingStatePanel error={error} recordingId={id} />;
    }

    throw error;
  }
}

function RecordingStatePanel({
  error,
  recordingId,
}: {
  error: AppHttpError;
  recordingId: string;
}) {
  const state =
    typeof error.data?.state === 'string' ? error.data.state : 'unknown';
  const errorMessage =
    typeof error.data?.errorMessage === 'string' ? error.data.errorMessage : null;
  const recordingStatus =
    typeof error.data?.recordingStatus === 'string'
      ? error.data.recordingStatus
      : null;

  switch (state) {
    case 'recording_not_found':
      return (
        <RecordingMessageCard
          icon='❌'
          title='Recording Not Found'
          description='This recording does not exist or has been deleted.'
        />
      );
    case 'recording_access_denied':
      return (
        <RecordingMessageCard
          icon='🚫'
          title='Access Denied'
          description={error.message}
        />
      );
    case 'recording_failed':
      return (
        <RecordingMessageCard
          icon='⚠️'
          title='Recording Failed'
          description={
            <>
              <p className='mb-4 text-gray-600'>
                This recording failed to process due to a technical error.
              </p>
              {errorMessage ? (
                <p className='mb-6 rounded bg-gray-100 p-3 font-mono text-sm text-gray-500'>
                  {errorMessage}
                </p>
              ) : null}
            </>
          }
        />
      );
    case 'recording_processing':
      return (
        <RecordingMessageCard
          icon='⏳'
          title='Recording Processing'
          description={
            <>
              <p className='mb-4 text-gray-600'>
                This recording is still being processed. Please check back in a
                few minutes.
              </p>
              <div className='mb-6 inline-flex items-center rounded-lg bg-blue-100 px-4 py-2 text-blue-800'>
                <div className='mr-3 h-4 w-4 animate-spin rounded-full border-b-2 border-blue-800'></div>
                <span className='font-medium'>
                  Status: {recordingStatus || 'processing'}
                </span>
              </div>
            </>
          }
          primaryHref={`/recordings/${recordingId}`}
          primaryLabel='Refresh Page'
        />
      );
    default:
      return (
        <RecordingMessageCard
          icon='⚠️'
          title='Unable to Load Recording'
          description={error.message}
        />
      );
  }
}

function RecordingMessageCard({
  icon,
  title,
  description,
  primaryHref = '/dashboard',
  primaryLabel = 'Return to Dashboard',
}: {
  icon: string;
  title: string;
  description: ReactNode;
  primaryHref?: string;
  primaryLabel?: string;
}) {
  return (
    <div className='flex min-h-screen items-center justify-center bg-gray-50'>
      <div className='max-w-md p-8 text-center'>
        <div className='mb-6 text-6xl'>{icon}</div>
        <h1 className='mb-4 text-3xl font-bold text-gray-900'>{title}</h1>
        <div className='mb-6'>{description}</div>
        <a
          href={primaryHref}
          className='inline-block rounded-lg bg-blue-600 px-6 py-3 text-white transition hover:bg-blue-700'
        >
          {primaryLabel}
        </a>
      </div>
    </div>
  );
}
