import { NextRequest, NextResponse } from 'next/server';
import { getOne } from '@/lib/db';

/**
 * GET /api/avatars/[username]
 * Serves avatar images from DB storage (base64 → binary image response)
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  try {
    const { username } = await params;

    const profile = await getOne<{ avatar_data: string | null; profile_pic_url: string }>(
      `SELECT avatar_data, profile_pic_url FROM profiles WHERE username = ?`,
      [username]
    );

    if (!profile) {
      return new NextResponse(null, { status: 404 });
    }

    // If we have base64 avatar data, serve it as image
    if (profile.avatar_data) {
      const buffer = Buffer.from(profile.avatar_data, 'base64');
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
          'Content-Length': buffer.length.toString(),
        },
      });
    }

    // Fallback: redirect to original URL if no DB data
    // Skip Instagram CDN URLs (they expire with 403) and self-referencing /api/avatars/ URLs
    if (
      profile.profile_pic_url &&
      profile.profile_pic_url.startsWith('http') &&
      !profile.profile_pic_url.includes('cdninstagram.com') &&
      !profile.profile_pic_url.includes('instagram.com')
    ) {
      return NextResponse.redirect(profile.profile_pic_url);
    }

    return new NextResponse(null, { status: 404 });
  } catch (error) {
    console.error('Avatar serve error:', error);
    return new NextResponse(null, { status: 500 });
  }
}
