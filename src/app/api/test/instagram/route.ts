import { NextRequest, NextResponse } from 'next/server';

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

// All possible business_discovery fields organized by category
const FIELD_CATEGORIES = {
  profile: {
    label: 'Profile Info',
    fields: ['id', 'username', 'name', 'biography', 'followers_count', 'follows_count', 'media_count', 'profile_picture_url', 'website', 'ig_id'],
  },
  media: {
    label: 'Recent Media (last 25)',
    fields: ['id', 'media_type', 'media_url', 'thumbnail_url', 'caption', 'like_count', 'comments_count', 'timestamp', 'permalink', 'media_product_type'],
  },
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username');
  const fieldsParam = searchParams.get('fields'); // comma-separated custom profile fields
  const mediaFieldsParam = searchParams.get('media_fields'); // comma-separated custom media fields
  const mediaLimit = searchParams.get('media_limit') || '25';

  if (!username) {
    return NextResponse.json({
      error: 'username query param required',
      available_fields: FIELD_CATEGORIES,
    }, { status: 400 });
  }

  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

  if (!token || !accountId) {
    return NextResponse.json({ error: 'Instagram API credentials not configured' }, { status: 500 });
  }

  const profileFields = fieldsParam || FIELD_CATEGORIES.profile.fields.join(',');
  const mediaFields = mediaFieldsParam || FIELD_CATEGORIES.media.fields.join(',');

  const results: Record<string, unknown> = {
    _meta: {
      queried_username: username,
      account_id: accountId,
      api_version: 'v21.0',
      timestamp: new Date().toISOString(),
      profile_fields_used: profileFields.split(','),
      media_fields_used: mediaFields.split(','),
      media_limit: Number(mediaLimit),
      available_field_categories: FIELD_CATEGORIES,
    },
  };

  // 1. business_discovery (main endpoint)
  try {
    const bdUrl = `${GRAPH_API_BASE}/${accountId}?fields=business_discovery.username(${encodeURIComponent(username)}){${profileFields},media.limit(${mediaLimit}){${mediaFields}}}&access_token=${token}`;
    const bdRes = await fetch(bdUrl);
    const bdData = await bdRes.json();

    if (bdData.error) {
      results.business_discovery = { _status: 'ERROR', error: bdData.error };
    } else {
      const bd = bdData.business_discovery;
      const media = bd?.media?.data || [];
      delete bd?.media;

      // Calculate engagement metrics
      const totalLikes = media.reduce((sum: number, m: { like_count?: number }) => sum + (m.like_count || 0), 0);
      const totalComments = media.reduce((sum: number, m: { comments_count?: number }) => sum + (m.comments_count || 0), 0);
      const avgLikes = media.length > 0 ? totalLikes / media.length : 0;
      const avgComments = media.length > 0 ? totalComments / media.length : 0;
      const engagementRate = bd?.followers_count > 0
        ? ((avgLikes + avgComments) / bd.followers_count) * 100
        : 0;

      results.business_discovery = {
        _status: 'OK',
        profile: bd,
        computed_metrics: {
          avg_likes_per_post: Math.round(avgLikes),
          avg_comments_per_post: Math.round(avgComments),
          engagement_rate_percent: Math.round(engagementRate * 100) / 100,
          total_media_fetched: media.length,
        },
        media: media.map((m: Record<string, unknown>, i: number) => ({
          _index: i + 1,
          ...m,
        })),
      };
    }
  } catch (err) {
    results.business_discovery = { _status: 'NETWORK_ERROR', error: (err as Error).message };
  }

  // 2. Direct ID query (if we got an ID from business_discovery)
  const discoveredId = (results.business_discovery as Record<string, unknown>)?._status === 'OK'
    ? ((results.business_discovery as Record<string, unknown>)?.profile as Record<string, unknown>)?.id
    : null;

  if (discoveredId) {
    try {
      const directUrl = `${GRAPH_API_BASE}/${discoveredId}?fields=id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website&access_token=${token}`;
      const directRes = await fetch(directUrl);
      const directData = await directRes.json();

      if (directData.error) {
        results.direct_profile = { _status: 'ERROR', _note: 'Direct query using discovered IG ID', error: directData.error };
      } else {
        results.direct_profile = { _status: 'OK', _note: 'Direct query using discovered IG ID', data: directData };
      }
    } catch (err) {
      results.direct_profile = { _status: 'NETWORK_ERROR', error: (err as Error).message };
    }
  }

  // 3. Permission info
  try {
    const permUrl = `${GRAPH_API_BASE}/me/permissions?access_token=${token}`;
    const permRes = await fetch(permUrl);
    const permData = await permRes.json();
    results.token_permissions = {
      _status: 'OK',
      _note: 'Current token permissions — add more in Graph API Explorer to unlock additional fields',
      permissions: permData.data,
    };
  } catch (err) {
    results.token_permissions = { _status: 'ERROR', error: (err as Error).message };
  }

  return NextResponse.json(results);
}
