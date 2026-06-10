import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { MentorLifecycleServiceError } from '@/lib/mentor/server/errors';
import { uploadProfilePicture, uploadResume } from '@/lib/storage';
import { submitMentorApplication } from '@/lib/mentor/server/service';

const MAX_RESUME_SIZE = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    const sessionUserId = session?.user?.id;

    if (!sessionUserId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const submittedFormData = await request.formData();
    const rawFormSnapshot: Record<string, unknown> = {};

    for (const [key, value] of submittedFormData.entries()) {
      rawFormSnapshot[key] =
        value instanceof File
          ? value.size > 0
            ? { name: value.name, size: value.size, type: value.type }
            : null
          : value;
    }

    const userId = submittedFormData.get('userId');
    if (typeof userId !== 'string' || !userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    if (userId !== sessionUserId) {
      return NextResponse.json(
        { success: false, error: 'You can only submit your own application' },
        { status: 403 }
      );
    }

    const resume = submittedFormData.get('resume');
    if (resume instanceof File && resume.size > MAX_RESUME_SIZE) {
      return NextResponse.json(
        { success: false, error: 'Resume file size must be less than 5MB' },
        { status: 400 }
      );
    }

    let profileImageUrl: string | null = null;
    let resumeUrl: string | null = null;

    const profilePicture = submittedFormData.get('profilePicture');
    if (profilePicture instanceof File && profilePicture.size > 0) {
      try {
        const uploadResult = await uploadProfilePicture(profilePicture, userId);
        profileImageUrl = uploadResult.path;
      } catch (error) {
        return NextResponse.json(
          { success: false, error: 'Failed to upload profile picture' },
          { status: 400 }
        );
      }
    }

    if (resume instanceof File && resume.size > 0) {
      try {
        const uploadResult = await uploadResume(resume, userId);
        resumeUrl = uploadResult.path;
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            error: `Failed to upload resume: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          },
          { status: 400 }
        );
      }
    }

    const result = await submitMentorApplication({
      actorUserId: sessionUserId,
      userId,
      title:
        typeof submittedFormData.get('title') === 'string'
          ? (submittedFormData.get('title') as string)
          : null,
      company:
        typeof submittedFormData.get('company') === 'string'
          ? (submittedFormData.get('company') as string)
          : null,
      industry:
        typeof submittedFormData.get('industry') === 'string'
          ? (submittedFormData.get('industry') as string)
          : null,
      expertise:
        typeof submittedFormData.get('expertise') === 'string'
          ? (submittedFormData.get('expertise') as string)
          : null,
      experience:
        typeof submittedFormData.get('experience') === 'string' &&
        submittedFormData.get('experience') !== ''
          ? Number.parseInt(submittedFormData.get('experience') as string, 10)
          : null,
      hourlyRate:
        typeof submittedFormData.get('hourlyRate') === 'string'
          ? (submittedFormData.get('hourlyRate') as string)
          : null,
      currency:
        typeof submittedFormData.get('currency') === 'string'
          ? (submittedFormData.get('currency') as string)
          : null,
      headline:
        typeof submittedFormData.get('headline') === 'string'
          ? (submittedFormData.get('headline') as string)
          : null,
      about:
        typeof submittedFormData.get('about') === 'string'
          ? (submittedFormData.get('about') as string)
          : null,
      linkedinUrl:
        typeof submittedFormData.get('linkedinUrl') === 'string'
          ? (submittedFormData.get('linkedinUrl') as string)
          : null,
      githubUrl:
        typeof submittedFormData.get('githubUrl') === 'string'
          ? (submittedFormData.get('githubUrl') as string)
          : null,
      websiteUrl:
        typeof submittedFormData.get('websiteUrl') === 'string'
          ? (submittedFormData.get('websiteUrl') as string)
          : null,
      isAvailable: submittedFormData.get('isAvailable') !== 'false',
      fullName:
        typeof submittedFormData.get('fullName') === 'string'
          ? (submittedFormData.get('fullName') as string)
          : null,
      email:
        typeof submittedFormData.get('email') === 'string'
          ? (submittedFormData.get('email') as string)
          : null,
      phone:
        typeof submittedFormData.get('phone') === 'string'
          ? (submittedFormData.get('phone') as string)
          : null,
      city:
        typeof submittedFormData.get('city') === 'string'
          ? (submittedFormData.get('city') as string)
          : null,
      country:
        typeof submittedFormData.get('country') === 'string'
          ? (submittedFormData.get('country') as string)
          : null,
      state:
        typeof submittedFormData.get('state') === 'string'
          ? (submittedFormData.get('state') as string)
          : null,
      availability:
        typeof submittedFormData.get('availability') === 'string'
          ? (submittedFormData.get('availability') as string)
          : null,
      profileImageUrl,
      resumeUrl,
      rawFormSnapshot,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Mentor application error:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? `Failed to process mentor application: ${error.message}`
            : 'Failed to process mentor application',
      },
      {
        status:
          error instanceof MentorLifecycleServiceError ? error.status : 500,
      }
    );
  }
}
