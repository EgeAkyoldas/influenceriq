import { getOne, getAll } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const totalProfiles = ((await getOne<{ count: number }>('SELECT COUNT(*) as count FROM profiles')) ?? { count: 0 }).count;
    const analyzedProfiles = ((await getOne<{ count: number }>('SELECT COUNT(*) as count FROM analysis_results')) ?? { count: 0 }).count;
    const activeResearch = ((await getOne<{ count: number }>("SELECT COUNT(*) as count FROM research WHERE status IN ('pending', 'fetching', 'analyzing')")) ?? { count: 0 }).count;
    const recentResearch = await getAll('SELECT * FROM research ORDER BY created_at DESC LIMIT 5');

    const clusterDistribution = await getAll(`
      SELECT primary_cluster as cluster, COUNT(*) as count
      FROM analysis_results
      WHERE primary_cluster IS NOT NULL
      GROUP BY primary_cluster
    `);

    const tierDistribution = await getAll(`
      SELECT tier, COUNT(*) as count
      FROM analysis_results
      WHERE tier IS NOT NULL
      GROUP BY tier
      ORDER BY tier
    `);

    const topProfiles = await getAll(`
      SELECT p.username, p.followers_count, p.profile_pic_url, 
        a.authority_score, a.primary_cluster, a.tier
      FROM profiles p
      JOIN analysis_results a ON a.profile_id = p.id
      WHERE a.authority_score > 0
      ORDER BY a.authority_score DESC
      LIMIT 5
    `);

    return NextResponse.json({
      stats: {
        totalProfiles,
        analyzedProfiles,
        activeResearch,
      },
      recentResearch,
      clusterDistribution,
      tierDistribution,
      topProfiles,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard stats' }, { status: 500 });
  }
}
