import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getDb } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET || 'influencer-tracker-default-secret';
const TOKEN_EXPIRY = '7d';

export async function initDefaultUser() {
  const db = getDb();
  const username = process.env.AUTH_USERNAME || 'admin';
  const password = process.env.AUTH_PASSWORD || 'admin123';
  
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!existing) {
    const hash = await bcrypt.hash(password, 10);
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
  }
}

export async function authenticateUser(username: string, password: string): Promise<string | null> {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as { id: number; username: string; password_hash: string } | undefined;
  
  if (!user) return null;
  
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;

  const token = jwt.sign({ username: user.username, userId: user.id }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
  return token;
}

export function verifyToken(token: string): { username: string; userId: number } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { username: string; userId: number };
    return payload;
  } catch {
    return null;
  }
}

export function withAuth(handler: (req: NextRequest, user: { username: string; userId: number }) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    return handler(req, user);
  };
}
