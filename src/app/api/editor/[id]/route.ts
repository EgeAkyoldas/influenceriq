import { getOne, getAll, execute } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

interface EditorDecision {
  id: number;
  profile_id: number;
  username: string;
  previous_tier: string | null;
  new_tier: string;
  editor_reason: string;
  editor_note: string;
  ai_summary: string;
  created_at: string;
}

/* ─── GET: fetch decision log + current editor state for a profile ─── */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profileId = Number(id);

    const override = await getOne<{ editor_tier: string | null; editor_note: string | null }>(
      'SELECT editor_tier, editor_note FROM verified_profiles WHERE profile_id = ?',
      [profileId]
    );

    const logs = await getAll<EditorDecision>(
      'SELECT * FROM editor_decision_logs WHERE profile_id = ? ORDER BY created_at DESC LIMIT 20',
      [profileId]
    );

    return NextResponse.json({ override: override ?? null, logs });
  } catch (error) {
    console.error('Editor GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch editor data' }, { status: 500 });
  }
}

/* ─── POST: save a new editor decision ─── */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profileId = Number(id);

    const body = await req.json() as {
      new_tier: string;
      editor_reason: string;
      editor_note?: string;
      is_approved?: boolean | null;
      rejection_reason?: string;
    };

    const { new_tier, editor_reason, editor_note = '', is_approved, rejection_reason } = body;

    if (!new_tier || !['S', 'A', 'B', 'C', 'D'].includes(new_tier)) {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
    }
    if (!editor_reason?.trim()) {
      return NextResponse.json({ error: 'Reason is required' }, { status: 400 });
    }

    // Get profile for username + previous tier
    const profile = await getOne<{ username: string; current_tier: string }>(`
      SELECT p.username, COALESCE(v.editor_tier, v.tier, a.tier) as current_tier
      FROM profiles p
      LEFT JOIN verified_profiles v ON v.profile_id = p.id
      LEFT JOIN analysis_results a ON a.profile_id = p.id
      WHERE p.id = ?
    `, [profileId]);

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Log the decision
    await execute(`
      INSERT INTO editor_decision_logs (profile_id, username, previous_tier, new_tier, editor_reason, editor_note)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [profileId, profile.username, profile.current_tier || null, new_tier, editor_reason, editor_note]);

    // Update the editor override on verified_profiles
    await execute(`
      INSERT INTO verified_profiles (profile_id, tier, editor_tier, editor_note, is_approved, verified_at)
      VALUES (?, ?, ?, ?, 1, datetime('now'))
      ON CONFLICT(profile_id) DO UPDATE SET
        editor_tier = excluded.editor_tier,
        editor_note = excluded.editor_note
    `, [profileId, new_tier, new_tier, editor_note]);

    // If editor explicitly set approval, write to analysis_results too
    if (typeof is_approved === 'boolean') {
      await execute(`
        UPDATE analysis_results
        SET is_approved = ?, rejection_reason = ?
        WHERE profile_id = ?
      `, [is_approved ? 1 : 0, rejection_reason ?? null, profileId]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Editor POST error:', error);
    return NextResponse.json({ error: 'Failed to save decision' }, { status: 500 });
  }
}

/* ─── DELETE: clear the editor override (revert to AI tier) ─── */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await execute(
      'UPDATE verified_profiles SET editor_tier = NULL, editor_note = NULL WHERE profile_id = ?',
      [Number(id)]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to clear override' }, { status: 500 });
  }
}
