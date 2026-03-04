import { getDb } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { runResearchPipeline } from '@/lib/services/research-pipeline';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { seed_type, seed_value } = body;

    if (!seed_type || !seed_value) {
      return NextResponse.json({ error: 'seed_type and seed_value are required' }, { status: 400 });
    }

    if (!['username', 'csv'].includes(seed_type)) {
      return NextResponse.json({ error: 'seed_type must be "username" or "csv"' }, { status: 400 });
    }

    const db = getDb();
    const result = db.prepare('INSERT INTO research (seed_type, seed_value, status) VALUES (?, ?, ?)').run(seed_type, seed_value, 'pending');
    const researchId = result.lastInsertRowid as number;

    // Run pipeline async (don't await — return immediately)
    runResearchPipeline(researchId).catch(err => {
      console.error('Pipeline error:', err);
      db.prepare('UPDATE research SET status = ?, error_message = ? WHERE id = ?')
        .run('failed', err.message, researchId);
    });

    return NextResponse.json({ id: researchId, status: 'pending' }, { status: 201 });
  } catch (error) {
    console.error('Research creation error:', error);
    return NextResponse.json({ error: 'Failed to create research' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const db = getDb();
    const researches = db.prepare('SELECT * FROM research ORDER BY created_at DESC LIMIT 50').all();
    return NextResponse.json(researches);
  } catch (error) {
    console.error('Research list error:', error);
    return NextResponse.json({ error: 'Failed to fetch researches' }, { status: 500 });
  }
}
