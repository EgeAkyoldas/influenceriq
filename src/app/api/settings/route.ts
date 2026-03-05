import { getAll, batch } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    const settings = await getAll<{ key: string; value: string }>('SELECT key, value FROM settings');
    const settingsObj: Record<string, string> = {};
    for (const s of settings) settingsObj[s.key] = s.value;
    return NextResponse.json(settingsObj);
  } catch (error) {
    console.error('Settings fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    
    const statements = Object.entries(body).map(([key, value]) => ({
      sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      args: [key, String(value)] as [string, string],
    }));

    await batch(statements);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Settings update error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
