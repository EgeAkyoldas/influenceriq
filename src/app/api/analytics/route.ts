import { getAll } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const tierRows = await getAll<{ tier: string; count: number }>(`
      SELECT tier, COUNT(*) AS count FROM (
        SELECT COALESCE(v.editor_tier, v.tier, a.tier) AS tier
        FROM profiles p
        LEFT JOIN analysis_results a ON a.profile_id = p.id
        LEFT JOIN verified_profiles v ON v.profile_id = p.id
        WHERE a.tier IS NOT NULL
      )
      GROUP BY tier
      ORDER BY CASE tier WHEN 'S' THEN 0 WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 ELSE 5 END
    `);

    const clusterRows = await getAll<{ cluster: string; count: number }>(`
      SELECT a.primary_cluster AS cluster, COUNT(*) AS count
      FROM analysis_results a
      WHERE a.primary_cluster IS NOT NULL
      GROUP BY a.primary_cluster
      ORDER BY count DESC
    `);

    const comboRows = await getAll<{ primary_cluster: string; secondary_cluster: string; count: number }>(`
      SELECT
        a.primary_cluster,
        COALESCE(a.secondary_cluster, '') AS secondary_cluster,
        COUNT(*) AS count
      FROM analysis_results a
      WHERE a.primary_cluster IS NOT NULL
      GROUP BY a.primary_cluster, a.secondary_cluster
      ORDER BY count DESC
      LIMIT 16
    `);

    const followerRows = await getAll<{ bucket: string; count: number }>(`
      SELECT
        CASE
          WHEN p.followers_count < 1000    THEN '< 1K'
          WHEN p.followers_count < 5000    THEN '1K–5K'
          WHEN p.followers_count < 10000   THEN '5K–10K'
          WHEN p.followers_count < 25000   THEN '10K–25K'
          WHEN p.followers_count < 50000   THEN '25K–50K'
          WHEN p.followers_count < 100000  THEN '50K–100K'
          WHEN p.followers_count < 150000  THEN '100K–150K'
          ELSE '150K+'
        END AS bucket,
        COUNT(*) AS count,
        MIN(p.followers_count) AS bucket_min
      FROM profiles p
      LEFT JOIN analysis_results a ON a.profile_id = p.id
      WHERE a.tier IS NOT NULL
      GROUP BY bucket
      ORDER BY bucket_min
    `);

    const authorityRows = await getAll<{ bucket: string; count: number }>(`
      SELECT
        CASE
          WHEN a.authority_score < 2  THEN '0–2'
          WHEN a.authority_score < 4  THEN '2–4'
          WHEN a.authority_score < 6  THEN '4–6'
          WHEN a.authority_score < 8  THEN '6–8'
          ELSE '8–10'
        END AS bucket,
        COUNT(*) AS count,
        MIN(a.authority_score) AS bucket_min
      FROM analysis_results a
      WHERE a.authority_score IS NOT NULL
      GROUP BY bucket
      ORDER BY bucket_min
    `);

    const matrixRows = await getAll<{ tier: string; cluster: string; count: number }>(`
      SELECT tier, cluster, COUNT(*) AS count FROM (
        SELECT COALESCE(v.editor_tier, v.tier, a.tier) AS tier, a.primary_cluster AS cluster
        FROM profiles p
        LEFT JOIN analysis_results a ON a.profile_id = p.id
        LEFT JOIN verified_profiles v ON v.profile_id = p.id
        WHERE a.tier IS NOT NULL AND a.primary_cluster IS NOT NULL
      )
      GROUP BY tier, cluster
    `);

    return NextResponse.json({
      tiers: tierRows,
      clusters: clusterRows,
      combos: comboRows,
      followers: followerRows,
      authority: authorityRows,
      matrix: matrixRows,
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
  }
}
