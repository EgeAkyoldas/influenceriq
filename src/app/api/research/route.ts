import { execute, getAll } from '@/lib/db';
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

    const result = await execute('INSERT INTO research (seed_type, seed_value, status) VALUES (?, ?, ?)', [seed_type, seed_value, 'pending']);
    const researchId = Number(result.lastInsertRowid);

    // Run pipeline async (don't await — return immediately)
    runResearchPipeline(researchId).catch(async (err) => {
      console.error('Pipeline error:', err);
      await execute('UPDATE research SET status = ?, error_message = ? WHERE id = ?', ['failed', err.message, researchId]);
    });

    return NextResponse.json({ id: researchId, status: 'pending' }, { status: 201 });
  } catch (error) {
    console.error('Research creation error:', error);
    return NextResponse.json({ error: 'Failed to create research' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const researches = await getAll('SELECT * FROM research ORDER BY created_at DESC LIMIT 50');
    return NextResponse.json(researches);
  } catch (error) {
    console.error('Research list error:', error);
    return NextResponse.json({ error: 'Failed to fetch researches' }, { status: 500 });
  }
}
