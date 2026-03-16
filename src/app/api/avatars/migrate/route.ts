import { NextResponse } from 'next/server';
import { getAll, execute } from '@/lib/db';
import fs from 'fs';
import path from 'path';

/**
 * POST /api/avatars/migrate
 * One-time migration: reads existing avatars from public/avatars/ and stores as base64 in DB
 */
export async function POST() {
  const avatarDir = path.join(process.cwd(), 'public', 'avatars');
  
  if (!fs.existsSync(avatarDir)) {
    return NextResponse.json({ message: 'No avatars directory found', migrated: 0 });
  }

  const files = fs.readdirSync(avatarDir).filter(f => f.endsWith('.jpg'));
  
  if (files.length === 0) {
    return NextResponse.json({ message: 'No avatar files found', migrated: 0 });
  }

  // Get all profiles that don't have avatar_data yet
  const profiles = await getAll<{ id: number; username: string }>(
    `SELECT id, username FROM profiles WHERE avatar_data IS NULL`
  );
  const profileMap = new Map(profiles.map(p => [p.username, p.id]));

  let migrated = 0;
  let skipped = 0;

  for (const file of files) {
    const username = file.replace('.jpg', '');
    
    if (!profileMap.has(username)) {
      skipped++;
      continue;
    }

    try {
      const filePath = path.join(avatarDir, file);
      const buffer = fs.readFileSync(filePath);
      const base64 = buffer.toString('base64');

      await execute(
        `UPDATE profiles SET avatar_data = ?, profile_pic_url = ? WHERE username = ?`,
        [base64, `/api/avatars/${username}`, username]
      );
      migrated++;
    } catch (err) {
      console.error(`Failed to migrate avatar for ${username}:`, err);
    }
  }

  return NextResponse.json({
    message: 'Avatar migration complete',
    total: files.length,
    migrated,
    skipped,
  });
}
