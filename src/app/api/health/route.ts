import { NextResponse } from 'next/server';
import { getOne } from '@/lib/db';

/**
 * GET /api/health
 * Quick diagnostic endpoint — checks Turso DB connectivity and env vars.
 * Use this to debug production issues.
 */
export async function GET() {
  const startMs = Date.now();
  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    env: {
      TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL ? `✅ set (${process.env.TURSO_DATABASE_URL.substring(0, 30)}...)` : '❌ NOT SET',
      TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN ? `✅ set (${process.env.TURSO_AUTH_TOKEN.substring(0, 8)}...)` : '❌ NOT SET',
      RAPIDAPI_KEY: process.env.RAPIDAPI_KEY ? '✅ set' : '❌ NOT SET',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ? '✅ set' : '❌ NOT SET',
      NODE_ENV: process.env.NODE_ENV || 'unknown',
    },
  };

  try {
    const result = await getOne<{ ok: number }>('SELECT 1 as ok');
    diagnostics.db = {
      status: result?.ok === 1 ? '✅ connected' : '❌ unexpected result',
      latencyMs: Date.now() - startMs,
    };

    // Check table counts
    const leads = await getOne<{ count: number }>('SELECT COUNT(*) as count FROM leads');
    const profiles = await getOne<{ count: number }>('SELECT COUNT(*) as count FROM profiles');
    const analysis = await getOne<{ count: number }>('SELECT COUNT(*) as count FROM analysis_results');

    diagnostics.tables = {
      leads: leads?.count ?? 0,
      profiles: profiles?.count ?? 0,
      analysis_results: analysis?.count ?? 0,
    };
  } catch (error) {
    diagnostics.db = {
      status: '❌ FAILED',
      error: (error as Error).message,
      stack: (error as Error).stack?.split('\n').slice(0, 5),
      latencyMs: Date.now() - startMs,
    };
  }

  diagnostics.totalLatencyMs = Date.now() - startMs;

  return NextResponse.json(diagnostics);
}
