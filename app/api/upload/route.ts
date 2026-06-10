import { NextRequest, NextResponse } from 'next/server';
import { requireMentor } from '@/lib/api/guards';
import { storage } from '@/lib/storage';
import { randomUUID } from 'crypto';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_TYPES = [
  // Video types
  'video/mp4', 'video/webm', 'video/quicktime', 'video/avi', 'video/x-msvideo',
  // Document types
  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Image types
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  // Text types
  'text/plain',
  // Extensions for fallback
  'mp4', 'webm', 'mov', 'avi', 'pdf', 'doc', 'docx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'txt'
];

const getFileExtension = (filename: string): string => {
  return filename.split('.').pop()?.toLowerCase() || '';
};

const generateFileName = (originalName: string, userId: string): string => {
  const timestamp = Date.now();
  const extension = getFileExtension(originalName);
  const cleanName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${userId}-${timestamp}-${cleanName}`;
};

export async function POST(request: NextRequest) {
  try {
    const guard = await requireMentor(request, true);
    if ('error' in guard) {
      return guard.error;
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string || 'content';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds 100MB limit' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_TYPES.includes(getFileExtension(file.name))) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}` },
        { status: 400 }
      );
    }

    const sessionUserId = guard.session?.user.id;
    if (!sessionUserId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Generate unique filename and path
    const fileName = generateFileName(file.name, sessionUserId);
    const storagePath = `mentors/content/${type}/${fileName}`;
    
    try {
      // Upload to Supabase storage
      const uploadResult = await storage.upload(file, storagePath, {
        maxSize: MAX_FILE_SIZE,
        allowedTypes: ALLOWED_TYPES,
        public: false,
      });
    
      return NextResponse.json({
        success: true,
        fileUrl: uploadResult.url,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        originalName: file.name,
        storagePath: uploadResult.path,
      }, { status: 201 });
      
    } catch (uploadError) {
      console.error('Storage upload error:', uploadError);
      
      // Try with more permissive content type for problematic files
      try {
        const fallbackResult = await storage.upload(file, storagePath, {
          maxSize: MAX_FILE_SIZE,
          public: false,
          contentType: 'application/octet-stream', // Fallback content type
        });
        
        return NextResponse.json({
          success: true,
          fileUrl: fallbackResult.url,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          originalName: file.name,
          storagePath: fallbackResult.path,
        }, { status: 201 });
        
      } catch (fallbackError) {
        console.error('Fallback upload also failed:', fallbackError);
        throw uploadError; // Throw original error
      }
    }
    
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}
