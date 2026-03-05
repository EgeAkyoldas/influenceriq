import { getOne } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const research = await getOne('SELECT * FROM research WHERE id = ?', [Number(id)]);
    
    if (!research) {
      return NextResponse.json({ error: 'Research not found' }, { status: 404 });
    }

    return NextResponse.json(research);
  } catch (error) {
    console.error('Research fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch research' }, { status: 500 });
  }
}
