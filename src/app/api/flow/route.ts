import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  const db = getDb();

  // Lead counts by status
  const leadStats = db.prepare(`
    SELECT fetch_status, COUNT(*) as count FROM leads GROUP BY fetch_status
  `).all() as Array<{ fetch_status: string; count: number }>;
  const totalLeads = leadStats.reduce((s, r) => s + r.count, 0);
  const statusMap = Object.fromEntries(leadStats.map(r => [r.fetch_status, r.count]));

  // Total unique leads (after dedup)
  const uniqueLeads = totalLeads;

  // Profiles fetched
  const profileCount = (db.prepare('SELECT COUNT(*) as c FROM profiles').get() as { c: number })?.c || 0;

  // Media count
  const mediaCount = (db.prepare('SELECT COUNT(*) as c FROM media').get() as { c: number })?.c || 0;
  const avgMediaPerProfile = profileCount > 0 ? Math.round(mediaCount / profileCount) : 0;

  // Analysis results
  const analysisCount = (db.prepare('SELECT COUNT(*) as c FROM analysis_results').get() as { c: number })?.c || 0;

  // Tier distribution
  const tierStats = db.prepare(`
    SELECT tier, COUNT(*) as count FROM analysis_results WHERE tier IS NOT NULL GROUP BY tier ORDER BY tier
  `).all() as Array<{ tier: string; count: number }>;

  // Cluster distribution
  const clusterStats = db.prepare(`
    SELECT primary_cluster, COUNT(*) as count FROM analysis_results WHERE primary_cluster IS NOT NULL GROUP BY primary_cluster ORDER BY count DESC
  `).all() as Array<{ primary_cluster: string; count: number }>;

  // Candidates (Tier A + B)
  const candidateCount = (db.prepare("SELECT COUNT(*) as c FROM analysis_results WHERE tier IN ('A', 'B')").get() as { c: number })?.c || 0;

  // Batch job + ETA
  const lastBatch = db.prepare('SELECT * FROM batch_jobs ORDER BY id DESC LIMIT 1').get() as {
    status: string; total_leads: number; processed: number; fetched: number; errors: number; unfetchable: number; started_at: string;
  } | undefined;

  let batchSubtitle = 'Idle';
  let etaText = '';

  if (lastBatch && lastBatch.status === 'running') {
    const remaining = lastBatch.total_leads - lastBatch.processed;
    // Calculate actual throughput from elapsed time
    let secPerLead = 5; // fallback: 5s rate limit
    if (lastBatch.started_at && lastBatch.processed > 0) {
      const elapsed = (Date.now() - new Date(lastBatch.started_at + 'Z').getTime()) / 1000;
      secPerLead = elapsed / lastBatch.processed;
    }
    const etaSec = Math.round(remaining * secPerLead);

    if (etaSec > 3600) {
      const h = Math.floor(etaSec / 3600);
      const m = Math.floor((etaSec % 3600) / 60);
      etaText = `~${h}h ${m}m remaining`;
    } else if (etaSec > 60) {
      const m = Math.floor(etaSec / 60);
      const s = etaSec % 60;
      etaText = `~${m}m ${s}s remaining`;
    } else {
      etaText = `~${etaSec}s remaining`;
    }

    batchSubtitle = `${lastBatch.processed}/${lastBatch.total_leads} — ${etaText}`;
  } else if (lastBatch) {
    batchSubtitle = `${lastBatch.status} (${lastBatch.processed}/${lastBatch.total_leads})`;
  }

  // Rate limiter info
  const rateLimitErrors = statusMap.error || 0;

  // Pre-filter pass rate
  const preFilterPassed = analysisCount;
  const preFilterTotal = profileCount;

  return NextResponse.json({
    nodes: {
      csv_import: { subtitle: `${totalLeads.toLocaleString()} rows` },
      url_parser: { subtitle: 'Clean & Extract' },
      deduplicator: { subtitle: `${uniqueLeads.toLocaleString()} unique` },
      leads_table: { subtitle: `${totalLeads.toLocaleString()} leads` },
      batch_engine: { subtitle: batchSubtitle },
      rate_limiter: { subtitle: '5s interval' },
      retry_logic: { subtitle: `${rateLimitErrors} retries` },
      instagram_api: { subtitle: `${profileCount} fetched` },
      profiles_table: { subtitle: `${profileCount.toLocaleString()} profiles` },
      media_table: { subtitle: `${mediaCount.toLocaleString()} posts (${avgMediaPerProfile}/profile)` },
      metrics_calc: { subtitle: `ER computed` },
      pre_filter: { subtitle: `${preFilterPassed}/${preFilterTotal} passed` },
      gemini_ai: { subtitle: `${analysisCount} analyzed` },
      classification: { subtitle: `${clusterStats.length} clusters` },
      analysis_results: { subtitle: `${analysisCount.toLocaleString()} results` },
      candidates: { subtitle: `${candidateCount} (A+B)` },
    },
    summary: {
      totalLeads,
      statusMap,
      profileCount,
      mediaCount,
      analysisCount,
      candidateCount,
      tierStats,
      clusterStats,
      batchStatus: lastBatch?.status || 'none',
    },
  });
}
