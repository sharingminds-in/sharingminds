import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { requireAdmin } from '@/lib/api/guards';
import { db } from '@/lib/db';
import { AdminServiceError } from '@/lib/admin/server/errors';
import { createAdminMentorUser } from '@/lib/admin/server/service';

const MAX_RESUME_SIZE = 5 * 1024 * 1024;

function getRequiredString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function getOptionalString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if ('error' in guard) {
      return guard.error;
    }

    const contentType = request.headers.get('content-type');
    if (!contentType?.includes('multipart/form-data')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Multipart form data is required for mentor creation',
        },
        { status: 415 }
      );
    }

    const formData = await request.formData();
    const profilePicture = formData.get('profilePicture');
    const resume = formData.get('resume');

    if (!(profilePicture instanceof File) || profilePicture.size === 0) {
      return NextResponse.json(
        { success: false, error: 'Profile picture is required' },
        { status: 400 }
      );
    }

    if (resume instanceof File && resume.size > MAX_RESUME_SIZE) {
      return NextResponse.json(
        { success: false, error: 'Resume file size must be less than 5MB' },
        { status: 400 }
      );
    }

    const phoneCountryCode = getRequiredString(formData, 'phoneCountryCode');
    const phone = getRequiredString(formData, 'phone');
    const expertise = getRequiredString(formData, 'expertise')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const industry =
      getRequiredString(formData, 'industry') === 'Other'
        ? getRequiredString(formData, 'otherIndustry')
        : getRequiredString(formData, 'industry');

    const result = await createAdminMentorUser(
      {
        db,
        req: request,
        userId: guard.user.id,
        currentUser: guard.user,
      },
      {
        fullName: getRequiredString(formData, 'fullName'),
        email: getRequiredString(formData, 'email'),
        initialPassword: getRequiredString(formData, 'initialPassword'),
        phone: `+${phoneCountryCode}-${phone}`,
        title: getRequiredString(formData, 'title'),
        company: getRequiredString(formData, 'company'),
        industry,
        experience: Number.parseInt(
          getRequiredString(formData, 'experience'),
          10
        ),
        expertise,
        about: getOptionalString(formData, 'about'),
        linkedinUrl: getRequiredString(formData, 'linkedinUrl'),
        country: getRequiredString(formData, 'country'),
        state: getRequiredString(formData, 'state'),
        city: getRequiredString(formData, 'city'),
        availability: getRequiredString(formData, 'availability') as
          | 'Weekly'
          | 'BiWeekly'
          | 'Monthly'
          | 'AsNeeded',
      },
      {
        profilePicture,
        resume: resume instanceof File && resume.size > 0 ? resume : null,
      }
    );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: error.issues[0]?.message ?? 'Invalid mentor details',
          issues: error.issues,
        },
        { status: 400 }
      );
    }

    if (error instanceof AdminServiceError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: error.status }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to create mentor user',
      },
      { status: 500 }
    );
  }
}
