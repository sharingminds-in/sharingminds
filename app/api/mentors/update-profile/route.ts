import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { requireMentor } from '@/lib/api/guards';
import { db } from '@/lib/db';
import { mentors } from '@/lib/db/schema';
import {
  extractStoragePath,
  normalizeStorageValue,
  storage,
  uploadBannerImage,
  uploadProfilePicture,
  uploadResume,
} from '@/lib/storage';
import { MentorLifecycleServiceError } from '@/lib/mentor/server/errors';
import { updateMentorProfile } from '@/lib/mentor/server/service';

function parseOptionalInteger(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseOptionalBoolean(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') {
    return undefined;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return undefined;
}

function parseOptionalString(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value : undefined;
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireMentor(request, true);
    if ('error' in guard) {
      return guard.error;
    }

    const contentType = request.headers.get('content-type');
    if (!contentType?.includes('multipart/form-data')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Multipart form data is required for mentor profile uploads',
        },
        { status: 415 }
      );
    }

    const formData = await request.formData();
    const userId = formData.get('userId');
    const sessionUserId = guard.session?.user.id;

    if (!sessionUserId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (typeof userId !== 'string' || !userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    if (userId !== sessionUserId) {
      return NextResponse.json(
        { success: false, error: 'You can only update your own mentor profile' },
        { status: 403 }
      );
    }

    const [existingMentor] = await db
      .select({
        id: mentors.id,
        profileImageUrl: mentors.profileImageUrl,
        bannerImageUrl: mentors.bannerImageUrl,
        resumeUrl: mentors.resumeUrl,
      })
      .from(mentors)
      .where(eq(mentors.userId, userId))
      .limit(1);

    if (!existingMentor) {
      return NextResponse.json(
        { success: false, error: 'Mentor profile not found' },
        { status: 404 }
      );
    }

    const profilePicture = formData.get('profilePicture');
    const bannerImage = formData.get('bannerImage');
    const resume = formData.get('resume');

    let nextProfileImageUrl = existingMentor.profileImageUrl;
    let nextBannerImageUrl = existingMentor.bannerImageUrl;
    let nextResumeUrl = existingMentor.resumeUrl;

    if (profilePicture instanceof File && profilePicture.size > 0) {
      if (existingMentor.profileImageUrl) {
        const oldPath = extractStoragePath(existingMentor.profileImageUrl);
        if (oldPath) {
          try {
            await storage.delete(oldPath);
          } catch (error) {
            console.warn('Could not delete old profile picture:', error);
          }
        }
      }

      const uploadResult = await uploadProfilePicture(profilePicture, userId);
      nextProfileImageUrl = uploadResult.path;
    }

    if (bannerImage instanceof File && bannerImage.size > 0) {
      if (existingMentor.bannerImageUrl) {
        const oldPath = extractStoragePath(existingMentor.bannerImageUrl);
        if (oldPath) {
          try {
            await storage.delete(oldPath);
          } catch (error) {
            console.warn('Could not delete old banner image:', error);
          }
        }
      }

      const uploadResult = await uploadBannerImage(bannerImage, userId);
      nextBannerImageUrl = uploadResult.path;
    }

    if (resume instanceof File && resume.size > 0) {
      if (existingMentor.resumeUrl) {
        const oldPath = extractStoragePath(existingMentor.resumeUrl);
        if (oldPath) {
          try {
            await storage.delete(oldPath);
          } catch (error) {
            console.warn('Could not delete old resume:', error);
          }
        }
      }

      const uploadResult = await uploadResume(resume, userId);
      nextResumeUrl = uploadResult.path;
    }

    const updatedMentor = await updateMentorProfile(userId, {
      fullName: parseOptionalString(formData.get('fullName')),
      email: parseOptionalString(formData.get('email')),
      phone: parseOptionalString(formData.get('phone')),
      title: parseOptionalString(formData.get('title')),
      company: parseOptionalString(formData.get('company')),
      city: parseOptionalString(formData.get('city')),
      state: parseOptionalString(formData.get('state')),
      country: parseOptionalString(formData.get('country')),
      industry: parseOptionalString(formData.get('industry')),
      expertise: parseOptionalString(formData.get('expertise')),
      experience: parseOptionalInteger(formData.get('experience')),
      about: parseOptionalString(formData.get('about')),
      linkedinUrl: parseOptionalString(formData.get('linkedinUrl')),
      githubUrl: parseOptionalString(formData.get('githubUrl')),
      websiteUrl: parseOptionalString(formData.get('websiteUrl')),
      hourlyRate: parseOptionalString(formData.get('hourlyRate')),
      currency: parseOptionalString(formData.get('currency')),
      availability: parseOptionalString(formData.get('availability')),
      headline: parseOptionalString(formData.get('headline')),
      maxMentees: parseOptionalInteger(formData.get('maxMentees')),
      profileImageUrl:
        profilePicture instanceof File && profilePicture.size > 0
          ? nextProfileImageUrl
          : normalizeStorageValue(parseOptionalString(formData.get('profileImageUrl'))) ??
            existingMentor.profileImageUrl,
      bannerImageUrl:
        bannerImage instanceof File && bannerImage.size > 0
          ? nextBannerImageUrl
          : normalizeStorageValue(parseOptionalString(formData.get('bannerImageUrl'))) ??
            existingMentor.bannerImageUrl,
      resumeUrl:
        resume instanceof File && resume.size > 0
          ? nextResumeUrl
          : normalizeStorageValue(parseOptionalString(formData.get('resumeUrl'))) ??
            existingMentor.resumeUrl,
      isAvailable: parseOptionalBoolean(formData.get('isAvailable')),
      searchMode:
        formData.get('searchMode') === 'EXCLUSIVE_SEARCH'
          ? 'EXCLUSIVE_SEARCH'
          : formData.get('searchMode') === 'AI_SEARCH'
            ? 'AI_SEARCH'
            : undefined,
    }, guard.user);

    return NextResponse.json({
      success: true,
      message: 'Mentor profile updated successfully',
      data: updatedMentor,
    });
  } catch (error) {
    console.error('Mentor profile update error:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to update mentor profile',
      },
      {
        status:
          error instanceof MentorLifecycleServiceError ? error.status : 500,
      }
    );
  }
}
