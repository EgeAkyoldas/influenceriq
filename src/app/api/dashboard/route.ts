import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const db = getDb();

    const totalProfiles = (db.prepare('SELECT COUNT(*) as count FROM profiles').get() as { count: number }).count;
    const analyzedProfiles = (db.prepare('SELECT COUNT(*) as count FROM analysis_results').get() as { count: number }).count;
    const activeResearch = db.prepare("SELECT COUNT(*) as count FROM research WHERE status IN ('pending', 'fetching', 'analyzing')").get() as { count: number };
    const recentResearch = db.prepare('SELECT * FROM research ORDER BY created_at DESC LIMIT 5').all();

    const clusterDistribution = db.prepare(`
      SELECT primary_cluster as cluster, COUNT(*) as count
      FROM analysis_results
      WHERE primary_cluster IS NOT NULL
      GROUP BY primary_cluster
    `).all();

    const tierDistribution = db.prepare(`
      SELECT tier, COUNT(*) as count
      FROM analysis_results
      WHERE tier IS NOT NULL
      GROUP BY tier
      ORDER BY tier
    `).all();

    const topProfiles = db.prepare(`
      SELECT p.username, p.followers_count, p.profile_pic_url, 
        a.authority_score, a.primary_cluster, a.tier
      FROM profiles p
      JOIN analysis_results a ON a.profile_id = p.id
      WHERE a.authority_score > 0
      ORDER BY a.authority_score DESC
      LIMIT 5
    `).all();

    return NextResponse.json({
      stats: {
        totalProfiles,
        analyzedProfiles,
        activeResearch: activeResearch.count,
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
