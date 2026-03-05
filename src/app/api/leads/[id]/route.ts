import { getOne, execute, type InValue } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const lead = await getOne(
      `SELECT l.*, p.followers_count, p.full_name, p.bio, p.profile_pic_url, p.media_count,
              a.primary_cluster, a.authority_score, a.relevance_score, a.tier, a.content_summary
       FROM leads l
       LEFT JOIN profiles p ON l.profile_id = p.id
       LEFT JOIN analysis_results a ON p.id = a.profile_id
       WHERE l.id = ?`,
      [id]
    );

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    return NextResponse.json(lead);
  } catch (error) {
    console.error('Lead detail error:', error);
    return NextResponse.json({ error: 'Failed to fetch lead' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { csv_niche, csv_followers_range, csv_hq_score, csv_hq, fetch_status } = body;

    const updates: string[] = [];
    const values: InValue[] = [];

    if (csv_niche !== undefined) { updates.push('csv_niche = ?'); values.push(csv_niche); }
    if (csv_followers_range !== undefined) { updates.push('csv_followers_range = ?'); values.push(csv_followers_range); }
    if (csv_hq_score !== undefined) { updates.push('csv_hq_score = ?'); values.push(csv_hq_score); }
    if (csv_hq !== undefined) { updates.push('csv_hq = ?'); values.push(csv_hq ? 1 : 0); }
    if (fetch_status !== undefined) { updates.push('fetch_status = ?'); values.push(fetch_status); }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updates.push("updated_at = datetime('now')");
    values.push(id);

    await execute(`UPDATE leads SET ${updates.join(', ')} WHERE id = ?`, values);
    const updated = await getOne('SELECT * FROM leads WHERE id = ?', [id]);

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Lead update error:', error);
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await execute('DELETE FROM leads WHERE id = ?', [id]);

    if (result.rowsAffected === 0) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('Lead delete error:', error);
    return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 });
  }
}
